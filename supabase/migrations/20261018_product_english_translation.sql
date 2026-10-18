-- Bản dịch tiếng Anh tự động (AI) cho nội dung sản phẩm do nhà cung cấp đăng.
-- Nội dung gốc tiếng Việt giữ nguyên trong các cột name/description/spec/...;
-- bản tiếng Anh lưu ở các cột *_i18n dạng jsonb {"en": "..."} để trang buyer ưu tiên hiển thị.
-- translation_meta giữ hash của nội dung gốc tại thời điểm dịch, thời điểm dịch,
-- nguồn dịch (ai | staff) và model đã dùng, nhằm phát hiện bản dịch đã cũ khi NCC sửa nội dung.
alter table public.supplier_products add column if not exists name_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists description_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists description_detail_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists spec_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists packaging_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists certifications_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists translation_meta jsonb;

notify pgrst, 'reload schema';
