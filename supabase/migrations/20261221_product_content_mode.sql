-- Nội dung trang sản phẩm gói Premium/Pro: chọn "Nội dung cơ bản" (mô tả chữ) hoặc "Nội dung A+"
-- (chủ sàn chốt 2026-11-21). Mặc định là nội dung cơ bản; A+ soạn ở trang riêng. Sản phẩm đang
-- có A+ giữ hiển thị A+ để trang người mua không đổi. A+ chỉ hiện khi gói còn quyền nội dung A+.
begin;

alter table public.supplier_products
  add column if not exists content_mode text not null default 'basic';
alter table public.supplier_products drop constraint if exists supplier_products_content_mode_check;
alter table public.supplier_products add constraint supplier_products_content_mode_check
  check (content_mode in ('basic', 'aplus'));
update public.supplier_products set content_mode = 'aplus'
  where content_mode = 'basic' and jsonb_array_length(aplus_content) > 0;
comment on column public.supplier_products.content_mode is 'Nội dung hiển thị trên trang sản phẩm: basic (mô tả chữ) hoặc aplus (nội dung A+, cần gói có quyền A+).';

commit;
notify pgrst, 'reload schema';
