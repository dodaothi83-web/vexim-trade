-- Deploy BEFORE the CMS/supplier image code. Safe to rerun against an existing
-- RFQ foundation schema; no category or supplier content is overwritten.
begin;

alter table public.categories
  add column if not exists h1_i18n jsonb,
  add column if not exists body_i18n jsonb,
  add column if not exists spec_columns jsonb not null default '[]'::jsonb,
  add column if not exists spec_rows jsonb not null default '[]'::jsonb,
  add column if not exists buying_facts jsonb not null default '[]'::jsonb,
  add column if not exists filters jsonb not null default '[]'::jsonb,
  add column if not exists hero_image text,
  add column if not exists hero_alt_i18n jsonb,
  add column if not exists homepage_kicker_i18n jsonb,
  add column if not exists active_on_homepage boolean not null default false,
  add column if not exists status text,
  add column if not exists seo_indexable boolean not null default false,
  add column if not exists previous_slugs text[] not null default '{}',
  add column if not exists created_by text,
  add column if not exists updated_by text;

-- Backfill only rows created before status existed, keep editorial state of rows
-- that already have a status. public_page_ready is deliberately NOT persisted.
update public.categories
set status = case when is_published then 'published' else 'draft' end
where status is null;
alter table public.categories alter column status set default 'draft';
alter table public.categories alter column status set not null;

alter table public.suppliers
  add column if not exists profile_image text,
  add column if not exists cover_image text,
  add column if not exists is_demo boolean not null default false;

-- The app uses this private bucket through its service-role Storage client.
insert into storage.buckets (id, name, public)
values ('vexim-media', 'vexim-media', false)
on conflict (id) do nothing;

commit;
-- Supabase/PostgREST should refresh automatically after DDL; force refresh for
-- already running workers that report "column ... in the schema cache".
notify pgrst, 'reload schema';
