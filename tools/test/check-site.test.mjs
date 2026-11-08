// Test cho tools/check-site.mjs — mỗi test dựng một site nhỏ trong thư mục tạm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { checkSite } from "../check-site.mjs";

const BASE = "https://example.test/site/";

// PNG tối thiểu: chữ ký + chunk IHDR (check-site chỉ đọc kích thước trong IHDR).
function png(width, height) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf[24] = 8;
  buf[25] = 6;
  return buf;
}

// Trang có đủ thẻ head bắt buộc; `omit` bỏ một thẻ để thử báo lỗi.
function doc(canonical, body = "", { omit = [], head = "" } = {}) {
  const tags = [
    ["description", '<meta name="description" content="Mô tả">'],
    ["canonical", `<link rel="canonical" href="${canonical}">`],
    ["og:title", '<meta property="og:title" content="Tiêu đề">'],
    ["og:description", '<meta property="og:description" content="Mô tả">'],
    ["og:type", '<meta property="og:type" content="website">'],
    ["og:url", `<meta property="og:url" content="${canonical}">`],
    ["og:image", `<meta property="og:image" content="${BASE}assets/og.png">`],
    ["icon", `<link rel="icon" href="${BASE}assets/icon.svg">`],
  ]
    .filter(([name]) => !omit.includes(name))
    .map(([, tag]) => tag)
    .join("\n");
  return `<!DOCTYPE html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n<title>Trang</title>\n${tags}\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

const SITEMAP_BASE_ONLY = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${BASE}</loc></url>\n</urlset>\n`;

function makeSite(t, files) {
  const root = mkdtempSync(join(tmpdir(), "check-site-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const all = {
    "index.html": doc(BASE, '<h1 id="dau">Trang chủ</h1>'),
    "assets/og.png": png(1200, 630),
    "assets/icon.svg": '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    ...files,
  };
  for (const [rel, content] of Object.entries(all)) {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

test("site hợp lệ không có lỗi (mailto/tel/link ngoài được bỏ qua)", async (t) => {
  const root = makeSite(t, {
    "index.html": doc(
      BASE,
      '<h1 id="lien-he">Liên hệ</h1>\n<a href="mau/a/">A</a> <a href="#lien-he">x</a>\n' +
        '<a href="mailto:a@b.vn">m</a> <a href="tel:0900">t</a> <a href="https://zalo.me/123">z</a>\n' +
        '<link rel="stylesheet" href="assets/x.css">',
    ),
    "assets/x.css": "body{}",
    "mau/a/index.html": doc(
      `${BASE}mau/a/`,
      '<a href="../../">Về</a> <a href="../../#lien-he">LH</a> <img src="../../assets/icon.svg" alt="">',
      { head: '<meta name="robots" content="noindex">' },
    ),
    "sitemap.xml": SITEMAP_BASE_ONLY,
    "robots.txt": `User-agent: *\nAllow: /\nSitemap: ${BASE}sitemap.xml\n`,
  });
  const result = await checkSite(root);
  assert.deepEqual(result.errors, []);
});

test("báo link tương đối tới trang không tồn tại", async (t) => {
  const root = makeSite(t, { "index.html": doc(BASE, '<a href="mau/khong-co/">X</a>') });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /index\.html/);
  assert.match(errors[0], /mau\/khong-co\//);
});

test("báo #anchor không tồn tại trong cùng trang", async (t) => {
  const root = makeSite(t, { "index.html": doc(BASE, '<h2 id="co">A</h2><a href="#khong-co">X</a>') });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /#khong-co/);
});

test("báo #anchor không tồn tại ở trang khác", async (t) => {
  const root = makeSite(t, {
    "index.html": doc(BASE, '<a href="mau/a/#khong-co">X</a> <a href="mau/a/#co">Y</a>'),
    "mau/a/index.html": doc(`${BASE}mau/a/`, '<h2 id="co">A</h2>'),
  });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /mau\/a\/#khong-co/);
});

test("link tuyệt đối về BASE được kiểm như link nội bộ", async (t) => {
  const root = makeSite(t, {
    "index.html": doc(BASE, `<a href="${BASE}mau/a/">OK</a> <a href="${BASE}khong-co.html">Hỏng</a>`),
    "mau/a/index.html": doc(`${BASE}mau/a/`),
  });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /khong-co\.html/);
});

test("báo link bắt đầu bằng / vì sẽ hỏng khi site chạy ở /<repo>/", async (t) => {
  const root = makeSite(t, {
    "index.html": doc(BASE, '<a href="/mau/a/">X</a>'),
    "mau/a/index.html": doc(`${BASE}mau/a/`),
  });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\/mau\/a\//);
});

test("link ../ đi ra ngoài thư mục gốc bị báo lỗi (lỗi hay gặp khi nhân bản trang mẫu)", async (t) => {
  const root = makeSite(t, {
    "index.html": doc(BASE, '<link rel="stylesheet" href="../../assets/x.css">'),
    "assets/x.css": "body{}",
  });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\.\.\/\.\.\/assets\/x\.css/);
  assert.match(errors[0], /ra ngoài thư mục gốc/);
});

test("trang thiếu meta description bị báo lỗi, file trong tools/ được miễn", async (t) => {
  const root = makeSite(t, {
    "index.html": doc(BASE, "", { omit: ["description"] }),
    "tools/og/x.html": '<!DOCTYPE html>\n<html lang="vi">\n<head><title>OG</title></head>\n<body></body>\n</html>\n',
  });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /index\.html/);
  assert.match(errors[0], /description/);
});

test("bỏ qua link nằm trong comment HTML", async (t) => {
  const root = makeSite(t, {
    "index.html": doc(BASE, '<!-- ví dụ: <a href="khong-co.html">x</a> -->\n<a href="that-su-hong.html">y</a>'),
  });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /that-su-hong\.html/);
});

