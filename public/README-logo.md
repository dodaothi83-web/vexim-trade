# Logo Vexim

- `logo-vexim.png`: logo xanh do Vexim tải lên, PNG trong suốt 60 × 60. Dùng trên landing page và các trang nền sáng; hiển thị tối đa ở kích thước gốc để không bị mờ/phóng méo.
- `logo-vexim-white-mark.png`: logo trắng do Vexim tải lên, PNG trong suốt 768 × 768 (gồm biểu tượng, tên và tagline). Dùng trên nền tối của hệ thống đăng ký, đăng nhập, CRM và các khu vực tối khác.
- `favicon.png`: favicon riêng do Vexim tải lên, được khai báo trong `app/layout.tsx`.

`components/brand-logo.tsx` hiển thị trực tiếp hai file logo, giữ tỉ lệ 1:1 và không áp màu/filter. Không cần tạo ảnh dẫn xuất từ những file đã bị xoá trước đó.
