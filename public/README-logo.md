# Logo Vexim

`logo-vexim-white.jpg` là ảnh gốc do Vexim cung cấp (1024 × 1024). Ảnh JPEG này có nền trắng đặc, nét chữ/logo cũng gần như trắng và có viền trắng lớn. Không thể hiển thị trực tiếp trên nền sáng hoặc tối ở kích thước header.

Chạy `npm run brand:assets` để tạo hai PNG **từ chính file này**: `logo-vexim-white-wordmark.png` (logo đầy đủ, đã cắt lề) và `logo-vexim-white-mark.png` (chỉ biểu tượng V, cho ô vuông nhỏ). Các PNG chứa phần artwork được chuyển thành alpha; `components/brand-logo.tsx` dùng CSS mask để tô xanh đậm trên nền sáng hoặc trắng trên nền tối mà không đổi tỉ lệ. `app/icon.png` (favicon) cũng được tạo từ cùng nguồn.

Sau khi thay ảnh gốc, xem lại vùng cắt trong `scripts/generate-brand-assets.mjs`, chạy lại lệnh và kiểm tra trực quan. `npm run brand:assets -- --check` xác nhận các file dẫn xuất được cập nhật đồng bộ.
