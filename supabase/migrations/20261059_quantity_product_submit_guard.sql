-- On first submission, a product created with the quantity flow must still have
-- a current table. Lock the product and revision together so a concurrent edit
-- cannot put the product into review with an obsolete quote.
begin;
create or replace function public.submit_supplier_product_with_quantity_guard(
  p_product_id uuid, p_supplier_id uuid, p_expected_updated_at timestamptz,
  p_expected_review text, p_expected_ready boolean, p_proposal text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  price public.product_quantity_price_revisions%rowtype;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_updated_at is null or p_expected_ready is null then
    return jsonb_build_object('status','invalid');
  end if;
  select * into item from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_owned'); end if;
  if item.updated_at is distinct from p_expected_updated_at or item.supplier_review_status is distinct from p_expected_review or
     item.ready_for_buyer is distinct from p_expected_ready or item.supplier_review_status not in ('draft','changes_requested','paused') then
    return jsonb_build_object('status','changed');
  end if;
  if exists (select 1 from public.quantity_product_creation_requests where product_id = item.id) then
    select * into price from public.product_quantity_price_revisions
      where product_id = item.id and status in ('pending','approved')
      order by case status when 'pending' then 0 else 1 end limit 1 for update;
    if not found then return jsonb_build_object('status','price_missing'); end if;
    if price.product_context is null or price.product_context is distinct from public.quantity_product_review_context(to_jsonb(item)) then
      return jsonb_build_object('status','price_changed');
    end if;
  end if;
  update public.supplier_products set supplier_review_status = 'pending', supplier_review_note = null,
    ready_for_buyer = false, supplier_category_proposal = case when item.supplier_review_status = 'paused' then p_proposal else item.supplier_category_proposal end,
    updated_at = now() where id = item.id returning * into item;
  return jsonb_build_object('status','submitted','product',to_jsonb(item));
end;
$$;
revoke all on function public.submit_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text) from public, anon, authenticated;
grant execute on function public.submit_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text) to service_role;
notify pgrst, 'reload schema';
commit;
