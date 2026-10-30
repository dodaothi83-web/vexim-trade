-- Retire manual creation/approval without modifying or deleting existing rows.
-- New paid activation must be introduced by a future reviewed migration; until
-- then all inserts and every transition into approved are denied, including
-- calls made with service_role. Existing approved packages continue unchanged.
create or replace function public.guard_retired_sponsored_manual_flow()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    raise exception 'Manual sponsored package creation is disabled';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    raise exception 'Manual sponsored package activation is disabled';
  end if;
  return new;
end;
$$;
drop trigger if exists sponsored_manual_flow_retired on public.sponsored_pushes;
create trigger sponsored_manual_flow_retired before insert or update on public.sponsored_pushes
  for each row execute function public.guard_retired_sponsored_manual_flow();
revoke all on function public.guard_retired_sponsored_manual_flow() from public, anon, authenticated;

-- Record a violation stop and the state change in the same transaction. This
-- records no customer payment/refund and does not alter the paid time window.
create table if not exists public.sponsored_violation_stops (
  id uuid primary key default gen_random_uuid(),
  push_id uuid not null references public.sponsored_pushes(id),
  actor_id uuid not null references public.app_users(id),
  reason text not null check (length(trim(reason)) between 5 and 400),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.sponsored_violation_stops enable row level security;
revoke all on public.sponsored_violation_stops from public, anon, authenticated;
grant select, insert on public.sponsored_violation_stops to service_role;

create or replace function public.stop_sponsored_for_violation(p_push_id uuid, p_actor_id uuid, p_reason text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare stopped_id uuid;
begin
  if not exists (select 1 from public.app_users where id = p_actor_id and role = 'admin' and is_active) then
    raise exception 'Active admin required';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 400 then
    raise exception 'A violation reason of 5-400 characters is required';
  end if;
  update public.sponsored_pushes set status = 'paused'
    where id = p_push_id and status = 'approved' and ends_at > clock_timestamp()
    returning id into stopped_id;
  if stopped_id is null then return false; end if;
  insert into public.sponsored_violation_stops(push_id, actor_id, reason)
    values (stopped_id, p_actor_id, trim(p_reason));
  return true;
end;
$$;
revoke all on function public.stop_sponsored_for_violation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.stop_sponsored_for_violation(uuid, uuid, text) to service_role;
notify pgrst, 'reload schema';
