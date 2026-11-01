# Ảnh nền trang chủ

Trang chủ (`app/(public)/page.tsx`) tự dò ba tên tệp dưới đây trong thư mục này, theo thứ tự:

1. `hero.webp`
2. `hero.jpg`
3. `hero.png`

Có tệp nào thì trang dùng tệp đó ngay ở lần tải kế tiếp, không phải sửa mã và không cần khởi động
lại. Không có tệp nào thì trang quay về ảnh Pexels mặc định.

## Ảnh đang dùng

`hero.webp`: cảnh dây chuyền sản xuất trong nhà máy, cắt từ `public/images/hero-scene.jpg`,
kích thước 1600 x 900, WebP chất lượng 72, khoảng 70 KB.

## Kích thước nên xuất

- **1600 x 900** (tỷ lệ 16:9). Ảnh rộng hơn thì thu về 1600 cho nhẹ.
- Định dạng **WebP** (ưu tiên) hoặc **JPG**, dung lượng **dưới 300 KB**.
- Chủ thể chính đặt ở **nửa phải, lệch về giữa**: khung canh `object-position: 60% center`,
  nửa trái bị lớp phủ tối cộng chữ trắng đè lên.
- Chừa khoảng 15% ở mép trên và mép dưới, vì hai dải này bị cắt trên màn hình rộng.

## Nén ảnh

Máy có ImageMagick thì chạy trong thư mục gốc dự án:

```bash
convert nguon.jpg -gravity center -crop 16:9 +repage -resize 1600x900 \
  -quality 72 -define webp:method=6 public/images/home/hero.webp
```

Kiểm lại dung lượng và kích thước:

```bash
ls -la public/images/home/hero.webp
identify public/images/home/hero.webp
```

## Quy tắc chọn ảnh

- Ảnh **thật** của nhà máy, khu công nghiệp hoặc dây chuyền sản xuất Việt Nam. Không dùng ảnh AI
  cho sản phẩm và không dùng ảnh stock sai ngành.
- Xin doanh nghiệp sự đồng ý trước khi đăng ảnh có người thật hoặc tên nhà máy.
- Đổi ảnh xong mở trang chủ kiểm tra lại phần chữ trắng trên nền ảnh có còn đọc rõ không.
