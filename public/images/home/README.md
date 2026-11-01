# Ảnh nền trang chủ

Trang chủ (`app/(public)/page.tsx`) tự dò ba tên tệp dưới đây trong thư mục này, theo thứ tự:

1. `hero-farmer.webp`
2. `hero-farmer.jpg`
3. `hero-farmer.png`

Có tệp nào thì trang dùng tệp đó ngay ở lần tải kế tiếp, không phải sửa mã. Không có tệp nào
thì trang giữ ảnh nông dân đang dùng, tải từ Pexels.

## Kích thước nên xuất

- **1600 x 1067** (tỷ lệ 3:2). Rộng hơn 1600 cũng được, nhưng khung hiển thị chỉ cao khoảng
  500 px nên phần trên dưới bị cắt bớt.
- Định dạng **WebP** (ưu tiên) hoặc **JPG**, dung lượng **dưới 300 KB**.
- Chủ thể chính đặt ở **nửa phải, lệch về giữa**: khung canh `object-position: 60% center`,
  nửa trái bị lớp phủ tối cộng chữ trắng đè lên.
- Chừa khoảng 15% ở mép trên và mép dưới, vì hai dải này bị cắt trên màn hình rộng.

## Quy tắc chọn ảnh

- Ảnh **thật**, không dùng ảnh AI dựng cho người và sản phẩm.
- Xin doanh nghiệp hoặc người trong ảnh sự đồng ý trước khi đăng.
- Đổi ảnh xong mở trang chủ kiểm tra lại phần chữ trắng trên nền ảnh có còn đọc rõ không.
