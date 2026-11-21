-- Báo cáo hiệu quả cho nhà cung cấp (đợt 3, chủ sàn chốt 2026-11-21): thêm lượt xem theo quốc gia và
-- nhật ký email báo cáo hằng tuần. Quốc gia lấy từ mã quốc gia Vercel gắn vào yêu cầu; không lưu IP,
-- không lưu danh tính người xem, chỉ cộng số theo ngày, nhà cung cấp, quốc gia.
begin;

create table if not exists public.supplier_traffic_country_daily (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  day date not null,
  country text not null check (country ~ '^[A-Z]{2}$'),
  views bigint not null default 0 check (views >= 0),
  primary key (supplier_id, day, country)
);
create index if not exists supplier_traffic_country_daily_day_idx on public.supplier_traffic_country_daily (day);
alter table public.supplier_traffic_country_daily enable row level security;
revoke all on public.supplier_traffic_country_daily from public, anon, authenticated;
grant select, insert, update, delete on public.supplier_traffic_country_daily to service_role;

create or replace function public.record_supplier_country_view(p_supplier_id uuid, p_country text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_supplier_id is null or p_country !~ '^[A-Z]{2}$' then
    raise exception 'Invalid country view';
  end if;
  insert into public.supplier_traffic_country_daily (supplier_id, day, country, views)
    values (p_supplier_id, (now() at time zone 'UTC')::date, p_country, 1)
  on conflict (supplier_id, day, country) do update set views = public.supplier_traffic_country_daily.views + 1;
end;
$$;
revoke all on function public.record_supplier_country_view(uuid, text) from public, anon, authenticated;
grant execute on function public.record_supplier_country_view(uuid, text) to service_role;

-- Email báo cáo hằng tuần: mỗi nhà cung cấp tối đa một thư mỗi tuần.
create table if not exists public.supplier_weekly_report_sends (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  week text not null,
  sent_at timestamptz not null default now(),
  primary key (supplier_id, week)
);
alter table public.supplier_weekly_report_sends enable row level security;

commit;
notify pgrst, 'reload schema';
