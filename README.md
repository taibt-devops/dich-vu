# Chào Khách

Website giới thiệu dịch vụ của **Chào Khách** (Bùi Thành Tài): tối ưu Google Maps, làm website song ngữ
và menu QR cho homestay, căn hộ cho thuê, spa, quán ăn ở Đà Nẵng. Kèm 3 website mẫu của doanh nghiệp
giả định để gửi cho chủ tiệm qua Zalo.

| Trang | Địa chỉ |
|---|---|
| Trang dịch vụ (tiếng Việt) | https://taibt-devops.github.io/dich-vu/ |
| Mẫu homestay (VI / EN / KO) | https://taibt-devops.github.io/dich-vu/mau/homestay/ |
| Mẫu spa (VI / EN / KO) | https://taibt-devops.github.io/dich-vu/mau/spa/ |
| Mẫu menu QR (VI / EN / KO) | https://taibt-devops.github.io/dich-vu/mau/menu/ |

HTML/CSS/JS thuần: không framework, không bước build. Thứ duy nhất tải từ bên ngoài là Google Fonts.
Ảnh minh hoạ đều là SVG tự vẽ; ảnh xem trước khi gửi link (OG) được tạo từ HTML trong `tools/og/`.

## Cấu trúc thư mục

```
index.html                  Trang dịch vụ
404.html                    Trang "không tìm thấy" (GitHub Pages trả về cho mọi đường dẫn sai)
robots.txt, sitemap.xml     Chỉ có trang dịch vụ; trang mẫu đặt noindex
favicon.ico
assets/
  css/dich-vu.css           CSS trang dịch vụ + 404
  css/mau.css               CSS dùng chung cho 3 trang mẫu
  js/mau.js                 Chuyển VI / EN / KO cho trang mẫu, nhớ lựa chọn bằng localStorage
  img/                      favicon.svg, apple-touch-icon.png, og.png (ảnh xem trước 1200×630)
mau/
  homestay/                 index.html (cả 3 thứ tiếng nằm trong file này), favicon.svg, og.png
  spa/                      như trên
  menu/                     như trên
docs/nhan-ban-trang-mau.md  Hướng dẫn nhân bản trang mẫu thành website cho khách thật
tools/                      Công cụ chạy bằng Node, không cần cài thêm thư viện:
  serve.mjs                   server xem thử trên máy (hành xử giống GitHub Pages)
  check-site.mjs              kiểm tra link, #anchor, canonical, Open Graph, sitemap, robots, placeholder
  screenshots.mjs             chụp màn hình 390px và 1280px bằng Chrome/Edge headless
  render-images.mjs           tạo ảnh OG và icon từ tools/og/
  test/                       test cho các công cụ và cho assets/js/mau.js
.github/workflows/pages.yml Kiểm tra rồi deploy lên GitHub Pages
.htmlvalidate.json          html-validate, extends html-validate:recommended
```

## Xem thử trên máy

Cần Node.js 24 LTS (tối thiểu 22.22; bản 22.11 vẫn chạy được nhưng npm sẽ in cảnh báo).

```bash
npm ci
npm start            # http://localhost:8080/
```

Mở qua server, đừng bấm đúp vào file HTML: link dạng `mau/homestay/` cần server để trả về `index.html`.
Không có Node thì dùng `python -m http.server 8080`.

Server mặc định chỉ mở cho chính máy tính này. Muốn xem thử trên điện thoại cùng mạng Wi-Fi: chạy
`HOST=0.0.0.0 npm start` (PowerShell: `$env:HOST="0.0.0.0"; npm start`) rồi mở `http://<IP-máy-tính>:8080/`
trên điện thoại.

Thử nhanh ngôn ngữ của trang mẫu bằng cách thêm `?lang=en` hoặc `?lang=ko` vào URL. Không có tham số thì
trang chọn theo thứ tự: lựa chọn khách đã bấm, ngôn ngữ của điện thoại (tiếng Hàn → KO, tiếng Việt → VI,
ngôn ngữ khác → EN), cuối cùng là VI.

## Kiểm tra trước khi push

| Lệnh | Làm gì |
|---|---|
| `npm test` | html-validate cho **mọi** file `.html`, `check-site` (link nội bộ, `#anchor`, canonical, Open Graph, sitemap, robots) và test của công cụ. CI chạy đúng các bước này. |
| `npm run links:external` | Như `check-site` và kiểm tra thêm link ra ngoài (cần mạng, bỏ qua link còn placeholder). |
| `npm run screenshots` | Chụp mọi trang ở 390px và 1280px (trang mẫu chụp cả EN, KO) vào `.screenshots/`, báo lỗi nếu trang bị tràn ngang, có lỗi JavaScript, thiếu bản dịch hoặc lộ chữ của ngôn ngữ khác. Cần Chrome hoặc Edge; cài chỗ khác thì đặt biến `CHROME_PATH`. |
| `npm run images` | Tạo lại ảnh OG và icon sau khi sửa nguồn trong `tools/og/`. |

## Deploy

Mỗi lần push vào `main`, workflow `.github/workflows/pages.yml` chạy:

1. **Kiểm tra HTML và link**: `npm ci`, html-validate, `check-site`, test công cụ.
2. **Deploy GitHub Pages**: chỉ chạy khi bước 1 qua và đang ở nhánh `main`. Gom file website vào `_site/`
   (bỏ `docs/`, `tools/`, README và các file cấu hình) rồi deploy.

Pull request chỉ chạy bước 1. Có thể chạy tay ở tab Actions (nút *Run workflow*).

Làm một lần: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Điền thông tin còn thiếu

Số Zalo, số điện thoại, email, link KakaoTalk đang để placeholder. `npm run links` in ra số chỗ còn sót.

