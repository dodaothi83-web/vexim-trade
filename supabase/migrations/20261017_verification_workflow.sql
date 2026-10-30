-- Verification L1/L2 fields used by CRM checklist and factory visit.
-- Run against the same Supabase project as the app BEFORE deploying the UI.
-- Safe to rerun; does not mark any supplier as verified.
begin;

alter table public.verifications
  add column if not exists checklist_notes jsonb not null default '{}'::jsonb,
  add column if not exists visit_lat double precision,
  add column if not exists visit_lng double precision,
  add column if not exists visit_address text,
  add column if not exists return_reason text;

-- The legacy schema default was an empty array; new checklists are keyed objects.
alter table public.verifications alter column checklist set default '{}'::jsonb;
update public.verifications set checklist = '{}'::jsonb
where checklist = '[]'::jsonb;

-- Files attached to an individual review must be linkable to that review.
-- Existing media_assets only allowed product/supplier and had no verification_id.
alter table public.media_assets add column if not exists verification_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'media_assets_verification_id_fkey'
    and conrelid = 'public.media_assets'::regclass) then
    alter table public.media_assets add constraint media_assets_verification_id_fkey
      foreign key (verification_id) references public.verifications(id) on delete cascade;
  end if;
end $$;
alter table public.media_assets drop constraint if exists media_assets_owner_type_check;
alter table public.media_assets add constraint media_assets_owner_type_check
  check (owner_type in ('product','supplier','verification'));
alter table public.media_assets drop constraint if exists media_owner_ck;
alter table public.media_assets add constraint media_owner_ck check (
  (owner_type = 'product' and product_id is not null and verification_id is null) or
  (owner_type = 'supplier' and supplier_id is not null and product_id is null and verification_id is null) or
  (owner_type = 'verification' and verification_id is not null and supplier_id is not null
    and product_id is null and audience = 'internal')
);
create index if not exists media_verification_idx
  on public.media_assets (verification_id, created_at desc)
  where verification_id is not null;

commit;
notify pgrst, 'reload schema';
