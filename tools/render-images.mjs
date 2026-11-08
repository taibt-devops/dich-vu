#!/usr/bin/env node
// Tạo ảnh PNG từ nguồn HTML/SVG bằng Chrome headless (ảnh tự vẽ, không dùng ảnh có bản quyền):
//   tools/og/<tên>.html   → ảnh xem trước khi gửi link qua Zalo/Facebook (1200×630)
//   tools/og/icon.html    → assets/img/apple-touch-icon.png (180×180, nền đặc cho iPhone)
//   assets/img/favicon.svg → favicon.ico (16, 32, 48 px) ở thư mục gốc
// Cách dùng: node tools/render-images.mjs        (chạy lại mỗi khi sửa nguồn trong tools/og/)

import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "./serve.mjs";
import { withChrome } from "./chrome.mjs";

const OG = [
  { source: "tools/og/dich-vu.html", out: "assets/img/og.png" },
  { source: "tools/og/homestay.html", out: "mau/homestay/og.png" },
  { source: "tools/og/spa.html", out: "mau/spa/og.png" },
  { source: "tools/og/menu.html", out: "mau/menu/og.png" },
];
const TOUCH_ICON = { source: "tools/og/icon.html", out: "assets/img/apple-touch-icon.png", size: 180 };
const FAVICON = { source: "assets/img/favicon.svg", out: "favicon.ico", sizes: [16, 32, 48] };

// Gói các ảnh PNG vào một file .ico (định dạng ICO cho phép nhúng PNG trực tiếp).
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.png)]);
}

async function main() {
  const server = createServer(".");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  try {
    await withChrome(async (browser) => {
      const page = await browser.newPage();
      const render = async (source, out, width, height, opts = {}) => {
        if (!existsSync(source)) {
          console.log(`⚠ Bỏ qua ${out}: chưa có ${source}`);
          return null;
        }
        await page.goto(origin + source, { width, height, mobile: false, ...opts });
        const bad = page.problems.filter((p) => p.type !== "console");
        if (bad.length) throw new Error(`${source}: ${bad.map((p) => p.text).join("; ")}`);
        const png = await page.screenshot();
        if (out) {
          writeFileSync(out, png);
          console.log(`✔ ${out} (${width}×${height}, ${Math.round(png.length / 1024)} KB)`);
        }
        return png;
      };

      for (const { source, out } of OG) await render(source, out, 1200, 630);
      await render(TOUCH_ICON.source, TOUCH_ICON.out, TOUCH_ICON.size, TOUCH_ICON.size);

      const images = [];
      for (const size of FAVICON.sizes) {
        const png = await render(FAVICON.source, null, size, size, { transparent: true });
        if (png) images.push({ size, png });
      }
      if (images.length) {
        const data = ico(images);
        writeFileSync(FAVICON.out, data);
        console.log(`✔ ${FAVICON.out} (${FAVICON.sizes.join(", ")} px, ${Math.round(data.length / 1024)} KB)`);
      }
      await page.close();
    });
  } finally {
    server.close();
  }
}

await main();
