-- The user requires email for every active target contact.
-- This deletes only records with a missing or blank email.
-- Activities cascade; related email messages are retained and unlinked by ON DELETE SET NULL.
-- Optional preview before applying: select count(*) from public.prospects where email is null or btrim(email) = '';
begin;

delete from public.prospects
where email is null or btrim(email) = '';

alter table public.prospects
  alter column email set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'prospects_email_nonblank_check'
      and conrelid = 'public.prospects'::regclass
  ) then
    alter table public.prospects
      add constraint prospects_email_nonblank_check check (btrim(email) <> '');
  end if;
end $$;

commit;
