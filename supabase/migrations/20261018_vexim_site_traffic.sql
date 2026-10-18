-- Apply AFTER 20261017_supplier_traffic_daily.sql on the same Supabase project.
-- No IP, cookie, visitor identifier, referrer, query string, or RFQ token is stored.
-- This table holds only non-supplier public page counts; supplier profile/product
-- counts remain in supplier_traffic_daily and are UNIONed on read (no double count).
create table if not exists public.vexim_site_traffic_daily (
  day date not null,
  page_key text not null check (length(page_key) between 1 and 120),
  views bigint not null default 0 check (views >= 0),
  primary key (day, page_key)
);
alter table public.vexim_site_traffic_daily enable row level security;
revoke all on public.vexim_site_traffic_daily from public, anon, authenticated;
grant select, insert, update on public.vexim_site_traffic_daily to service_role;

create or replace function public.record_vexim_site_page_view(p_page_key text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_page_key not in ('home', 'rfq', 'blog', 'cashew', 'compare', 'for-suppliers', 'how-we-verify')
    and p_page_key !~ '^(category|article):[a-z0-9][a-z0-9-]{0,99}$' then
    raise exception 'Invalid public page key';
  end if;
  insert into public.vexim_site_traffic_daily (day, page_key, views)
    values ((now() at time zone 'UTC')::date, p_page_key, 1)
  on conflict (day, page_key) do update set views = public.vexim_site_traffic_daily.views + 1;
end;
$$;
revoke all on function public.record_vexim_site_page_view(text) from public, anon, authenticated;
grant execute on function public.record_vexim_site_page_view(text) to service_role;

create or replace function public.read_vexim_site_traffic(p_days integer)
returns table(day date, page_key text, views bigint)
language plpgsql security invoker set search_path = public as $$
begin
  if p_days not in (7, 30, 90) then raise exception 'Invalid date range'; end if;
  return query
  select v.day, v.page_key, v.views from public.vexim_site_traffic_daily v
    where v.day >= (now() at time zone 'UTC')::date - (p_days - 1)
  union all
  select s.day,
    case when s.page_kind = 'profile' then 'supplier_profile' else 'product_detail' end as page_key,
    sum(s.views)::bigint as views
  from public.supplier_traffic_daily s
    where s.day >= (now() at time zone 'UTC')::date - (p_days - 1)
  group by s.day, s.page_kind;
end;
$$;
revoke all on function public.read_vexim_site_traffic(integer) from public, anon, authenticated;
grant execute on function public.read_vexim_site_traffic(integer) to service_role;
notify pgrst, 'reload schema';
