# Nhân bản trang mẫu thành website cho khách thật

Mỗi trang mẫu (`mau/homestay/`, `mau/spa/`, `mau/menu/`) là một file `index.html` chứa toàn bộ nội dung
và cả 3 bản dịch. Nó dùng chung đúng 2 file: `assets/css/mau.css` và `assets/js/mau.js`. Nhân bản tức là
chép những file này sang một repo mới, xoá phần "website mẫu", rồi sửa nội dung, ảnh và số liên hệ.

Ví dụ bên dưới làm website cho một homestay tên **Biển Xanh**, tên miền `bienxanh.vn`, repo `bien-xanh`.

## 0. Xin khách những thứ này trước

- Tên tiệm, địa chỉ, giờ mở cửa, link Google Maps của tiệm (mở Google Maps → Chia sẻ → Sao chép đường liên kết)
- Bảng giá: phòng / dịch vụ / món, giá, ghi chú (giá theo kg, phụ phí…)
- Số Zalo, số WhatsApp, link KakaoTalk (nếu có), số điện thoại nhận khách
- Ảnh thật: mặt tiền, phòng / dịch vụ / món, ít nhất 1 ảnh ngang đẹp để làm ảnh xem trước khi gửi link
- Tên miền: **đứng tên khách**. Bạn hướng dẫn hoặc đăng ký giúp, nhưng chủ sở hữu là khách.

## 1. Tạo repo mới và chép file

Tạo repo trống trên GitHub (ví dụ `bien-xanh`), clone về cạnh repo `dich-vu`, rồi chạy trong thư mục
`dich-vu` (Git Bash):

```bash
LOAI=homestay              # homestay | spa | menu
DICH=../bien-xanh          # thư mục repo mới

mkdir -p "$DICH/assets/css" "$DICH/assets/js" "$DICH/.github/workflows"
cp mau/$LOAI/index.html mau/$LOAI/favicon.svg "$DICH/"
cp assets/css/mau.css "$DICH/assets/css/"
cp assets/js/mau.js "$DICH/assets/js/"
cp -r tools "$DICH/"
cp .github/workflows/pages.yml "$DICH/.github/workflows/"
cp .htmlvalidate.json .htmlvalidateignore .gitignore .gitattributes package.json package-lock.json "$DICH/"

# Trang mẫu nằm ở mau/<loai>/, trang của khách nằm ở gốc: đổi ../../assets/ thành assets/
sed -i 's#\.\./\.\./assets/#assets/#g' "$DICH/index.html"
```

Trong repo mới, mở `tools/screenshots.mjs` và sửa danh sách `PAGES` cho đúng các trang của khách (thường
chỉ còn dòng `trang-chu`). Các file nguồn `tools/og/*.html` của Chào Khách có thể xoá, xem bước 7.

## 2. Xoá phần chỉ dành cho trang mẫu

Mọi thứ chỉ dành cho trang mẫu đều nằm giữa hai dòng comment `DEMO:BẮT ĐẦU` và `DEMO:KẾT THÚC`:

- thẻ `<meta name="robots" content="noindex">`: **phải xoá**, nếu không Google sẽ không index website của khách
- thanh "Website mẫu, doanh nghiệp giả định" và nút về trang dịch vụ
- ghi chú "các nút này mở Zalo của Chào Khách" (và mẹo dán mã QR ở trang menu)
- mục "Khách nói gì" của trang homestay: cả người lẫn lời nhận xét đều là giả định, **không được để lại**
  trên website thật
- dòng ghi công ở chân trang: giữ hay bỏ tuỳ thoả thuận với khách. Link trong đó là địa chỉ tuyệt đối về
  trang Chào Khách nên giữ lại vẫn qua kiểm tra. Muốn giữ thì xoá 2 dòng comment DEMO bao quanh nó trước
  khi chạy lệnh bên dưới.

Xoá tất cả một lần:

```bash
cd ../bien-xanh
perl -0pi -e 's/[ \t]*<!-- DEMO:BẮT ĐẦU.*?<!-- DEMO:KẾT THÚC -->\n//gs' index.html
grep -c "DEMO:" index.html     # phải ra 0
```

**Đánh giá trên website thật:** chỉ dùng đánh giá thật, có xin phép người viết (ghi tên ngắn như
"Minh, Hà Nội"), hoặc đặt nút dẫn tới phần đánh giá trên Google Maps của tiệm. Muốn có lại mục đánh giá:
chép khối `<section id="danh-gia">…</section>` từ trang mẫu homestay, bỏ dòng "Đánh giá minh hoạ", rồi
điền đánh giá thật.

## 3. Sửa nội dung và bản dịch

Mọi chữ trên trang nằm trong `index.html`, 3 thứ tiếng đứng cạnh nhau:

