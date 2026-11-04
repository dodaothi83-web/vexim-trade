-- Annual output is not monthly capacity. No legacy value is converted or overwritten.
begin;
alter table public.suppliers add column if not exists annual_output text;
comment on column public.suppliers.annual_output is 'Supplier-declared annual output with its stated unit; never inferred from monthly capacity.';
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
  s.updated_at,
  s.annual_output
from public.suppliers s
where s.status = 'published';

commit;
notify pgrst, 'reload schema';
