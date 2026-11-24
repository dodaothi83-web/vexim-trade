-- Ảnh sản phẩm và ảnh nhà máy công khai trên CDN (chủ dự án duyệt 24/11/2026).
--
-- Bản sao WebP 400 / 1024 / 1600 px nằm ở bucket R2 công khai `veximtrade-media`
-- (https://media.veximtrade.com), cache `public, max-age=31536000, immutable`. Cột mới chỉ giữ
-- gốc khoá, ví dụ `p/<productId>/<32 hex>`; các cỡ là `<gốc>/400.webp`, `/1024.webp`, `/1600.webp`.
--
-- Không đổi storage_path / thumb_path: bản gốc vẫn ở chỗ cũ (Supabase hoặc R2 riêng tư) để
-- quay lại ngay bằng cách tắt MEDIA_CDN_ENABLED. null = chưa chép lên CDN.
begin;

alter table public.media_assets add column if not exists cdn_key text;

alter table public.media_assets drop constraint if exists media_assets_cdn_key_ck;
alter table public.media_assets add constraint media_assets_cdn_key_ck
  check (cdn_key is null or cdn_key ~ '^[ps]/[A-Za-z0-9_-]+/[a-f0-9]{32}$');

commit;
