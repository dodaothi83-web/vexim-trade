-- Single-person verification for staff who hold BOTH inspect and approve
-- permissions (admin and sourcing). This removes the mandatory second-reviewer
-- bottleneck without allowing AI or supplier accounts to approve themselves.
-- Apply after 20261033; this migration is self-contained and supersedes the
-- admin-only exception in 20261034 when both are present.
begin;

alter table public.verifications
  add column if not exists legacy_self_approved boolean not null default false,
  add column if not exists self_approved boolean not null default false;

alter table public.verifications drop constraint if exists verifications_four_eyes;
alter table public.verifications add constraint verifications_four_eyes
  check (
    approved_by is null
    or (inspector_id is not null and (
      inspector_id <> approved_by or legacy_self_approved or self_approved
    ))
    or (inspector_id is null and self_approved)
  ) not valid;

-- Keep the DB role check aligned with the application permission matrix.
-- Reviewer can still approve somebody else's inspection, but cannot use the
-- same-person path because that role does not hold verifications.inspect.
create or replace function public.check_verification_self_approval()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.approved_by is not null
     and new.inspector_id = new.approved_by
     and not new.legacy_self_approved
     and not exists (
       select 1 from public.app_users u
       where u.id = new.approved_by
         and u.role in ('admin', 'sourcing')
         and u.is_active
     ) then
    raise exception 'Only active staff with inspect and approve permissions can complete their own verification';
  end if;
  return new;
end;
$$;

drop trigger if exists verifications_self_approval_guard on public.verifications;
create trigger verifications_self_approval_guard
  before insert or update of status, inspector_id, approved_by, self_approved, legacy_self_approved
  on public.verifications
  for each row execute function public.check_verification_self_approval();

revoke all on function public.check_verification_self_approval() from public, anon, authenticated;

comment on column public.verifications.self_approved is
  'Explicit single-person decision: supplier-uploaded review with no inspector, or authorized admin/sourcing staff completing their own inspection after an evidence re-check. AI never approves. Always audit logged.';

commit;
notify pgrst, 'reload schema';
