-- Apply AFTER supplier product review migration and BEFORE deploying category proposal forms.
-- Supplier-proposed categories are private; staff links and product categories remain separate.
alter table public.suppliers
  add column if not exists requested_category_slugs text[] not null default '{}',
  add column if not exists requested_category_other text,
  add column if not exists categories_reviewed_at timestamptz;
alter table public.supplier_products
  add column if not exists supplier_category_proposal text,
  add column if not exists reviewed_category_slug text,
  add column if not exists supplier_originated boolean not null default false;
-- Pending supplier submissions from an earlier deployment remain gated after this migration.
update public.supplier_products set supplier_originated = true
  where supplier_review_status in ('draft', 'pending', 'changes_requested');
notify pgrst, 'reload schema';
