-- Run before deploying category-defined product attributes. No existing product is altered.
begin;
alter table public.categories add column if not exists product_fields jsonb not null default '[]'::jsonb;
commit;
notify pgrst, 'reload schema';
