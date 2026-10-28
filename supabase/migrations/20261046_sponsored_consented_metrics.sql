-- Separate the new consent-gated series from historical, potentially ungated
-- counters. Do not delete or silently reclassify historical measurements.
create table if not exists public.sponsored_push_consented_daily (
  push_id uuid not null references public.sponsored_pushes(id) on delete cascade,
  day date not null,
  event_type text not null check (event_type in ('impression', 'click')),
  events bigint not null default 0 check (events >= 0),
  primary key (push_id, day, event_type)
);
alter table public.sponsored_push_consented_daily enable row level security;
revoke all on public.sponsored_push_consented_daily from public, anon, authenticated;
grant select, insert, update on public.sponsored_push_consented_daily to service_role;

-- Called only by the server endpoint AFTER it checks the consent cookie.
create or replace function public.record_consented_sponsored_push_event(p_push_id uuid, p_event_type text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_event_type not in ('impression', 'click') then
    raise exception 'Invalid sponsored push event';
  end if;
  if not exists (
    select 1 from public.sponsored_pushes s where s.id = p_push_id
      and s.status = 'approved' and s.starts_at <= now() and s.ends_at > now()
  ) then return; end if;
  insert into public.sponsored_push_consented_daily (push_id, day, event_type, events)
    values (p_push_id, (now() at time zone 'UTC')::date, p_event_type, 1)
  on conflict (push_id, day, event_type)
    do update set events = public.sponsored_push_consented_daily.events + 1;
end;
$$;
revoke all on function public.record_consented_sponsored_push_event(uuid, text) from public, anon, authenticated;
grant execute on function public.record_consented_sponsored_push_event(uuid, text) to service_role;
notify pgrst, 'reload schema';
