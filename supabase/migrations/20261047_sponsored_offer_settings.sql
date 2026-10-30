-- Configuration only. Does not open checkout, create orders or alter existing pushes.
-- Apply to staging first. Only the server service role may access this table.
create table if not exists public.sponsored_offer_settings (
  id boolean primary key default true check (id),
  price_vnd bigint check (price_vnd between 1 and 1000000000),
  hold_minutes integer not null default 20 check (hold_minutes between 1 and 1440),
  packages_per_slot integer not null default 4 check (packages_per_slot between 1 and 20),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id)
);
insert into public.sponsored_offer_settings (id) values (true) on conflict (id) do nothing;
alter table public.sponsored_offer_settings enable row level security;
revoke all on public.sponsored_offer_settings from public, anon, authenticated;
grant select, update on public.sponsored_offer_settings to service_role;

create or replace function public.guard_sponsored_offer_settings()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.app_users where id = new.updated_by and role = 'admin' and is_active) then
    raise exception 'Active admin required to update sponsored offer settings';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists sponsored_offer_settings_guard on public.sponsored_offer_settings;
create trigger sponsored_offer_settings_guard before update on public.sponsored_offer_settings
  for each row execute function public.guard_sponsored_offer_settings();
revoke all on function public.guard_sponsored_offer_settings() from public, anon, authenticated;
notify pgrst, 'reload schema';
