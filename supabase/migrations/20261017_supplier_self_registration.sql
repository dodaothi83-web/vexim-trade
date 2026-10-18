-- Run after 20261017_verification_workflow.sql and the audit-evidence migrations.
-- A supplier account is bound to exactly one supplier. Requests are NOT approvals.
-- App writes via the server-side service role; do not expose these tables to anon.
alter table public.app_users add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create unique index if not exists app_users_supplier_id_key
  on public.app_users(supplier_id) where supplier_id is not null;

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('admin','sale','sourcing','viewer','supplier'));

create table if not exists public.supplier_verification_requests (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  target_level smallint not null check (target_level in (2,3)),
  status text not null default 'requested' check (status in ('requested','contacted')),
  requested_at timestamptz not null default now(),
  contacted_at timestamptz,
  contacted_by uuid references public.app_users(id) on delete set null,
  primary key (supplier_id, target_level)
);
create index if not exists supplier_verification_requests_queue_idx
  on public.supplier_verification_requests(status, requested_at desc);
-- No direct browser/PostgREST access to private contact requests; the server uses service_role.
alter table public.supplier_verification_requests enable row level security;
revoke all on public.supplier_verification_requests from anon, authenticated;

-- Existing supplier rows, app users and approved audits are not modified.
notify pgrst, 'reload schema';
