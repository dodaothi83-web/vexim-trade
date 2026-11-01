-- Grade do nhà cung cấp tự thêm cho một nhóm hàng.
--
-- Bộ grade chuẩn do Vexim khai theo ngành hàng (lib/products/grade-pricing.ts và product_fields).
-- Nhưng nhà máy có cách gọi quy cách riêng, ví dụ 600 g/L cho hồ tiêu hay một mã hàng mới.
-- Trước đây nhà cung cấp phải chờ Vexim bổ sung; nay họ tự thêm ngay trong ô chọn grade.
--
-- Lưu ở cấp danh mục để mọi sản phẩm cùng nhóm hàng dùng lại được ngay, và Vexim thấy
-- trong CRM khi duyệt. Tách khỏi product_fields (cấu hình CMS) để danh sách chuẩn của
-- Vexim vẫn là nguồn chính; khi muốn công bố chính thức thì chuyển mục tương ứng sang
-- product_fields trong CRM.
alter table public.categories
  add column if not exists supplier_grade_options jsonb not null default '[]'::jsonb;

comment on column public.categories.supplier_grade_options is
  'Grade nhà cung cấp tự thêm cho nhóm hàng (dùng chung cho mọi sản phẩm cùng danh mục, không phải cấu hình CMS).';
