-- Bản tiếng Anh cho các nội dung hồ sơ nhà cung cấp hiển thị trên trang buyer:
-- MOQ dạng chữ (moq_text_i18n) và thị trường xuất khẩu (export_markets_i18n) do AI dịch
-- từ nội dung gốc nhà cung cấp nhập; profile_translation_meta giữ hash nội dung gốc
-- tại thời điểm dịch để phát hiện bản dịch đã cũ, kèm cờ summary_generated khi phần
-- giới thiệu tiếng Anh do AI soạn vì nhà cung cấp để trống.
alter table public.suppliers add column if not exists moq_text_i18n jsonb not null default '{}'::jsonb;
alter table public.suppliers add column if not exists export_markets_i18n jsonb not null default '{}'::jsonb;
alter table public.suppliers add column if not exists profile_translation_meta jsonb;

notify pgrst, 'reload schema';
