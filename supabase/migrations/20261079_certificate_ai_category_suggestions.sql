-- Store category suggestions from certificate OCR separately from confirmed scopes.
-- AI output is advisory; only staff actions create rows in certificate_scopes.
begin;

alter table public.certificates
  add column if not exists ai_category_suggestions jsonb not null default '[]'::jsonb;

alter table public.certificates
  drop constraint if exists certificates_ai_category_suggestions_check;
alter table public.certificates
  add constraint certificates_ai_category_suggestions_check
  check (jsonb_typeof(ai_category_suggestions) = 'array');

commit;
notify pgrst, 'reload schema';
