#!/usr/bin/env node
// Kiểm tra site tĩnh trước khi deploy — không cần thư viện ngoài.
//   - link nội bộ (href/src/srcset) trỏ tới file có thật, kể cả #anchor
//   - cấm đường dẫn bắt đầu bằng "/" (sẽ hỏng khi site chạy ở <user>.github.io/<repo>/)
//   - trang có đủ thẻ head: lang, description, canonical, Open Graph, favicon
//   - canonical và og:url khớp đường dẫn trang; og:image là PNG 1200×630 có thật
//   - sitemap.xml và robots.txt dùng đúng địa chỉ gốc; trang noindex không nằm trong sitemap
//   - đếm placeholder DIEN_... còn sót
// Địa chỉ gốc (BASE) lấy từ <link rel="canonical"> của index.html ở thư mục gốc.
//
// Cách dùng: node tools/check-site.mjs [--external] [thư-mục-gốc]
//   --external  kiểm tra thêm link ra ngoài (cần mạng; bỏ qua link còn placeholder)

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { isMain } from "./util.mjs";

const SKIP_DIRS = new Set(["node_modules", "_site"]);
const SKIP_SCHEME = /^(mailto|tel|sms|data|blob|javascript):/i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const PLACEHOLDER = /DIEN_[A-Z0-9_]+/g;
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const LINK_ATTRS = {
  a: ["href"],
  area: ["href"],
  link: ["href"],
  script: ["src"],
  img: ["src", "srcset"],
  source: ["src", "srcset"],
  iframe: ["src"],
  video: ["src", "poster"],
  audio: ["src"],
  track: ["src"],
  use: ["href", "xlink:href"],
};
// Gốc giả để tự resolve đường dẫn; nếu kết quả thoát khỏi tiền tố này là link đã đi ra ngoài site.
const FAKE_ORIGIN = "http://site.invalid";
const FAKE_ROOT = "/__site__/";

const toPosix = (p) => p.split(sep).join("/");

function walk(dir, root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, root, out);
    else if (entry.name.endsWith(".html")) out.push(toPosix(relative(root, full)));
  }
  return out;
}

const keepLines = (s) => s.replace(/[^\n]/g, " ");
const stripComments = (text) => text.replace(/<!--[\s\S]*?-->/g, keepLines);
const blankScriptsAndStyles = (text) =>
  text.replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi, (m, open, tag, inner, close) => open + keepLines(inner) + close);

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, entity) => {
    const e = entity.toLowerCase();
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    if (e in named) return named[e];
    return String.fromCodePoint(e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return (pos) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

// Thẻ mở: { name, attrs, line }. Đủ dùng cho HTML do mình viết (đã qua html-validate).
function parseTags(text) {
  const lineOf = lineIndex(text);
  const tags = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)(\s[^<>]*?)?\/?>/g;
  const attrRe = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = tagRe.exec(text))) {
    const attrs = {};
    const src = m[2] || "";
    let a;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(src))) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
    tags.push({ name: m[1].toLowerCase(), attrs, line: lineOf(m.index) });
  }
  return tags;
}

const relTokens = (tag) => (tag.attrs.rel || "").toLowerCase().split(/\s+/);

