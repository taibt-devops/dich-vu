/* Chào Khách: chuyển ngôn ngữ VI / EN / KO cho các trang mẫu (dùng chung, không cần thư viện).
 *
 * Cách dùng: nạp trong <head>, NGAY SAU <title>, không dùng defer/async, để ngôn ngữ được chọn
 * trước khi trang hiện ra (không bị nháy chữ):
 *   <title data-en="Tiêu đề tiếng Anh" data-ko="Tiêu đề tiếng Hàn">Tiêu đề tiếng Việt</title>
 *   <script src="../../assets/js/mau.js"></script>
 *
 * Nội dung mỗi ngôn ngữ nằm sẵn trong HTML, cạnh nhau:
 *   <span lang="vi">Phòng và giá</span><span lang="en">Rooms &amp; rates</span><span lang="ko">객실 및 요금</span>
 * mau.css chỉ hiện phần trùng với <html lang>. Không có JavaScript thì trang hiện tiếng Việt.
 * Nút chuyển ngôn ngữ: <button type="button" data-lang="en">EN</button>
 * Danh sách ngôn ngữ của trang khai báo trên thẻ html: <html lang="vi" data-langs="vi en ko">
 * (website chỉ có Việt + Anh: data-langs="vi en", rồi xoá nút KO; không cần sửa file này).
 *
 * Thứ tự chọn ngôn ngữ:
 *   1. tham số ?lang=vi|en|ko trên URL
 *   2. lựa chọn đã lưu khi khách bấm nút (localStorage; bị chặn thì bỏ qua, trang vẫn chạy)
 *   3. ngôn ngữ của điện thoại: vi → VI, ko → KO, ngôn ngữ khác → EN
 *   4. mặc định: ngôn ngữ đầu tiên trong data-langs (VI)
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var LANGS = String(root.getAttribute("data-langs") || "vi en ko").split(/\s+/).filter(Boolean);
  var STORAGE_KEY = "chaokhach-lang";
  var titleEl = document.querySelector("title");
  var originalTitle = titleEl ? titleEl.textContent : document.title;

  function valid(lang) {
    return LANGS.indexOf(lang) !== -1 ? lang : null;
  }

  function fromUrl() {
    var match = /[?&]lang=([a-z]{2})(?:&|$)/i.exec(window.location.search || "");
    return match ? valid(match[1].toLowerCase()) : null;
  }

  function loadSaved() {
    try {
      return valid(window.localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }

  function save(lang) {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* localStorage bị chặn (chế độ riêng tư, webview): vẫn đổi ngôn ngữ, chỉ không nhớ được */
    }
  }

  function fromDevice() {
    var nav = window.navigator || {};
    var list = nav.languages && nav.languages.length ? nav.languages : nav.language ? [nav.language] : [];
    for (var i = 0; i < list.length; i++) {
      var lang = valid(String(list[i]).slice(0, 2).toLowerCase());
      if (lang) return lang;
    }
    return list.length ? valid("en") || LANGS[0] : null;
  }

  function apply(lang) {
    root.setAttribute("lang", lang);
    var translated = lang !== "vi" && titleEl && titleEl.dataset ? titleEl.dataset[lang] : null;
    document.title = translated || originalTitle;
    var buttons = document.querySelectorAll("button[data-lang]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-pressed", String(buttons[i].dataset.lang === lang));
    }
  }

  var current = fromUrl() || loadSaved() || fromDevice() || LANGS[0];
  apply(current);

  function onClick(event) {
    var lang = valid(event.currentTarget.dataset.lang);
    if (!lang) return;
    current = lang;
    save(lang);
    apply(lang);
  }

  function wireButtons() {
    var buttons = document.querySelectorAll("button[data-lang]");
    for (var i = 0; i < buttons.length; i++) buttons[i].addEventListener("click", onClick);
    apply(current);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireButtons);
  else wireButtons();
})();
