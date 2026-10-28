-- Apply before deploying the application changes. Keep historical sourcing accounts
-- and verification decisions; deactivate the former rather than deleting them.
begin;

with locked as (
  update public.app_users set is_active = false
  where role = 'sourcing' and is_active = true
  returning id, email
)
insert into public.audit_log (actor_id, actor_email, entity, entity_id, action, before, after)
select null, null, 'user', id::text, 'user.sourcing_role_suspended',
       jsonb_build_object('role', 'sourcing', 'is_active', true),
       jsonb_build_object('role', 'sourcing', 'is_active', false, 'reason', 'role_temporarily_disabled')
from locked;

create or replace function public.guard_disabled_sourcing_role()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.role = 'sourcing' then
    if tg_op = 'INSERT' then
      raise exception 'Sourcing role is temporarily disabled';
    elsif old.role <> 'sourcing' or new.is_active then
      raise exception 'Sourcing role is temporarily disabled';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists app_users_sourcing_role_guard on public.app_users;
create trigger app_users_sourcing_role_guard before insert or update of role, is_active on public.app_users
for each row execute function public.guard_disabled_sourcing_role();
revoke all on function public.guard_disabled_sourcing_role() from public, anon, authenticated;

-- Add explicit confirmation without changing existing historical decisions.
alter table public.verifications
  add column if not exists evidence_confirmed_at timestamptz,
  add column if not exists evidence_confirmed_by uuid references public.app_users(id) on delete set null;

create or replace function public.check_verification_self_approval()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'approved' then
    raise exception 'A verification must be submitted before it can be approved';
  end if;
  if new.approved_by is not null
     and new.inspector_id = new.approved_by
     and not new.legacy_self_approved
     and not exists (select 1 from public.app_users u where u.id = new.approved_by
                     and u.role in ('admin', 'reviewer') and u.is_active) then
    raise exception 'Only active admin or review lead can complete their own verification';
  end if;
  return new;
end;
$$;

-- Confirmation and its audit entry commit with the approval: if audit insertion
-- fails the whole update rolls back, rather than silently losing the record.
create or replace function public.log_confirmed_verification_approval()
returns trigger language plpgsql security invoker set search_path = public as $$
declare approver_email text;
begin
  if old.status = 'approved' and new.status = 'approved' and
     (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
      or new.evidence_confirmed_by is distinct from old.evidence_confirmed_by
      or new.evidence_confirmed_at is distinct from old.evidence_confirmed_at) then
    raise exception 'Verification has already been approved';
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if old.status <> 'submitted' then
      raise exception 'Only submitted verifications can be approved';
    end if;
    if new.approved_by is null or new.evidence_confirmed_by is distinct from new.approved_by
       or new.evidence_confirmed_at is null then
      raise exception 'Evidence comparison confirmation is required before approval';
    end if;
    select email into approver_email from public.app_users
    where id = new.approved_by and is_active and role in ('admin', 'reviewer');
    if not found then raise exception 'Approval requires active admin or review lead'; end if;
    insert into public.audit_log (actor_id, actor_email, entity, entity_id, action, before, after)
    values (new.approved_by, approver_email, 'supplier', new.supplier_id::text,
      'verification.evidence_confirmation.l' || new.target_level::text,
      jsonb_build_object('id', old.id, 'status', old.status),
      jsonb_build_object('id', new.id, 'status', new.status,
        'confirmed_by', new.evidence_confirmed_by, 'confirmed_at', new.evidence_confirmed_at,
        'inspector_id', new.inspector_id, 'self_approved', new.self_approved));
  end if;
  return new;
end;
$$;
drop trigger if exists verification_confirmed_approval_log on public.verifications;
create trigger verification_confirmed_approval_log after update of status on public.verifications
for each row execute function public.log_confirmed_verification_approval();
revoke all on function public.log_confirmed_verification_approval() from public, anon, authenticated;

commit;
notify pgrst, 'reload schema';
