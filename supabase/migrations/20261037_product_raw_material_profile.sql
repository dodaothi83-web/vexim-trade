-- Supplier-stated sourcing details for each product in CRM, supplier portal and buyer comparisons.
-- Nullable columns keep existing products valid. These fields are not verification results.
alter table public.supplier_products
  add column if not exists raw_material_region text,
  add column if not exists input_material_origin text;

comment on column public.supplier_products.raw_material_region is
  'Product-specific raw material region; may contain a province suggestion or a custom region.';
comment on column public.supplier_products.input_material_origin is
  'Product-specific origin of input raw materials; not an independent origin verification.';

notify pgrst, 'reload schema';
