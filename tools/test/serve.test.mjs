// Test cho tools/serve.mjs — server xem thử trên máy phải hành xử giống GitHub Pages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createServer } from "../serve.mjs";

function makeSite(t) {
  const dir = mkdtempSync(join(tmpdir(), "serve-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = {
    "site/index.html": "<p>TRANG CHU</p>",
    "site/404.html": "<p>KHONG TIM THAY</p>",
    "site/mau/a/index.html": "<p>TRANG A</p>",
    "site/assets/x.css": "body{}",
    "site/assets/i.svg": "<svg></svg>",
    "site/assets/a.png": "png",
    "secret.txt": "BI MAT",
  };
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return join(dir, "site");
}

async function start(t, root) {
  const server = createServer(root);
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise((done) => server.close(done)));
  const { port } = server.address();
  return (path) => fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual" });
}

test("thư mục trả về index.html (kể cả khi có query string)", async (t) => {
  const get = await start(t, makeSite(t));
  for (const path of ["/", "/?lang=ko"]) {
    const res = await get(path);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^text\/html/);
    assert.equal(await res.text(), "<p>TRANG CHU</p>");
  }
  const sub = await get("/mau/a/");
  assert.equal(await sub.text(), "<p>TRANG A</p>");
});

test("thư mục thiếu / ở cuối được chuyển hướng 301, giữ query string", async (t) => {
  const get = await start(t, makeSite(t));
  const res = await get("/mau/a?lang=en");
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "/mau/a/?lang=en");
});

test("đường dẫn không tồn tại trả nội dung 404.html với mã 404", async (t) => {
  const get = await start(t, makeSite(t));
  const res = await get("/mau/khong-co/trang");
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "<p>KHONG TIM THAY</p>");
});

test("Content-Type đúng theo đuôi file", async (t) => {
  const get = await start(t, makeSite(t));
  const cases = [
    ["/assets/x.css", /^text\/css/],
    ["/assets/i.svg", /^image\/svg\+xml/],
    ["/assets/a.png", /^image\/png/],
  ];
  for (const [path, type] of cases) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get("content-type"), type, path);
  }
});

test("không cho đọc file nằm ngoài thư mục gốc", async (t) => {
  const get = await start(t, makeSite(t));
  for (const path of ["/..%2fsecret.txt", "/%2e%2e/secret.txt", "/mau/..%2f..%2f..%2fsecret.txt"]) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.doesNotMatch(await res.text(), /BI MAT/, path);
  }
});