| Placeholder | Điền gì | Ví dụ |
|---|---|---|
| `DIEN_SO_ZALO` | Số Zalo / điện thoại, dạng 0… | `0905123456` |
| `DIEN_SO_QUOC_TE` | Cùng số đó, dạng quốc tế, không có dấu `+` | `84905123456` |
| `DIEN_EMAIL` | Email nhận liên hệ | `ten@example.com` |
| `DIEN_MA_KAKAO` | Mã link KakaoTalk Open Chat, phần sau `open.kakao.com/o/` | `sAbC123x` |

Thay một lần cho cả repo (Git Bash, có sẵn khi cài Git for Windows):

```bash
grep -rlZ "DIEN_SO_ZALO" --include="*.html" . | xargs -0 sed -i "s/DIEN_SO_ZALO/0905123456/g"
grep -rlZ "DIEN_SO_QUOC_TE" --include="*.html" . | xargs -0 sed -i "s/DIEN_SO_QUOC_TE/84905123456/g"
grep -rlZ "DIEN_EMAIL" --include="*.html" . | xargs -0 sed -i "s/DIEN_EMAIL/ten@example.com/g"
grep -rlZ "DIEN_MA_KAKAO" --include="*.html" . | xargs -0 sed -i "s/DIEN_MA_KAKAO/sAbC123x/g"
npm test
```

Chữ hiển thị trong link `tel:` không được chứa dấu cách thường (html-validate sẽ báo). Muốn tách nhóm
số cho dễ đọc thì dùng `&nbsp;`, ví dụ `0905&nbsp;123&nbsp;456`.

Trên trang mẫu, các nút Zalo / WhatsApp / KakaoTalk / gọi điện cũng dùng các placeholder này. Chủ tiệm
bấm thử là nhắn đúng cho bạn.

**Kiểm tra Zalo của bạn:** mọi nút "Nhắn Zalo" dùng link `zalo.me/<số>`. Link này chỉ mở được cuộc trò
chuyện khi tài khoản Zalo cho phép người lạ tìm thấy qua số điện thoại (trong phần quyền riêng tư của
Zalo). Tin nhắn của người chưa kết bạn có thể nằm ở mục tin nhắn từ người lạ, nên nhớ xem mục này. Trước khi
gửi link cho chủ tiệm, hãy bấm thử bằng một tài khoản Zalo khác.

## Gắn tên miền riêng

1. Mua tên miền, ví dụ `chaokhach.vn`.
2. Tạo bản ghi DNS ở nhà cung cấp tên miền:
   - Tên miền gốc (`@`): 4 bản ghi **A** tới `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
     `185.199.111.153`. Muốn IPv6 thì thêm **AAAA** tới `2606:50c0:8000::153`, `2606:50c0:8001::153`,
     `2606:50c0:8002::153`, `2606:50c0:8003::153`.
   - `www`: bản ghi **CNAME** tới `taibt-devops.github.io`.
3. Trên GitHub: **Settings → Pages → Custom domain**, nhập tên miền rồi Save. Kiểm tra DNS xong thì bật
   **Enforce HTTPS**. Deploy bằng GitHub Actions thì không cần file `CNAME` trong repo.
4. Nên xác minh tên miền để người khác không chiếm được: **Settings của tài khoản → Pages → Add a domain**.
5. Đổi địa chỉ gốc trong repo. Mọi đường dẫn khác đều tương đối nên không phải sửa; chỉ những chỗ bắt
   buộc phải là URL tuyệt đối cần đổi: canonical, `og:url`, `og:image`, JSON-LD, `sitemap.xml`,
   `robots.txt` và thẻ `<base>` trong `404.html`.

   ```bash
   grep -rlZ "https://taibt-devops.github.io/dich-vu/" --include="*.html" --include="*.xml" --include="*.txt" . \
     | xargs -0 sed -i "s#https://taibt-devops.github.io/dich-vu/#https://chaokhach.vn/#g"
   npm test     # check-site xác nhận canonical, sitemap, robots đều đã khớp địa chỉ mới
   ```

   PowerShell (ghi UTF-8 không BOM, vì html-validate báo lỗi nếu file có BOM):

   ```powershell
   Get-ChildItem -Recurse -Include *.html,*.xml,*.txt | Where-Object FullName -notmatch 'node_modules' | ForEach-Object {
     $t = [IO.File]::ReadAllText($_.FullName)
     [IO.File]::WriteAllText($_.FullName, $t.Replace('https://taibt-devops.github.io/dich-vu/', 'https://chaokhach.vn/'))
   }
   ```
6. Từ lúc này `robots.txt` mới có tác dụng. Ở dạng `<user>.github.io/<repo>/`, công cụ tìm kiếm chỉ đọc
   `robots.txt` ở gốc tên miền.

## Sửa nhanh

- **Bỏ mục ưu đãi 3 khách đầu tiên:** trong `index.html`, xoá từ dòng `ƯU ĐÃI KHÁCH ĐẦU TIÊN: BẮT ĐẦU`
  tới dòng `ƯU ĐÃI KHÁCH ĐẦU TIÊN: KẾT THÚC`, rồi xoá khối CSS cùng tên trong `assets/css/dich-vu.css`.
  Không chỗ nào khác trỏ tới mục này.
- **Thêm trang mới:** thêm một `<url>` vào `sitemap.xml`. `check-site` đòi trang mới có đủ thẻ head
  (lang, description, canonical, Open Graph, favicon) và canonical khớp đúng đường dẫn của trang.
- **Đổi ảnh OG hoặc icon:** sửa file trong `tools/og/` rồi chạy `npm run images`.
- **Nhân bản trang mẫu cho khách thật:** xem [docs/nhan-ban-trang-mau.md](docs/nhan-ban-trang-mau.md).
