# Logo Vexim

- `logo-vexim.png`: logo xanh do Vexim tải lên, PNG trong suốt 60 × 60. Dùng trên landing page và các trang nền sáng; hiển thị tối đa ở kích thước gốc để không bị mờ/phóng méo.
- `logo-vexim-white-mark.png`: logo trắng do Vexim tải lên, PNG trong suốt 768 × 768 (gồm biểu tượng, tên và tagline). Dùng trên nền tối của hệ thống đăng ký, đăng nhập, CRM và các khu vực tối khác.
- `favicon.ico` (16/32/48), `favicon.png` (192 × 192), `apple-touch-icon.png` (180 × 180, nền trắng): bộ favicon tạo từ logo V do Vexim tải lên, khai báo trong `app/layout.tsx`. Chỉ đặt favicon ở `public/` — KHÔNG thêm `app/favicon.ico` (Next.js báo xung đột đường dẫn và `/favicon.ico` trả lỗi). Google yêu cầu cạnh là bội số của 48px.

`components/brand-logo.tsx` hiển thị trực tiếp hai file logo, giữ tỉ lệ 1:1 và không áp màu/filter. Không cần tạo ảnh dẫn xuất từ những file đã bị xoá trước đó.
