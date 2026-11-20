-- Nội dung A+ doanh nghiệp trên trang nhà cung cấp (gói Premium/Pro), chủ sàn chốt 2026-11-20.
--
-- Cùng cấu trúc khối với A+ sản phẩm (lib/products/aplus.ts): banner có chữ, điểm nổi bật, quy
-- trình theo bước, đóng gói và container, câu hỏi thường gặp, ảnh, ảnh + chữ, lưới ảnh, văn bản,
-- video. Nhà cung cấp viết tiếng Việt, máy chủ dịch sang tiếng Anh khi lưu. Ảnh nằm ở
-- aplus/<supplierId>/company/<uuid>.<ext> và chỉ công khai khi gói còn quyền trang cao cấp.
-- Hiện ngay dưới mục About; dữ liệu xác minh, chứng nhận, điều kiện giao dịch không đổi.
begin;

alter table public.suppliers
  add column if not exists company_aplus jsonb not null default '[]'::jsonb;
alter table public.suppliers drop constraint if exists suppliers_company_aplus_check;
alter table public.suppliers add constraint suppliers_company_aplus_check
  check (jsonb_typeof(company_aplus) = 'array' and jsonb_array_length(company_aplus) <= 10);
comment on column public.suppliers.company_aplus is 'Khối nội dung A+ doanh nghiệp (bản tiếng Anh người mua thấy kèm bản tiếng Việt nhà cung cấp viết). Chỉ hiện khi gói có trang cao cấp.';

commit;
notify pgrst, 'reload schema';
