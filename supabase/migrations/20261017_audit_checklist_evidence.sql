-- Attach audit evidence to one of the seven document-checklist items.
-- Old verification evidence remains unassigned (NULL) and is not moved/deleted.
-- Apply before deploying the inline-upload UI. Safe to rerun.
begin;
alter table public.media_assets add column if not exists checklist_key text;
alter table public.media_assets drop constraint if exists media_checklist_key_ck;
alter table public.media_assets add constraint media_checklist_key_ck check (
  checklist_key is null or
  (owner_type = 'verification' and verification_id is not null and checklist_key in (
    'business_license', 'tax_certificate', 'bank_letter', 'food_safety',
    'haccp_or_brc', 'product_certs', 'export_license'
  ))
);
create index if not exists media_verification_checklist_idx
  on public.media_assets (verification_id, checklist_key)
  where owner_type = 'verification' and checklist_key is not null;
commit;
notify pgrst, 'reload schema';
