-- Supplier-stated sourcing details for CRM, supplier portal, buyer profiles and comparisons.
-- Nullable columns keep existing profiles valid. These fields are not verification results.
alter table public.suppliers
  add column if not exists raw_material_region text,
  add column if not exists input_material_origin text;

comment on column public.suppliers.raw_material_region is
  'Supplier-stated raw material region; may contain a province suggestion or a custom region.';
comment on column public.suppliers.input_material_origin is
  'Supplier-stated origin of input raw materials; not an independent origin verification.';

notify pgrst, 'reload schema';
