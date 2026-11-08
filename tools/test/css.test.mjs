// Kiểm tra CSS theo quy ước của dự án.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FILES = ["assets/css/mau.css", "assets/css/dich-vu.css"].map((f) => new URL(`../../${f}`, import.meta.url));

// Bỏ comment và mọi khối @supports (...) { ... } (đếm ngoặc), giữ phần còn lại.
function outsideSupports(css) {
  let src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  while (i < src.length) {
    const at = src.indexOf("@supports", i);
    if (at === -1) {
      out += src.slice(i);
      break;
    }
    out += src.slice(i, at);
    let depth = 0;
    let j = src.indexOf("{", at);
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}" && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
}

// Safari 15 (iPhone đời cũ, cả trình duyệt trong app Zalo) không hiểu color-mix(): khai báo chứa var()
// trở thành không hợp lệ lúc tính giá trị và rơi về giá trị mặc định (ví dụ header trong suốt), chứ không
// dùng dòng dự phòng phía trên. Vì vậy color-mix() chỉ được nằm trong @supports.
test("color-mix() chỉ dùng bên trong @supports, ngoài đó phải có màu dự phòng thường", () => {
  for (const file of FILES) {
    const css = readFileSync(file, "utf8");
    assert.doesNotMatch(outsideSupports(css), /color-mix\(/, file.pathname);
  }
});
