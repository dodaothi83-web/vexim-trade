-- Allow an active admin to approve a verification they inspected themselves.
-- The application requires an explicit re-check confirmation and writes an audit
-- log. Reviewer self-approval remains blocked in both the application and DB.
-- Apply after 20261033_uploaded_documents_single_reviewer.sql.
begin;

alter table public.verifications
  add column if not exists legacy_self_approved boolean not null default false,
  add column if not exists self_approved boolean not null default false;

-- The row-level CHECK recognizes an explicit single-person decision. The trigger
-- below narrows the same-inspector exception to an active admin; supplier-uploaded
-- reviews (inspector_id IS NULL) retain the behaviour introduced in 20261033.
alter table public.verifications drop constraint if exists verifications_four_eyes;
alter table public.verifications add constraint verifications_four_eyes
  check (
    approved_by is null
    or (inspector_id is not null and (
      inspector_id <> approved_by or legacy_self_approved or self_approved
    ))
    or (inspector_id is null and self_approved)
  ) not valid;

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
         and u.role = 'admin'
         and u.is_active
     ) then
    raise exception 'Only an active admin can self-approve a verification';
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
  'Explicit single-person decision: supplier-uploaded review with no inspector, or active admin re-checking and approving their own inspection. Always audit logged.';

commit;
notify pgrst, 'reload schema';
