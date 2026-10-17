-- Internal numeric identifiers for the documents audit; no automatic verification.
-- Preserve leading zeroes and existing checklist notes. No backfill or publication.
begin;
alter table public.verifications
  add column if not exists tax_number text,
  add column if not exists bank_account_number text;
commit;
notify pgrst, 'reload schema';
