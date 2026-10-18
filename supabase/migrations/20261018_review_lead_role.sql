-- Apply after 20261017_supplier_self_registration.sql, before assigning the reviewer role.
-- No account is reassigned automatically. Run on the Supabase project used by the app.
begin;

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('admin','sale','sourcing','reviewer','viewer','supplier'));

-- Drop the old constraint first: even NOT VALID constraints reject updates to
-- legacy self-approved rows. This transaction installs the new one before commit.
alter table public.verifications drop constraint if exists verifications_four_eyes;

-- Retain the old self-approved rows without blocking edits to their public summaries.
-- Only rows self-approved BEFORE this migration receive the explicit legacy marker.
alter table public.verifications
  add column if not exists legacy_self_approved boolean not null default false;
update public.verifications set legacy_self_approved = true
  where status = 'approved' and inspector_id = approved_by and approved_by is not null
    and legacy_self_approved = false;

-- Restore separation for new approvals; NOT VALID keeps other historical rows intact.
-- New approvals also need a real inspector. Only pre-existing exceptions can stay self-approved.
alter table public.verifications add constraint verifications_four_eyes
  check (approved_by is null or (inspector_id is not null and
    (inspector_id <> approved_by or legacy_self_approved))) not valid;

commit;
notify pgrst, 'reload schema';