```html
<h2><span lang="vi">Phòng và giá</span><span lang="en">Rooms &amp; rates</span><span lang="ko">객실과 요금</span></h2>
```

- Sửa chữ của cả 3 `<span>`. Giá ghi một lần, dùng chung cho mọi ngôn ngữ: `<strong>550.000₫</strong>`.
- Thêm một phòng / dịch vụ / món: chép nguyên một khối `<li class="card">…</li>` (homestay),
  một dòng `<tr>…</tr>` trong bảng giá (spa), hoặc một khối `<li class="dish">…</li>` (menu), rồi sửa chữ.
- Ký tự `&` trong chữ phải viết là `&amp;` (html-validate sẽ nhắc nếu quên).
- Tiêu đề tab trình duyệt có 3 bản: `<title data-en="…" data-ko="…">tiêu đề tiếng Việt</title>`.
- Bản tiếng Anh và tiếng Hàn nên nhờ người bản xứ đọc lại trước khi bàn giao.

**Khách chỉ cần 2 ngôn ngữ** (ví dụ Việt và Anh):
1. Sửa thẻ mở đầu file thành `<html lang="vi" data-langs="vi en">`. Điện thoại tiếng Hàn khi đó tự mở bản
   tiếng Anh. Không cần sửa `assets/js/mau.js`, test trong `tools/test/` vẫn chạy được.
2. Xoá nút `<button … data-lang="ko">KO</button>`.
3. Xoá dần các `<span lang="ko">…</span>` cho file gọn, hoặc để nguyên (chúng bị ẩn). `npm run screenshots`
   đọc `data-langs` nên chỉ kiểm tra bản dịch tiếng Việt và tiếng Anh.

## 4. Thay ảnh

Khung "Ảnh của bạn ở đây" là `<div class="photo">…</div>`. Thay bằng ảnh thật:

1. Tạo thư mục `anh/` cạnh `index.html`.
2. Thu nhỏ ảnh về rộng tối đa 1600 px và nén (ví dụ bằng squoosh.app, chọn WebP hoặc JPEG chất lượng
   khoảng 75). Mỗi ảnh nên dưới 200 KB để trang mở nhanh trên 4G.
3. Đặt tên không dấu, không cách: `anh/phong-doi-ban-cong.jpg`.
4. Thay khối `<div class="photo">…</div>` bằng:

   ```html
   <img class="photo" src="anh/phong-doi-ban-cong.jpg" alt="Phòng đôi có ban công" width="1200" height="800" loading="lazy">
   ```

   `width` và `height` là kích thước thật của ảnh, giúp trang không bị giật khi ảnh tải xong. Ảnh ở phần
   đầu trang thì bỏ `loading="lazy"`. Ảnh trong thẻ phòng có tỉ lệ 3:2, ảnh giới thiệu có tỉ lệ 16:9.

## 5. Đổi số Zalo, WhatsApp, KakaoTalk, điện thoại

Trang mẫu đang trỏ về số của Chào Khách qua các placeholder. Thay bằng số **của khách**:

| Nút | Dạng link | Ghi chú |
|---|---|---|
| Zalo | `https://zalo.me/0905123456` | Số điện thoại đã đăng ký Zalo, dạng 0… |
| WhatsApp | `https://wa.me/84905123456?text=…` | Mã nước 84, bỏ số 0 đầu, không có dấu `+` |
| Gọi điện | `tel:+84905123456` | Chữ hiển thị trong link không dùng dấu cách thường, dùng `&nbsp;` |
| KakaoTalk | `https://open.kakao.com/o/xxxxxxx` | Tạo Open Chat (오픈채팅) trong ứng dụng KakaoTalk, hoặc dùng link chat của Kakao Channel |

```bash
sed -i -e 's/DIEN_SO_ZALO/0905123456/g' -e 's/DIEN_SO_QUOC_TE/84905123456/g' -e 's/DIEN_MA_KAKAO/xxxxxxx/g' index.html
```

**Thử nút Zalo của khách trước khi bàn giao.** Link `zalo.me/<số>` chỉ mở được cuộc trò chuyện khi tài
khoản Zalo đó cho phép người lạ tìm thấy qua số điện thoại (trong phần quyền riêng tư của Zalo). Tin nhắn
của người chưa kết bạn có thể nằm ở mục tin nhắn từ người lạ: dặn khách xem mục này. Bấm thử bằng một tài
khoản Zalo khác.

Mỗi ngôn ngữ có một nút WhatsApp riêng (`<a … lang="vi|en|ko">`) với câu chào soạn sẵn sau `?text=`
(dấu cách viết là `%20`). Sửa câu chào theo tên tiệm của khách.

