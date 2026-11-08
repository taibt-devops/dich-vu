// Chạy lại đúng các bước trong docs/nhan-ban-trang-mau.md trên từng trang mẫu, rồi kiểm tra:
// website của khách sau khi nhân bản phải qua check-site và không còn nội dung giả định của trang mẫu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSite } from "../check-site.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const REPO_BASE = "https://taibt-devops.github.io/dich-vu/";
const CLIENT = "https://bienxanh.example/";
const DEMO_BLOCK = /[ \t]*<!-- DEMO:BẮT ĐẦU[\s\S]*?<!-- DEMO:KẾT THÚC -->\n/g; // giống lệnh perl trong docs

function cloneSample(t, loai, { keepCredit = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `nhan-ban-${loai}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "assets/css"), { recursive: true });
  mkdirSync(join(dir, "assets/js"), { recursive: true });
  mkdirSync(join(dir, "anh"), { recursive: true });
  // Bước 1: chép file, đổi ../../assets/ thành assets/
  copyFileSync(join(REPO, `mau/${loai}/favicon.svg`), join(dir, "favicon.svg"));
  copyFileSync(join(REPO, "assets/css/mau.css"), join(dir, "assets/css/mau.css"));
  copyFileSync(join(REPO, "assets/js/mau.js"), join(dir, "assets/js/mau.js"));
  let html = readFileSync(join(REPO, `mau/${loai}/index.html`), "utf8").replaceAll("../../assets/", "assets/");
  // Bước 2: xoá các khối DEMO (tuỳ chọn giữ dòng ghi công ở chân trang)
  html = html.replace(DEMO_BLOCK, (block) => (keepCredit && block.includes("foot-demo") ? block : ""));
  // Bước 7 (tối thiểu): tên miền của khách và ảnh xem trước
  html = html.replaceAll(`${REPO_BASE}mau/${loai}/og.png`, `${CLIENT}anh/og.png`).replaceAll(`${REPO_BASE}mau/${loai}/`, CLIENT);
  copyFileSync(join(REPO, `mau/${loai}/og.png`), join(dir, "anh/og.png"));
  writeFileSync(join(dir, "index.html"), html);
  return { dir, html };
}

for (const loai of ["homestay", "spa", "menu"]) {
  test(`nhân bản mẫu ${loai} theo hướng dẫn: qua check-site, không còn nội dung giả định`, async (t) => {
    const { dir, html } = cloneSample(t, loai);
    const { errors } = await checkSite(dir);
    assert.deepEqual(errors, []);
    assert.ok(!html.includes("noindex"), 'còn sót thẻ noindex: Google sẽ không index website của khách');
    // Thẻ <head> (title, description, og) được viết lại ở bước 7; ở đây kiểm tra phần khách nhìn thấy.
    const body = html.slice(html.indexOf("<body"));
    for (const leftover of ["demo-bar", "demo-note", "sample-tag", "giả định", "fictional", "가상", "Chào Khách", "../../"]) {
      assert.ok(!body.includes(leftover), `còn sót "${leftover}" trong <body> sau khi xoá khối DEMO`);
    }
  });
}

test("giữ dòng ghi công Chào Khách ở chân trang (docs cho phép) vẫn qua check-site", async (t) => {
  const { dir, html } = cloneSample(t, "homestay", { keepCredit: true });
  assert.ok(html.includes("foot-demo"));
  const { errors } = await checkSite(dir);
  assert.deepEqual(errors, []);
});
