-- STAGING-ONLY pilot infrastructure. Applying this migration does not enable a placement or billing.
-- Requires the existing supplier/product/category schema. No campaign is created by this file.
create table if not exists public.sponsored_pilot_campaigns (
  id uuid primary key default gen_random_uuid(),
  category_slug text not null,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paused')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  approved_by uuid references public.app_users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sponsored_pilot_window_ck check (ends_at > starts_at),
  constraint sponsored_pilot_approval_ck check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);
-- One explicit slot per category during the pilot, including future scheduled campaigns.
create unique index if not exists sponsored_pilot_one_approved_per_category
  on public.sponsored_pilot_campaigns (category_slug) where status = 'approved';
-- A supplier cannot be recorded as approving their own sponsored placement.
create or replace function public.check_sponsored_pilot_approver()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.status = 'approved' and not exists (
    select 1 from public.app_users u where u.id = new.approved_by
    and u.role = 'admin' and u.is_active
  ) then raise exception 'An active Vexim admin must approve the campaign'; end if;
  return new;
end;
$$;
drop trigger if exists sponsored_pilot_approver_ck on public.sponsored_pilot_campaigns;
create trigger sponsored_pilot_approver_ck before insert or update on public.sponsored_pilot_campaigns
  for each row execute function public.check_sponsored_pilot_approver();
revoke all on function public.check_sponsored_pilot_approver() from public, anon, authenticated;
alter table public.sponsored_pilot_campaigns enable row level security;
revoke all on public.sponsored_pilot_campaigns from public, anon, authenticated;
grant select, insert, update, delete on public.sponsored_pilot_campaigns to service_role;

create table if not exists public.sponsored_pilot_daily (
  campaign_id uuid not null references public.sponsored_pilot_campaigns(id) on delete cascade,
  day date not null,
  event_type text not null check (event_type in ('impression', 'click')),
  events bigint not null default 0 check (events >= 0),
  primary key (campaign_id, day, event_type)
);
alter table public.sponsored_pilot_daily enable row level security;
revoke all on public.sponsored_pilot_daily from public, anon, authenticated;
grant select, insert, update, delete on public.sponsored_pilot_daily to service_role;

-- Service-role only, atomic, rechecks campaign state/window at write time. No billing use.
create or replace function public.record_sponsored_pilot_event(p_campaign_id uuid, p_event_type text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_event_type not in ('impression', 'click') then raise exception 'Invalid sponsored event'; end if;
  if not exists (
    select 1 from public.sponsored_pilot_campaigns c where c.id = p_campaign_id
    and c.status = 'approved' and c.starts_at <= now() and c.ends_at > now()
  ) then return; end if;
  insert into public.sponsored_pilot_daily (campaign_id, day, event_type, events)
    values (p_campaign_id, (now() at time zone 'UTC')::date, p_event_type, 1)
  on conflict (campaign_id, day, event_type)
    do update set events = public.sponsored_pilot_daily.events + 1;
end;
$$;
revoke all on function public.record_sponsored_pilot_event(uuid, text) from public, anon, authenticated;
grant execute on function public.record_sponsored_pilot_event(uuid, text) to service_role;
notify pgrst, 'reload schema';