function pngSize(file) {
  try {
    const buf = readFileSync(file);
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (buf.length < 24 || !sig.every((b, i) => buf[i] === b) || buf.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

async function probe(url) {
  const headers = { "user-agent": "Mozilla/5.0 (compatible; check-site)" };
  let status = "?";
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetch(url, { method, redirect: "follow", headers, signal: AbortSignal.timeout(15000) });
      if (res.ok) return { ok: true, status: res.status };
      status = res.status;
    } catch (err) {
      status = err.name || "lỗi mạng";
    }
  }
  return { ok: false, status };
}

export async function checkSite(rootDir, { external = false } = {}) {
  const root = resolve(rootDir);
  const errors = [];
  const warnings = [];
  const placeholders = {};
  const externals = new Map(); // url → nơi xuất hiện đầu tiên
  let internalLinks = 0;

  const files = walk(root, root).sort();
  const pages = new Map();
  for (const rel of files) {
    const raw = readFileSync(join(root, rel), "utf8");
    const noComments = stripComments(raw);
    for (const token of noComments.match(PLACEHOLDER) || []) placeholders[token] = (placeholders[token] || 0) + 1;
    const tags = parseTags(blankScriptsAndStyles(noComments));
    const ids = new Set(tags.map((t) => t.attrs.id).filter(Boolean));
    const robots = tags.find((t) => t.name === "meta" && (t.attrs.name || "").toLowerCase() === "robots");
    pages.set(rel, { tags, ids, noindex: /noindex/i.test(robots?.attrs.content || "") });
  }

  const canonicalOf = (tags) => tags.find((t) => t.name === "link" && relTokens(t).includes("canonical"))?.attrs.href;
  const rootCanonical = pages.has("index.html") ? canonicalOf(pages.get("index.html").tags) : null;
  const BASE = rootCanonical && /^https?:\/\//.test(rootCanonical) ? rootCanonical.replace(/\/?$/, "/") : null;
  if (!BASE) errors.push('index.html: thiếu <link rel="canonical"> tuyệt đối — không xác định được địa chỉ gốc (BASE)');

  const isFile = (rel) => {
    const full = join(root, rel);
    return existsSync(full) && statSync(full).isFile();
  };

  // Đường dẫn trong site (đã decode, "" = gốc) → file cần tồn tại.
  const fileFor = (path) => {
    if (path === "" || path.endsWith("/")) return { file: `${path}index.html` };
    const full = join(root, path);
    if (existsSync(full) && statSync(full).isDirectory()) return { file: `${path}/index.html`, noSlash: true };
    return { file: path };
  };

  const idsOf = (rel) => {
    if (!pages.has(rel)) {
      const tags = parseTags(blankScriptsAndStyles(stripComments(readFileSync(join(root, rel), "utf8"))));
      pages.set(rel, { tags, ids: new Set(tags.map((t) => t.attrs.id).filter(Boolean)), noindex: false });
    }
    return pages.get(rel).ids;
  };

  // Trả về { external } | { skip } | { error } | { path, hash }.
  function resolveRef(rel, baseDir, ref) {
    if (ref === "") return { error: "link rỗng" };
    if (ref === "#") return { error: 'href="#" không trỏ tới đâu' };
    if (SKIP_SCHEME.test(ref)) return { skip: true };
    if (ref.startsWith("//")) return { external: `https:${ref}` };
    if (ANY_SCHEME.test(ref)) {
      if (BASE && (ref.startsWith(BASE) || ref === BASE.slice(0, -1))) ref = ref.slice(BASE.length);
      else return { external: ref };
      return resolveRef("index.html", "", ref || "./");
    }
    if (ref.startsWith("/")) {
      return { error: `"${ref}" bắt đầu bằng "/" — sẽ hỏng khi site chạy ở <user>.github.io/<repo>/; dùng đường dẫn tương đối` };
    }
    const docUrl = baseDir === null ? FAKE_ORIGIN + FAKE_ROOT + rel : FAKE_ORIGIN + FAKE_ROOT + baseDir;
    const url = new URL(ref, docUrl);
    if (url.origin !== FAKE_ORIGIN || !url.pathname.startsWith(FAKE_ROOT)) {
      return { error: `"${ref}" đi ra ngoài thư mục gốc của site` };
    }
    let path;
    try {
      path = decodeURIComponent(url.pathname.slice(FAKE_ROOT.length));
    } catch {
      return { error: `"${ref}" có ký tự mã hoá sai` };
    }
    return { path, hash: url.hash };
  }

  function checkHead(rel, tags) {
    const fail = (msg) => errors.push(`${rel}: ${msg}`);
    const meta = (attr, value) =>
      tags.find((t) => t.name === "meta" && (t.attrs[attr] || "").toLowerCase() === value)?.attrs.content;
    const html = tags.find((t) => t.name === "html");
    if (!html?.attrs.lang) fail("thiếu thuộc tính lang trên <html>");
    if (!meta("name", "description")) fail('thiếu <meta name="description">');
    for (const prop of ["og:title", "og:description", "og:type", "og:url", "og:image"]) {
      if (!meta("property", prop)) fail(`thiếu <meta property="${prop}">`);
    }
    if (!tags.some((t) => t.name === "link" && relTokens(t).includes("icon"))) fail('thiếu favicon (<link rel="icon">)');
    const canonical = canonicalOf(tags);
    if (!canonical) fail('thiếu <link rel="canonical">');
    if (BASE && canonical) {
      const expected = BASE + (rel.endsWith("index.html") ? rel.slice(0, -"index.html".length) : rel);
      if (canonical !== expected) fail(`canonical là ${canonical}, đúng ra phải là ${expected}`);
      const ogUrl = meta("property", "og:url");
      if (ogUrl && ogUrl !== canonical) fail(`og:url (${ogUrl}) khác canonical (${canonical})`);
    }
    const ogImage = meta("property", "og:image");
    if (ogImage && !/^https?:\/\//.test(ogImage)) {
      fail("og:image phải là URL tuyệt đối (Zalo/Facebook không đọc đường dẫn tương đối)");
    } else if (ogImage && BASE && ogImage.startsWith(BASE)) {
      const file = decodeURIComponent(ogImage.slice(BASE.length).split(/[?#]/)[0]);
      const size = pngSize(join(root, file));
      if (!size) fail(`og:image ${file} không tồn tại hoặc không phải PNG`);
      else if (size.width !== OG_WIDTH || size.height !== OG_HEIGHT) {
        fail(`og:image ${file} là ${size.width}×${size.height}, cần ${OG_WIDTH}×${OG_HEIGHT}`);
      }
    } else if (ogImage) {
      warnings.push(`${rel}: og:image trỏ ra ngoài site (${ogImage})`);
    }
  }

  for (const [rel, page] of [...pages].filter(([rel]) => files.includes(rel))) {
    const { tags } = page;
    if (!rel.startsWith("tools/")) checkHead(rel, tags);

    // <base href> tuyệt đối về BASE → mọi link tương đối trong trang tính từ thư mục tương ứng.
    let baseDir = null;
    const baseTag = tags.find((t) => t.name === "base" && t.attrs.href);
    if (baseTag) {
      const href = baseTag.attrs.href;
      if (BASE && href.startsWith(BASE)) baseDir = href.slice(BASE.length);
      else errors.push(`${rel}:${baseTag.line}: <base href="${href}"> không nằm dưới ${BASE}`);
    }

    for (const tag of tags) {
      const attrs = LINK_ATTRS[tag.name];
      if (!attrs) continue;
      if (tag.name === "link" && relTokens(tag).some((r) => r === "preconnect" || r === "dns-prefetch")) continue;
      for (const attr of attrs) {
        if (!(attr in tag.attrs)) continue;
        const value = tag.attrs[attr].trim();
        const refs = attr === "srcset" ? value.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean) : [value];
        for (const ref of refs) {
          const where = `${rel}:${tag.line}`;
          const r = resolveRef(rel, baseDir, ref);
          if (r.skip) continue;
          if (r.error) {
            errors.push(`${where}: ${r.error}`);
            continue;
          }
          if (r.external) {
            if (!externals.has(r.external)) externals.set(r.external, where);
            continue;
          }
          internalLinks++;
          const { file, noSlash } = fileFor(r.path);
          if (!isFile(file)) {
            errors.push(`${where}: link hỏng "${ref}" — không có file ${file}`);
            continue;
          }
          if (noSlash) warnings.push(`${where}: "${ref}" nên có dấu / ở cuối (tránh một lần chuyển hướng)`);
          const id = r.hash ? decodeURIComponent(r.hash.slice(1)) : "";
          if (id && file.endsWith(".html") && !idsOf(file).has(id)) {
            errors.push(`${where}: link "${ref}" — không có id="${id}" trong ${file}`);
          }
        }
      }
    }
  }

  const sitePages = files.filter((rel) => !rel.startsWith("tools/"));
  if (existsSync(join(root, "sitemap.xml"))) {
    const xml = readFileSync(join(root, "sitemap.xml"), "utf8");
    const listed = new Set();
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      const loc = decodeEntities(m[1]);
      if (!BASE || !loc.startsWith(BASE)) {
        errors.push(`sitemap.xml: ${loc} không bắt đầu bằng ${BASE}`);
        continue;
      }
      const { file } = fileFor(decodeURIComponent(loc.slice(BASE.length)));
      if (!isFile(file)) {
        errors.push(`sitemap.xml: ${loc} trỏ tới trang không tồn tại (${file})`);
        continue;
      }
      listed.add(file);
      if (pages.get(file)?.noindex) errors.push(`sitemap.xml: ${loc} là trang noindex — không được đưa vào sitemap`);
    }
    for (const rel of sitePages) {
      if (!pages.get(rel).noindex && !listed.has(rel) && rel !== "404.html") {
        warnings.push(`${rel}: trang được phép index nhưng chưa có trong sitemap.xml`);
      }
    }
  }

  if (existsSync(join(root, "robots.txt")) && BASE) {
    const declared = readFileSync(join(root, "robots.txt"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*sitemap:\s*(\S+)/i)?.[1])
      .filter(Boolean);
    if (declared.length === 0) warnings.push("robots.txt: chưa khai báo Sitemap");
    for (const url of declared) {
      if (url !== `${BASE}sitemap.xml`) errors.push(`robots.txt: Sitemap là ${url}, đúng ra phải là ${BASE}sitemap.xml`);
    }
  }

  if (external) {
    const queue = [...externals].filter(([url]) => !url.includes("DIEN_"));
    const workers = Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const [url, where] = queue.shift();
        const res = await probe(url);
        if (!res.ok) errors.push(`${where}: link ngoài lỗi ${res.status}: ${url}`);
      }
    });
    await Promise.all(workers);
  }

  return {
    errors,
    warnings,
    placeholders,
    stats: { pages: sitePages.length, files: files.length, internalLinks, externalLinks: externals.size },
  };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const external = args.includes("--external");
  const root = args.find((a) => !a.startsWith("--")) || ".";
  const result = await checkSite(root, { external });
  for (const w of result.warnings) console.log(`⚠ ${w}`);
  const left = Object.entries(result.placeholders);
  if (left.length) console.log(`⚠ Còn placeholder cần điền: ${left.map(([k, n]) => `${k} ×${n}`).join(", ")}`);
  for (const e of result.errors) console.error(`✖ ${e}`);
  const { pages, internalLinks, externalLinks } = result.stats;
  const summary = `${pages} trang, ${internalLinks} link nội bộ, ${externalLinks} link ngoài${external ? " (đã kiểm tra)" : ""}`;
  if (result.errors.length) {
    console.error(`✖ ${result.errors.length} lỗi — ${summary}`);
    process.exitCode = 1;
  } else {
    console.log(`✔ Không có lỗi — ${summary}`);
  }
}
