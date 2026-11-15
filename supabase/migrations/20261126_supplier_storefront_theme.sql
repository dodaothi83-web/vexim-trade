-- Giao diện trang nhà cung cấp gói Premium/Pro: mẫu, tông màu, câu giới thiệu, số liệu nổi bật.
--
-- Chủ sàn duyệt 3 mẫu (elegant, modern, gallery) và 4 tông màu (champagne, terracotta,
-- graphite, steel). Nhà cung cấp tự chọn trong "Trang của tôi"; trang công khai chỉ dùng
-- khi gói còn hiệu lực. Ứng dụng kiểm tra giá trị trước khi lưu; cột chỉ cần là object.
-- Chạy lại an toàn.
begin;

alter table public.suppliers
  add column if not exists storefront_theme jsonb not null default '{}'::jsonb;

alter table public.suppliers drop constraint if exists suppliers_storefront_theme_check;
alter table public.suppliers add constraint suppliers_storefront_theme_check
  check (jsonb_typeof(storefront_theme) = 'object');

comment on column public.suppliers.storefront_theme is
  'Giao diện Premium/Pro: {template, tone, tagline, stats[]}. Xem lib/storefront-theme.ts.';

commit;
notify pgrst, 'reload schema';
