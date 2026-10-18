-- Giá tham khảo chỉ thuộc sản phẩm: không còn xuất khoảng giá chung của NCC
-- qua whitelist view. Giữ nguyên cột cũ và dữ liệu gốc (không xóa/ghi đè).
-- Giá sản phẩm chỉ công khai khi còn quyền NCC và chưa quá hạn.
-- Áp dụng trên production qua quy trình migration riêng, trước/đồng thời với deploy.

create or replace view public.v_public_suppliers as
select
  s.id,
  s.slug,
  coalesce(s.display_name, s.trade_name, s.name)        as display_name,
  s.supplier_type                                       as supplier_type,
  s.province,
  s.country,
  s.founded_year,
  s.employees,
  s.summary_i18n,
  s.moq_text,
  s.capacity_per_month,
  s.ports,
  s.incoterms,
  s.export_markets,
  s.private_label,
  s.verification_level,
  s.verified_at,
  s.next_reverify_at,
  case when s.rating_count >= 3 then s.rating_avg end   as rating_avg,
  case when s.rating_count >= 3 then s.rating_count end as rating_count,
  -- Legacy supplier-wide price columns retained in the view for compatibility,
  -- but always empty: reference prices belong to individual products only.
  case when false then s.fob_min end as fob_min,
  case when false then s.fob_max end as fob_max,
  case when false then s.fob_unit end as fob_unit,
  case when false then s.fob_currency end as fob_currency,
  s.fob_updated_at,
  s.lead_time_days,
  s.updated_at
from public.suppliers s
where s.status = 'published';

create or replace view public.v_public_supplier_products as
select
  sp.id,
  sp.supplier_id,
  sp.slug,
  sp.name_i18n,
  coalesce(sp.name_i18n->>'en', sp.name)                as name,
  sp.specs,
  sp.description,
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
  case when s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.ref_price end as ref_price,
  case when s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.currency end as currency,
  sp.updated_at
from public.supplier_products sp
join public.suppliers s on s.id = sp.supplier_id
where s.status = 'published';
