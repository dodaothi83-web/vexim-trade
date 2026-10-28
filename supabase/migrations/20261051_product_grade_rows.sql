-- Multi-grade pricing table support (specs.grade_rows) + cashew W210 standard grade.
begin;

update public.categories
set
  product_fields = jsonb_build_array(
    jsonb_build_object(
      'key', 'grade',
      'label', 'Grade',
      'type', 'select',
      'options', jsonb_build_array('W180', 'W210', 'W240', 'W320', 'W450', 'SW', 'WS', 'LP', 'SP')
    )
  ),
  filters = jsonb_build_object(
    'grades', jsonb_build_array('W180', 'W210', 'W240', 'W320', 'W450', 'SW', 'WS', 'LP', 'SP')
  )
where slug in ('cashew-kernels', 'cashew');

create or replace view public.v_public_supplier_products as
select
  sp.id,
  sp.supplier_id,
  sp.slug,
  sp.name_i18n,
  coalesce(sp.name_i18n->>'en', sp.name)                as name,
  case
    when jsonb_typeof(sp.specs->'grade_rows') = 'array' then
      jsonb_set(
        sp.specs,
        '{grade_rows}',
        coalesce((
          select jsonb_agg(
            case
              when sp.price_publicly_visible and sp.ready_for_buyer
                   and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
                   and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
                   and s.fob_publicly_visible and s.fob_updated_at is not null
                   and s.fob_updated_at <= now()
                   and s.fob_updated_at > now() - interval '180 days'
                   and sp.ref_price > 0
                   and (sp.ref_price_max is null or sp.ref_price_max >= sp.ref_price)
                   and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
                then elem
              else elem || '{"price_min": null, "price_max": null}'::jsonb
            end
          )
          from jsonb_array_elements(sp.specs->'grade_rows') as elem
        ), '[]'::jsonb)
      )
    else sp.specs
  end                                                   as specs,
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
            and (sp.ref_price_max is null or sp.ref_price_max >= sp.ref_price)
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.ref_price end as ref_price,
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.ref_price_max is null or sp.ref_price_max >= sp.ref_price)
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.currency end as currency,
  sp.updated_at,
  case when sp.ready_for_buyer
    and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
    and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
    then regexp_replace(
    regexp_replace(sp.description_detail,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact via Vexim]', 'gi'),
    '(\+?[0-9][ ().-]?){9,15}[0-9]', '[contact via Vexim]', 'g') end as description_detail,
  sp.oem,
  sp.odm,
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and sp.ref_price_max >= sp.ref_price
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.ref_price_max end as ref_price_max
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
commit;
