-- Apply after the supplier-category/product-review migrations and before deploying featured-image selection.
-- Existing products keep their current first buyer-shareable image until staff picks a cover.
alter table public.supplier_products add column if not exists featured_media_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_products_featured_media_fk'
      and conrelid = 'public.supplier_products'::regclass) then
    alter table public.supplier_products add constraint supplier_products_featured_media_fk
      foreign key (featured_media_id) references public.media_assets(id) on delete set null;
  end if;
end $$;
notify pgrst, 'reload schema';