Nút "Mở Google Maps" đang tìm theo khu vực (`/maps/search/?api=1&amp;query=…`). Thay bằng link Google
Maps thật của tiệm mà khách gửi.

## 6. Đổi màu và font

Đầu file `index.html` có một khối `<style>` với các biến màu. Chỉ cần đổi ở đó, không sửa `mau.css`:

```css
:root {
  --primary: #1e5f8c;     /* nút, link */
  --accent: #f2a541;      /* trang trí, sao đánh giá */
  --hero-from: #1b557d;   /* nền đầu trang: chữ trắng nằm trên nên phải đủ tối */
  --hero-to: #2b77a0;
  --font-heading: "Lora", Georgia, "Times New Roman";
}
```

- Chữ trắng trên `--primary`, `--hero-from` và `--hero-to` phải có độ tương phản từ 4.5:1 trở lên. Kiểm tra
  bằng một công cụ đo tương phản màu (WCAG contrast checker).
- Đổi font tiêu đề: sửa dòng `fonts.googleapis.com/css2?family=…`. Chọn font có hỗ trợ tiếng Việt (trên
  Google Fonts, lọc *Language: Vietnamese*). Chữ Hàn tự dùng font có sẵn trên điện thoại.
- Biểu tượng nhỏ trước tên tiệm ở đầu trang và `favicon.svg` là SVG đơn giản. Thay bằng logo của khách
  nếu có.

## 7. Sửa phần `<head>`, ảnh xem trước, sitemap

Trong `index.html`:

- `<title>`, `<meta name="description">`: tên và mô tả thật của tiệm.
- `<link rel="canonical">`, `og:url`: `https://bienxanh.vn/`.
- `og:image`: URL tuyệt đối tới ảnh xem trước khi gửi link qua Zalo/Facebook, ví dụ
  `https://bienxanh.vn/anh/og.jpg`. Ảnh PNG hoặc JPEG đúng **1200×630**, cắt từ ảnh đẹp nhất của tiệm.
  Sửa luôn `og:image:alt`, `og:site_name`, `og:title`, `og:description`.
- `theme-color`: màu `--primary` mới.

Tạo thêm ở gốc repo mới:

- `sitemap.xml`: chép từ repo `dich-vu`, chỉ để một dòng `<loc>https://bienxanh.vn/</loc>`.
- `robots.txt`: chép từ repo `dich-vu`, sửa dòng `Sitemap:` thành `https://bienxanh.vn/sitemap.xml`.
- `404.html`: không bắt buộc; không có thì GitHub hiện trang 404 mặc định. Trang 404 của Chào Khách dùng
  `dich-vu.css` nên **không chép sang được**. Muốn có trang 404 riêng: làm một trang nhỏ dùng chung
  `assets/css/mau.css` như `index.html` của khách, thêm `<meta name="robots" content="noindex">`,
  `<base href="https://bienxanh.vn/">`, canonical và `og:url` là `https://bienxanh.vn/404.html`, rồi chạy
  `npm test` để `check-site` soát lại.

`tools/check-site.mjs` lấy địa chỉ gốc từ canonical của `index.html`. Nó sẽ báo nếu canonical, `og:url`,
sitemap hay robots còn trỏ tên miền cũ, hoặc nếu `og:image` thiếu file hay sai kích thước.

## 8. Kiểm tra

```bash
npm ci
npm test               # html-validate + check-site + test công cụ
npm start              # xem thử ở http://localhost:8080/, thử ?lang=en và ?lang=ko
npm run screenshots    # ảnh 390px và 1280px trong .screenshots/
```

Mở thử trên chính điện thoại của bạn (Zalo → gửi link cho chính mình) trước khi gửi khách.

## 9. Deploy và gắn tên miền

1. Push lên `main` của repo mới.
2. **Settings → Pages → Source: GitHub Actions**. Workflow `pages.yml` đã có sẵn: kiểm tra xong mới deploy.
3. Gắn tên miền của khách theo mục **Gắn tên miền riêng** trong `README.md` của repo `dich-vu`: bản ghi
   DNS, Custom domain, Enforce HTTPS. Tài khoản nhà đăng ký tên miền là của khách; bạn chỉ thêm bản ghi DNS.

## 10. Sau khi website chạy

- Gắn link website vào hồ sơ Google Business Profile (trang Google Maps) của tiệm.
- Trang menu: tạo mã QR trỏ tới địa chỉ website, in và dán lên bàn. Không cần thêm `?lang=` vào mã QR,
  vì trang tự chọn ngôn ngữ theo điện thoại của khách.
- Bàn giao cho khách: quyền quản lý tên miền, quyền vào repo (hoặc bản sao mã nguồn), và cách nhắn Zalo
  khi muốn đổi giá hay ảnh.
