-- Apply after supplier_onboarding_gate before deploying supplier-managed products.
-- Existing staff-managed products keep their previous readiness/publication behavior.
alter table public.supplier_products add column if not exists supplier_review_status text not null default 'approved';
alter table public.supplier_products add column if not exists supplier_review_note text;
alter table public.supplier_products drop constraint if exists supplier_products_supplier_review_status_check;
alter table public.supplier_products add constraint supplier_products_supplier_review_status_check
  check (supplier_review_status in ('draft','pending','approved','changes_requested'));
create index if not exists supplier_products_review_queue_idx
  on public.supplier_products(supplier_review_status, updated_at desc);
-- The application writes via service_role. Browser clients must not update moderation/publication flags directly.
notify pgrst, 'reload schema';
