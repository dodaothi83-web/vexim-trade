-- Hotfix cho lỗi PostgREST PGRST204 khi lưu bản dịch hồ sơ NCC.
-- Chạy toàn bộ file này trên đúng Supabase project mà ứng dụng đang dùng.
-- Idempotent: không xóa hoặc ghi đè bản dịch hiện có.

alter table public.suppliers
  add column if not exists intro_source text,
  add column if not exists moq_text_i18n jsonb not null default '{}'::jsonb,
  add column if not exists export_markets_i18n jsonb not null default '{}'::jsonb,
  add column if not exists profile_translation_meta jsonb;

-- Hồ sơ cũ có thể chỉ lưu giới thiệu trong summary_i18n.en.
-- Giữ nguyên văn làm nguồn để service dịch; không sửa nội dung do NCC đã nhập.
-- Không backfill vào hồ sơ có bản tiếng Anh đã được nhân sự chốt.
update public.suppliers
set intro_source = summary_i18n ->> 'en'
where intro_source is null
  and coalesce(summary_i18n ->> 'en', '') <> ''
  and coalesce(profile_translation_meta ->> 'origin', '') <> 'staff';

notify pgrst, 'reload schema';
