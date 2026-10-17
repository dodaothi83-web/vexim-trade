-- Apply after 20261017_product_featured_image.sql, before deploying the detailed description / price-visibility forms.
alter table public.supplier_products add column if not exists description_detail text;

-- Backfill only on FIRST run. A rerun must never re-enable a price that was later switched off.
do $$ begin
  if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'supplier_products' and column_name = 'price_publicly_visible') then
    alter table public.supplier_products add column price_publicly_visible boolean not null default false;
    -- Preserve prices that were ALREADY public under the previous supplier-consent policy.
    update public.supplier_products sp
    set price_publicly_visible = true
    from public.suppliers s
    where sp.supplier_id = s.id and s.status = 'published' and not coalesce(s.is_demo, false)
      and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
      and s.fob_publicly_visible and s.fob_updated_at is not null
      and s.fob_updated_at <= now() and s.fob_updated_at > now() - interval '180 days'
      and sp.ref_price > 0 and sp.ready_for_buyer
      and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
      and (sp.price_valid_until is null or sp.price_valid_until >= current_date);
  end if;
end $$;

-- The public SQL view must enforce the same per-product opt-in and supplier consent as the app.
-- Keep the existing view column order for CREATE OR REPLACE compatibility.
create or replace view public.v_public_supplier_products as
select
  sp.id,
  sp.supplier_id,
  sp.slug,
  sp.name_i18n,
  coalesce(sp.name_i18n->>'en', sp.name)                as name,
  sp.specs,
  regexp_replace(
    regexp_replace(sp.description,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact via Vexim]', 'gi'),
    '(\+?[0-9][ ().-]?){9,15}[0-9]', '[contact via Vexim]', 'g') as description,
  sp.packaging,
  sp.moq_qty,
  sp.moq_unit,
  sp.moq                                                as moq_text,
  sp.monthly_capacity,
  sp.lead_time_days,
  sp.samples,
  sp.images,
  sp.export_port,
  sp.incoterm,
  sp.incoterm_place,
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.ref_price end as ref_price,
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.currency end as currency,
  sp.updated_at,
  case when sp.ready_for_buyer
    and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
    and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
    then regexp_replace(
    regexp_replace(sp.description_detail,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact via Vexim]', 'gi'),
    '(\+?[0-9][ ().-]?){9,15}[0-9]', '[contact via Vexim]', 'g') end as description_detail
from public.supplier_products sp
join public.suppliers s on s.id = sp.supplier_id
where s.status = 'published'
  and not coalesce(s.is_demo, false)
  and sp.ready_for_buyer
  and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
  and (not sp.supplier_originated or exists (
    select 1 from public.categories c where c.slug = sp.reviewed_category_slug
      and c.status = 'published' and c.is_published
  ));
notify pgrst, 'reload schema';
