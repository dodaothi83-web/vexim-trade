-- Deploy in coordination with application code, after 20261049. Only profiles
-- created by the new self-registration code opt in. Historical records default
-- false: a previously hidden or archived profile must not be silently reopened.
begin;
alter table public.suppliers add column if not exists auto_publish_after_l1 boolean not null default false;

-- Turning off a public profile always retires auto-publication permanently.
-- A new auto-eligible profile cannot be manually published before L1 approval.
create or replace function public.guard_supplier_first_l1_publication()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if old.auto_publish_after_l1 and new.status = 'published' and old.status is distinct from 'published'
     and not exists (select 1 from public.verifications v where v.supplier_id = new.id and v.target_level = 1 and v.status = 'approved') then
    raise exception 'Approve L1 before publishing this new supplier';
  end if;
  if new.status in ('published', 'suspended', 'archived', 'verified', 'paused') then
    new.auto_publish_after_l1 := false;
  end if;
  return new;
end;
$$;
drop trigger if exists supplier_first_l1_publication_guard on public.suppliers;
create trigger supplier_first_l1_publication_guard before update of status on public.suppliers
for each row execute function public.guard_supplier_first_l1_publication();
revoke all on function public.guard_supplier_first_l1_publication() from public, anon, authenticated;

-- The supplier row and confirmation audit are updated in the same transaction
-- as approval. Concurrent suspension wins: never unhide a held supplier.
create or replace function public.publish_new_supplier_after_l1()
returns trigger language plpgsql security invoker set search_path = public as $$
declare s public.suppliers%rowtype; actor_email text;
begin
  if new.target_level <> 1 or new.status <> 'approved' or old.status = 'approved' then return new; end if;
  select * into s from public.suppliers where id = new.supplier_id for update;
  if not found then raise exception 'Supplier not found for L1 approval'; end if;
  if not s.auto_publish_after_l1 then return new; end if;
  if s.status not in ('draft', 'submitted', 'in_verification') then return new; end if;
  if s.onboarding_status <> 'approved' then
    raise exception 'L1_AUTO_PUBLICATION_PORTAL_NOT_APPROVED';
  end if;
  if not exists (select 1 from public.app_users u where u.supplier_id = s.id and u.role = 'supplier' and u.is_active)
     or coalesce(trim(s.name),'') = '' or coalesce(trim(s.products),'') = ''
     or coalesce(trim(s.phone),'') = '' or coalesce(trim(s.tax_id),'') = '' or s.supplier_type is null then
    raise exception 'L1_AUTO_PUBLICATION_PROFILE_INCOMPLETE';
  end if;
  -- A demo or test profile must not be published through this shortcut.
  if coalesce(s.is_demo, false) or coalesce(s.slug, '') ~* '(^|[-_])test([-_]|$)|do-not-contact'
     or (coalesce(s.name, '') || ' ' || coalesce(s.summary_i18n::text, '')) ~* 'test only|test supplier|do not contact' then
    raise exception 'L1_AUTO_PUBLICATION_TEST_PROFILE';
  end if;
  update public.suppliers set status = 'published', auto_publish_after_l1 = false where id = s.id;
  select email into actor_email from public.app_users where id = new.approved_by;
  insert into public.audit_log (actor_id, actor_email, entity, entity_id, action, before, after)
    values (new.approved_by, actor_email, 'supplier', s.id::text, 'supplier.auto_published_after_l1',
      jsonb_build_object('status', s.status), jsonb_build_object('status', 'published', 'verification_id', new.id));
  return new;
end;
$$;
drop trigger if exists supplier_auto_publish_after_l1 on public.verifications;
create trigger supplier_auto_publish_after_l1 after update of status on public.verifications
for each row execute function public.publish_new_supplier_after_l1();
revoke all on function public.publish_new_supplier_after_l1() from public, anon, authenticated;
commit;
notify pgrst, 'reload schema';