test("trang có <base href> tuyệt đối: link tương đối tính từ gốc site", async (t) => {
  const root = makeSite(t, {
    "assets/x.css": "body{}",
    "sub/trang.html": doc(`${BASE}sub/trang.html`, '<a href="#dau">Về đầu trang chủ</a> <a href="khong-co.css">x</a>', {
      head: `<base href="${BASE}">\n<link rel="stylesheet" href="assets/x.css">`,
    }),
  });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /khong-co\.css/);
});

test("sitemap trỏ tới trang không tồn tại bị báo lỗi", async (t) => {
  const root = makeSite(t, {
    "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${BASE}</loc></url>\n<url><loc>${BASE}khong-co/</loc></url>\n</urlset>\n`,
  });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sitemap\.xml/);
  assert.match(errors[0], /khong-co\//);
});

test("trang noindex không được nằm trong sitemap", async (t) => {
  const root = makeSite(t, {
    "mau/a/index.html": doc(`${BASE}mau/a/`, "", { head: '<meta name="robots" content="noindex">' }),
    "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${BASE}</loc></url>\n<url><loc>${BASE}mau/a/</loc></url>\n</urlset>\n`,
  });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /noindex/);
});

test("og:image sai kích thước bị báo lỗi", async (t) => {
  const root = makeSite(t, { "assets/og.png": png(800, 600) });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /1200×630/);
  assert.match(errors[0], /800×600/);
});

test("canonical không khớp đường dẫn trang bị báo lỗi", async (t) => {
  const root = makeSite(t, { "mau/a/index.html": doc(BASE) });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /mau\/a\/index\.html/);
  assert.match(errors[0], /canonical/);
});

test("robots.txt khai báo Sitemap khác BASE bị báo lỗi", async (t) => {
  const root = makeSite(t, { "robots.txt": "User-agent: *\nSitemap: https://ten-mien-cu.vn/sitemap.xml\n" });
  const { errors } = await checkSite(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /robots\.txt/);
});

test("đếm placeholder DIEN_ còn sót (không tính trong comment)", async (t) => {
  const root = makeSite(t, {
    "index.html": doc(
      BASE,
      '<a href="https://zalo.me/DIEN_SO_ZALO">Zalo</a> <a href="tel:DIEN_SO_ZALO">Gọi</a>\n' +
        '<a href="mailto:DIEN_EMAIL">Email</a> <!-- thay DIEN_SO_ZALO bằng số thật -->',
    ),
  });
  const result = await checkSite(root);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.placeholders, { DIEN_SO_ZALO: 2, DIEN_EMAIL: 1 });
});
