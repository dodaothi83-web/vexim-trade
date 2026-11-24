-- Ảnh đại diện / ảnh bìa cũ của nhà cung cấp trên CDN (bổ sung cho 20261229_media_cdn_key.sql).
--
-- Ảnh đại diện/bìa lưu đường dẫn ở bảng suppliers, không có dòng media_assets, nên đợt chép
-- trước bỏ sót. Bản sao WebP 400 / 1024 / 1600 px nằm ở bucket R2 công khai `veximtrade-media`
-- (https://media.veximtrade.com), khoá `s/<supplierId>/<uuid của tệp gốc, bỏ gạch>`.
--
-- Không đổi profile_image / cover_image: bản gốc vẫn ở chỗ cũ để quay lại ngay bằng cách tắt
-- MEDIA_CDN_ENABLED. null = chưa chép. Trang chỉ dùng bản chép khi khoá khớp với tệp hiện tại,
-- nên đổi ảnh xong là tự quay về ảnh mới.
begin;

alter table public.suppliers add column if not exists profile_image_cdn_key text;
alter table public.suppliers add column if not exists cover_image_cdn_key text;

alter table public.suppliers drop constraint if exists suppliers_profile_image_cdn_key_ck;
alter table public.suppliers add constraint suppliers_profile_image_cdn_key_ck
  check (profile_image_cdn_key is null or profile_image_cdn_key ~ '^s/[A-Za-z0-9_-]+/[a-f0-9]{32}$');

alter table public.suppliers drop constraint if exists suppliers_cover_image_cdn_key_ck;
alter table public.suppliers add constraint suppliers_cover_image_cdn_key_ck
  check (cover_image_cdn_key is null or cover_image_cdn_key ~ '^s/[A-Za-z0-9_-]+/[a-f0-9]{32}$');

commit;
