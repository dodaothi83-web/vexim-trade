-- Thông số do nhà cung cấp tự thêm cho một nhóm hàng.
--
-- Vexim không phải bên hiểu thông số bằng chính nhà máy, nên NCC được tự thêm thông số
-- còn thiếu khi khai sản phẩm. Những mục này lưu ở cấp danh mục để nhà cung cấp khác
-- trong cùng nhóm hàng dùng lại mà Vexim không phải nhập tay.
--
-- Tách khỏi product_fields (cấu hình CMS): thông số tự thêm KHÔNG tham gia bộ lọc buyer
-- và KHÔNG tự hiện trên trang buyer. Khi Vexim muốn công bố, chuyển mục tương ứng sang
-- product_fields trong CRM.
alter table public.categories
  add column if not exists supplier_product_fields jsonb not null default '[]'::jsonb;

comment on column public.categories.supplier_product_fields is
  'Thông số NCC tự thêm cho nhóm hàng (gợi ý dùng lại cho NCC khác, không phải cấu hình CMS, không lên bộ lọc buyer).';
