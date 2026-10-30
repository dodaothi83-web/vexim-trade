-- Apply after the supplier portal migrations, before enabling the traffic dashboard.
-- Page-view totals only: no IP, user-agent, referrer, visitor ID or buyer data is stored.
create table if not exists public.supplier_traffic_daily (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  day date not null,
  page_kind text not null check (page_kind in ('profile', 'product')),
  resource_id uuid not null,
  views bigint not null default 0 check (views >= 0),
  primary key (supplier_id, day, page_kind, resource_id)
);
create index if not exists supplier_traffic_daily_day_idx on public.supplier_traffic_daily (day);
alter table public.supplier_traffic_daily enable row level security;
revoke all on public.supplier_traffic_daily from public, anon, authenticated;
grant select, insert, update, delete on public.supplier_traffic_daily to service_role;

-- Atomic increment; service_role only. The app checks public eligibility before calling it.
create or replace function public.record_supplier_page_view(p_supplier_id uuid, p_page_kind text, p_resource_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_page_kind not in ('profile', 'product') or p_supplier_id is null or p_resource_id is null then
    raise exception 'Invalid page view';
  end if;
  insert into public.supplier_traffic_daily (supplier_id, day, page_kind, resource_id, views)
    values (p_supplier_id, (now() at time zone 'UTC')::date, p_page_kind, p_resource_id, 1)
  on conflict (supplier_id, day, page_kind, resource_id)
    do update set views = public.supplier_traffic_daily.views + 1;
end;
$$;
revoke all on function public.record_supplier_page_view(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_supplier_page_view(uuid, text, uuid) to service_role;
notify pgrst, 'reload schema';
