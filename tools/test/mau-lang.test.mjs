// Test cho assets/js/mau.js (chuyển ngôn ngữ trang mẫu): chạy đúng file script trong node:vm
// với một DOM giả tối thiểu, rồi kiểm tra kết quả nhìn thấy được (lang, tiêu đề, nút, lựa chọn đã lưu).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../assets/js/mau.js", import.meta.url), "utf8");
const KEY = "chaokhach-lang";
const TITLES = {
  vi: "Gió Nồm Homestay – gần biển Mỹ Khê",
  en: "Gió Nồm Homestay – near My Khe Beach",
  ko: "Gió Nồm Homestay – 미케 비치 근처",
};

class FakeButton {
  constructor(lang) {
    this.dataset = { lang };
    this.attributes = {};
    this.listeners = [];
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }
  addEventListener(type, fn) {
    if (type === "click") this.listeners.push(fn);
  }
  click() {
    for (const fn of this.listeners) fn({ currentTarget: this, target: this, preventDefault() {} });
  }
}

// Dựng "trình duyệt" giả và chạy mau.js. storage: "ok" | "throws" (bị chặn) | "missing" (không có).
function load({ search = "", stored, languages = [], storage = "ok", readyState = "loading" } = {}) {
  const store = new Map(stored === undefined ? [] : [[KEY, stored]]);
  // Bắt đầu với lang rỗng: script phải tự đặt ngôn ngữ, kể cả khi chọn tiếng Việt.
  const html = {
    lang: "",
    setAttribute(name, value) {
      if (name === "lang") this.lang = String(value);
    },
  };
  const titleEl = { textContent: TITLES.vi, dataset: { en: TITLES.en, ko: TITLES.ko } };
  const buttons = ["vi", "en", "ko"].map((lang) => new FakeButton(lang));
  const onReady = [];
  const document = {
    documentElement: html,
    readyState,
    title: TITLES.vi,
    querySelector: (selector) => (selector === "title" ? titleEl : null),
    querySelectorAll: (selector) => (selector.includes("data-lang") ? buttons : []),
    addEventListener: (type, fn) => {
      if (type === "DOMContentLoaded") onReady.push(fn);
    },
  };
  const win = { document, location: { search }, navigator: { languages, language: languages[0] } };
  if (storage === "ok") {
    win.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    };
  } else if (storage === "throws") {
    Object.defineProperty(win, "localStorage", {
      get() {
        throw new Error("SecurityError: The operation is insecure.");
      },
    });
  }
  win.window = win;
  vm.runInNewContext(SOURCE, win);
  return {
    html,
    document,
    store,
    buttons,
    ready: () => onReady.forEach((fn) => fn()),
    pressed: () => buttons.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.lang),
    click: (lang) => buttons.find((b) => b.dataset.lang === lang).click(),
  };
}

test("mặc định tiếng Việt khi không có ?lang, lựa chọn đã lưu hay ngôn ngữ trình duyệt", () => {
  const page = load();
  assert.equal(page.html.lang, "vi");
  assert.equal(page.document.title, TITLES.vi);
});

test("?lang=ko trên URL thắng lựa chọn đã lưu", () => {
  const page = load({ search: "?lang=ko", stored: "en", languages: ["vi-VN"] });
  assert.equal(page.html.lang, "ko");
  assert.equal(page.document.title, TITLES.ko);
});

test("không có ?lang thì dùng lựa chọn đã lưu, trước ngôn ngữ trình duyệt", () => {
  const page = load({ stored: "en", languages: ["ko-KR"] });
  assert.equal(page.html.lang, "en");
});

test("theo ngôn ngữ điện thoại: ko-KR → KO", () => {
  const page = load({ languages: ["ko-KR", "en-US"] });
  assert.equal(page.html.lang, "ko");
});

test("điện thoại đặt ngôn ngữ khác (fr-FR) → EN", () => {
  const page = load({ languages: ["fr-FR"] });
  assert.equal(page.html.lang, "en");
});

test("ngôn ngữ được hỗ trợ đứng sau vẫn được chọn: [fr-FR, vi-VN] → VI", () => {
  const page = load({ languages: ["fr-FR", "vi-VN"] });
  assert.equal(page.html.lang, "vi");
});

test("bỏ qua ?lang và lựa chọn đã lưu không hợp lệ", () => {
  const page = load({ search: "?lang=xx", stored: "zh", languages: ["ko"] });
  assert.equal(page.html.lang, "ko");
});

test("localStorage bị chặn: không lỗi, vẫn chọn theo điện thoại và bấm nút vẫn đổi được", () => {
  const page = load({ storage: "throws", languages: ["en-US"] });
  assert.equal(page.html.lang, "en");
  page.ready();
  assert.doesNotThrow(() => page.click("ko"));
  assert.equal(page.html.lang, "ko");
  assert.deepEqual(page.pressed(), ["ko"]);
});

test("trình duyệt không có localStorage: vẫn chạy và bấm nút vẫn đổi được", () => {
  const page = load({ storage: "missing" });
  page.ready();
  page.click("en");
  assert.equal(page.html.lang, "en");
});

test("bấm nút: đổi lang, aria-pressed, lưu lựa chọn và đổi tiêu đề tab", () => {
  const page = load();
  page.ready();
  assert.deepEqual(page.pressed(), ["vi"]);
  page.click("en");
  assert.equal(page.html.lang, "en");
  assert.deepEqual(page.pressed(), ["en"]);
  assert.equal(page.store.get(KEY), "en");
  assert.equal(page.document.title, TITLES.en);
});

test("đổi về tiếng Việt thì khôi phục tiêu đề gốc", () => {
  const page = load({ stored: "ko" });
  page.ready();
  page.click("vi");
  assert.equal(page.document.title, TITLES.vi);
  assert.equal(page.store.get(KEY), "vi");
});

test("script nạp khi trang đã sẵn sàng (readyState complete) vẫn gắn được nút", () => {
  const page = load({ readyState: "complete" });
  page.click("ko");
  assert.equal(page.html.lang, "ko");
  assert.deepEqual(page.pressed(), ["ko"]);
});
