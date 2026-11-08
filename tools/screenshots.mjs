#!/usr/bin/env node
// Chụp màn hình các trang ở 390px (điện thoại) và 1280px (máy tính) để soát bố cục,
// đồng thời báo lỗi khi:
//   - trang bị tràn ngang (phải cuộn ngang trên điện thoại)
//   - có lỗi JavaScript hoặc tài nguyên không tải được
//   - trang mẫu: ?lang=xx không đổi được ngôn ngữ, thiếu bản dịch, hoặc lộ chữ của ngôn ngữ khác
// Ảnh lưu ở .screenshots/ (không commit).
//
// Cách dùng: node tools/screenshots.mjs [trang ...]
//   ví dụ:   node tools/screenshots.mjs              (tất cả)
//            node tools/screenshots.mjs spa mau/menu/

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "./serve.mjs";
import { withChrome } from "./chrome.mjs";

const OUT = ".screenshots";
const LANGS = ["vi", "en", "ko"];
const PAGES = [
  { name: "dich-vu", path: "", file: "index.html" },
  { name: "homestay", path: "mau/homestay/", file: "mau/homestay/index.html", langs: LANGS },
  { name: "spa", path: "mau/spa/", file: "mau/spa/index.html", langs: LANGS },
  { name: "menu", path: "mau/menu/", file: "mau/menu/index.html", langs: LANGS },
  // Đường dẫn không tồn tại, nằm sâu 2 cấp: GitHub Pages trả 404.html tại chính URL này.
  { name: "404", path: "mau/khong-co/", file: "404.html", expect404: true },
];
const VIEWPORTS = [
  { width: 390, height: 844, chunk: 1400 },
  { width: 1280, height: 800, chunk: 1000 },
];

// Chạy trong trang: phần tử làm tràn ngang (tối đa 5).
const OVERFLOW_JS = `(() => {
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth <= vw + 1) return [];
  const name = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
    (el.classList.length ? "." + [...el.classList].join(".") : "");
  return [...document.body.querySelectorAll("*")]
    .filter((el) => el.getBoundingClientRect().right > vw + 1 && getComputedStyle(el).position !== "fixed")
    .slice(0, 5).map((el) => name(el) + " (right=" + Math.round(el.getBoundingClientRect().right) + "px)");
})()`;

// Chạy trong trang mẫu: nhóm thiếu bản dịch, và chữ của ngôn ngữ khác đang hiện.
const LANG_JS = `(() => {
  const langs = ${JSON.stringify(LANGS)};
  const current = document.documentElement.lang;
  const visible = (el) => el.getClientRects().length > 0;
  const name = (el) => el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().split(/\\s+/).join(".") : "");
  const snippet = (el) => (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40);
  const variants = [...document.body.querySelectorAll("[lang]")].filter((el) => langs.includes(el.lang) && el.tagName !== "BUTTON");
  const groups = new Set(variants.map((el) => el.parentElement));
  const missing = [...groups].map((g) => {
    const have = [...g.children].filter((c) => c.hasAttribute("lang")).map((c) => c.lang);
    const lack = langs.filter((l) => !have.includes(l));
    return lack.length ? name(g) + " thiếu " + lack.join("/") + ": \\"" + snippet(g) + "\\"" : null;
  }).filter(Boolean).slice(0, 10);
  const allowed = (el) => el.matches(".dish-name > [lang='vi']");
  const leaked = variants.filter((el) => el.lang !== current && visible(el) && !allowed(el))
    .slice(0, 10).map((el) => el.lang + ": \\"" + snippet(el) + "\\"");
  return { current, title: document.title, missing, leaked };
})()`;

async function main() {
  const filters = process.argv.slice(2).map((f) => f.replace(/^\/+/, ""));
  const pages = PAGES.filter((p) => !filters.length || filters.some((f) => f === p.name || f === p.path));
  const problems = [];
  const saved = [];

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const server = createServer(".");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;

  // Địa chỉ thật (canonical của index.html): request tới đó được trả bằng file trên máy,
  // nhờ vậy 404.html (dùng <base href> tuyệt đối) hiển thị đúng ngay cả trước khi deploy.
  const base = existsSync("index.html")
    ? readFileSync("index.html", "utf8").match(/<link rel="canonical" href="(https?:\/\/[^"]+)"/)?.[1]
    : null;

  try {
    await withChrome(async (browser) => {
      const page = await browser.newPage();
      if (base) await page.mapUrl(base.replace(/\/?$/, "/"), origin);
      for (const p of pages) {
        if (!existsSync(p.file)) {
          console.log(`⚠ Bỏ qua ${p.name}: chưa có ${p.file}`);
          continue;
        }
        for (const vp of VIEWPORTS) {
          const langs = p.langs && vp.width < 700 ? p.langs : p.langs ? ["vi"] : [null];
          for (const lang of langs) {
            const label = [p.name, vp.width, lang].filter(Boolean).join("-");
            const url = origin + p.path + (lang ? `?lang=${lang}` : "");
            await page.goto(url, vp);

            // Trang 404: chính tài liệu trả mã 404 là đúng ý, chỉ bỏ qua đúng lỗi đó.
            const issues = page.problems.filter((x) => !(p.expect404 && x.type === "network" && x.text.includes(url)));
            for (const x of issues) problems.push(`${label}: lỗi ${x.type}: ${x.text}`);

            const overflow = await page.evaluate(OVERFLOW_JS);
            if (overflow.length) problems.push(`${label}: tràn ngang — ${overflow.join(", ")}`);

            if (lang) {
              const info = await page.evaluate(LANG_JS);
              if (info.current !== lang) problems.push(`${label}: ?lang=${lang} nhưng <html lang="${info.current}">`);
              for (const m of info.missing) problems.push(`${label}: thiếu bản dịch — ${m}`);
              for (const l of info.leaked) problems.push(`${label}: đang hiện chữ ngôn ngữ khác — ${l}`);
            }

            const height = await page.evaluate("document.documentElement.scrollHeight");
            if (vp.width < 700) {
              const fold = join(OUT, `${label}-0-man-hinh-dau.png`);
              writeFileSync(fold, await page.screenshot());
              saved.push(fold);
            }
            // Ảnh toàn trang: ẩn phần tử position:fixed (như nút Zalo nổi), vì khi chụp vượt khung nhìn
            // chúng chỉ nằm ở màn hình đầu và che nội dung bên dưới. Ảnh màn hình đầu đã có chúng.
            await page.evaluate(`document.querySelectorAll("body *").forEach((el) => {
              if (getComputedStyle(el).position === "fixed") el.style.setProperty("visibility", "hidden", "important");
            })`);
            for (let y = 0, n = 1; y < height; y += vp.chunk, n++) {
              const file = join(OUT, `${label}-${n}.png`);
              const clip = { x: 0, y, width: vp.width, height: Math.min(vp.chunk, height - y) };
              writeFileSync(file, await page.screenshot({ clip }));
              saved.push(file);
            }
            console.log(`✔ ${label}: cao ${height}px`);
          }
        }
      }
      await page.close();
    });
  } finally {
    server.close();
  }

  console.log(`\n${saved.length} ảnh trong ${OUT}/`);
  if (problems.length) {
    console.error(`\n✖ ${problems.length} vấn đề:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
  } else {
    console.log("✔ Không phát hiện tràn ngang, lỗi JavaScript hay thiếu bản dịch.");
  }
}

await main();
