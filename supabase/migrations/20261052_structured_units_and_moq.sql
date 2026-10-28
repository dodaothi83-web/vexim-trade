-- Structured units & MOQ standardization:
-- 1. Per-category allowed MOQ units list (categories.moq_units).
-- 2. Automatic backfill of unambiguous legacy MOQs ("1 tấn" -> 1 MT, "100kg" -> 100 kg,
--    "1 cont 20ft..." -> 1 × 20ft container, "1 x 40ft..." -> 1 × 40ft container).
-- 3. Admin inspection view public.v_products_unit_manual_review for ambiguous rows
--    (e.g. "280 Túi" / "500 thùng" missing bag/carton weight, or legacy non-weight price units).

begin;

alter table public.categories
  add column if not exists moq_units jsonb;

-- Backfill unambiguous top-level MOQs on supplier_products:
-- (a) Containers 20ft / 40ft
with parsed_containers as (
  select
    sp.id,
    ((regexp_match(btrim(sp.moq), '^(\d+)\s*(?:×|x|\*)?\s*(?:cont(?:ainer)?s?\s*)?(20|40)\s*(?:ft|''|hc|hq|rf)?(?:\s*(?:fcl|containers?|cont))?(?:\s*\([^)]*\))?$', 'i'))[1])::numeric as qty,
    ((regexp_match(btrim(sp.moq), '^(\d+)\s*(?:×|x|\*)?\s*(?:cont(?:ainer)?s?\s*)?(20|40)\s*(?:ft|''|hc|hq|rf)?(?:\s*(?:fcl|containers?|cont))?(?:\s*\([^)]*\))?$', 'i'))[2]) as cont_size
  from public.supplier_products sp
  where (sp.moq_unit is null or sp.moq_qty is null)
    and sp.moq is not null
    and btrim(sp.moq) ~* '^(\d+)\s*(?:×|x|\*)?\s*(?:cont(?:ainer)?s?\s*)?(20|40)\s*(?:ft|''|hc|hq|rf)?(?:\s*(?:fcl|containers?|cont))?(?:\s*\([^)]*\))?$'
)
update public.supplier_products sp
set
  moq_qty = pc.qty,
  moq_unit = case when pc.cont_size = '40' then 'cont_40ft' else 'cont_20ft' end,
  moq = trim(trailing '.' from trim(trailing '0' from pc.qty::text)) || ' × ' || pc.cont_size || 'ft ' ||
        case when pc.qty = 1 then 'container' else 'containers' end
from parsed_containers pc
where sp.id = pc.id
  and pc.qty > 0
  and pc.qty <= 500;

-- (b) Metric tons ("1 tấn", "5 tan", "20 MT", "1 metric ton", "2.5 tonnes", "1,5 tấn")
with parsed_mt as (
  select
    sp.id,
    replace(
      (regexp_match(btrim(sp.moq), '^(\d+(?:[.,]\d{1,3})?)\s*(mt|tấn|tan|metric\s+tons?|tonnes?|tons?)$', 'i'))[1],
      ',',
      '.'
    )::numeric as qty
  from public.supplier_products sp
  where (sp.moq_unit is null or sp.moq_qty is null)
    and sp.moq is not null
    and btrim(sp.moq) ~* '^(\d+(?:[.,]\d{1,3})?)\s*(mt|tấn|tan|metric\s+tons?|tonnes?|tons?)$'
)
update public.supplier_products sp
set
  moq_qty = pm.qty,
  moq_unit = 'mt',
  moq = trim(trailing '.' from trim(trailing '0' from pm.qty::text)) || ' MT'
from parsed_mt pm
where sp.id = pm.id
  and pm.qty > 0
  and pm.qty <= 1000000;

-- (c) Kilograms ("27kg", "100kg", "500 kg", "25 kgs")
with parsed_kg as (
  select
    sp.id,
    replace(
      (regexp_match(btrim(sp.moq), '^(\d+(?:[.,]\d{1,3})?)\s*(kgs?|kilograms?)$', 'i'))[1],
      ',',
      '.'
    )::numeric as qty
  from public.supplier_products sp
  where (sp.moq_unit is null or sp.moq_qty is null)
    and sp.moq is not null
    and btrim(sp.moq) ~* '^(\d+(?:[.,]\d{1,3})?)\s*(kgs?|kilograms?)$'
)
update public.supplier_products sp
set
  moq_qty = pk.qty,
  moq_unit = 'kg',
  moq = trim(trailing '.' from trim(trailing '0' from pk.qty::text)) || ' kg'
from parsed_kg pk
where sp.id = pk.id
  and pk.qty > 0
  and pk.qty <= 1000000;

-- Admin helper view: lists products whose MOQ or price unit still requires manual input
-- (for example "280 Túi" / "500 thùng" missing bag/carton weight, or legacy unit "Bag" / "thùng").
create or replace view public.v_products_unit_manual_review as
select
  sp.id as product_id,
  s.name as supplier_name,
  sp.name as product_name,
  coalesce(sp.reviewed_category_slug, sp.supplier_category_proposal, sp.category) as category_slug,
  sp.moq as raw_moq,
  sp.moq_qty,
  sp.moq_unit,
  sp.ref_price,
  sp.ref_price_max,
  sp.unit as raw_price_unit,
  sp.currency,
  sp.ready_for_buyer,
  sp.supplier_review_status,
  case
    when sp.moq is not null
         and btrim(sp.moq) <> ''
         and lower(btrim(sp.moq)) not in ('on request', 'theo yêu cầu', 'theo yeu cau', 'thỏa thuận', 'thoa thuan', '-')
         and (sp.moq_qty is null or sp.moq_unit is null)
      then case
        when btrim(sp.moq) ~* '^\d+\s*(bao|túi|tui|bags?|pouches?|sacks?)$'
          then 'Thiếu trọng lượng mỗi bao (kg)'
        when btrim(sp.moq) ~* '^\d+\s*(thùng|thung|cartons?|boxes?|hộp|hop)$'
          then 'Thiếu trọng lượng mỗi thùng (kg)'
        else 'MOQ tự do chưa nằm trong đơn vị chuẩn'
      end
    when sp.ref_price is not null
         and sp.ref_price > 0
         and lower(coalesce(btrim(sp.unit), '')) not in ('kg', 'kgs', 'kilogram', 'kilograms', 'lb', 'lbs', 'pound', 'pounds', 'mt', 't', 'ton', 'tons', 'tonne', 'tonnes', 'tấn', 'tan')
      then 'Đơn vị giá cũ không tự quy đổi sang USD/kg hoặc USD/MT'
    else null
  end as review_reason
from public.supplier_products sp
left join public.suppliers s on s.id = sp.supplier_id
where
  (
    sp.moq is not null
    and btrim(sp.moq) <> ''
    and lower(btrim(sp.moq)) not in ('on request', 'theo yêu cầu', 'theo yeu cau', 'thỏa thuận', 'thoa thuan', '-')
    and (sp.moq_qty is null or sp.moq_unit is null)
  )
  or (
    sp.ref_price is not null
    and sp.ref_price > 0
    and jsonb_typeof(sp.specs->'grade_rows') is distinct from 'array'
    and lower(coalesce(btrim(sp.unit), '')) not in ('kg', 'kgs', 'kilogram', 'kilograms', 'lb', 'lbs', 'pound', 'pounds', 'mt', 't', 'ton', 'tons', 'tonne', 'tonnes', 'tấn', 'tan')
  );

notify pgrst, 'reload schema';
commit;
