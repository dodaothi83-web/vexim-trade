-- Apply after supplier_self_registration and supplier_dashboard, before deploying the new flow.
-- Portal access is distinct from public listing status and individual verification outcomes.
alter table public.suppliers add column if not exists onboarding_status text not null default 'not_started';
alter table public.suppliers add column if not exists onboarding_note text;
alter table public.suppliers drop constraint if exists suppliers_onboarding_status_check;
alter table public.suppliers add constraint suppliers_onboarding_status_check
  check (onboarding_status in ('not_started','pending','approved','changes_requested'));
-- Old self-registered accounts already submitted a full application. Require explicit staff approval;
-- never grant portal access from a public listing or an approved document audit.
update public.suppliers s set onboarding_status = 'pending'
where s.onboarding_status = 'not_started' and exists (
  select 1 from public.app_users u where u.supplier_id = s.id and u.role = 'supplier'
) and s.tax_id is not null and s.products is not null;
notify pgrst, 'reload schema';
