-- Separate import provenance from the target outreach segment.
-- Existing records are retained and receive a best-effort noodle segment backfill.
alter table public.prospects
  add column if not exists data_source text not null default 'Apollo',
  add column if not exists target_product text;

update public.prospects
set data_source = 'Apollo'
where data_source is null or btrim(data_source) = '';

update public.prospects
set target_product = 'Mì ăn liền'
where target_product is null
  and source_list is not null
  and (source_list ilike '%mì ăn liền%' or source_list ilike '%mỳ ăn liền%');

create index if not exists prospects_target_product_idx
  on public.prospects (target_product);
