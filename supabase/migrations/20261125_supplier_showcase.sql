-- Khối nội dung hình ảnh trên trang nhà cung cấp (quyền của gói Premium/Pro).
--
-- Mỗi khối là một ảnh kèm tiêu đề và đoạn mô tả ngắn, ví dụ "Vùng nguyên liệu",
-- "Dây chuyền phân loại". Nhà cung cấp tự thêm trong cổng; trang công khai chỉ hiện khi
-- gói còn hiệu lực. Hết hạn gói thì khối được giữ lại nhưng ẩn khỏi trang công khai.
-- Tối đa 6 khối. Chạy lại an toàn.
begin;

alter table public.suppliers
  add column if not exists showcase_blocks jsonb not null default '[]'::jsonb;

alter table public.suppliers drop constraint if exists suppliers_showcase_blocks_check;
alter table public.suppliers add constraint suppliers_showcase_blocks_check
  check (jsonb_typeof(showcase_blocks) = 'array' and jsonb_array_length(showcase_blocks) <= 6);

comment on column public.suppliers.showcase_blocks is
  'Khối nội dung hình ảnh (Premium/Pro): [{id, image_path, title, body}], tối đa 6.';

commit;
notify pgrst, 'reload schema';
