-- Publication of a product created with the new model requires a reviewed price
-- for the same material details and category. Legacy listings keep their current
-- behavior and data until the public catalog cutover is complete.
begin;
create or replace function public.decide_supplier_product_with_quantity_guard(
  p_product_id uuid, p_supplier_id uuid, p_expected_updated_at timestamptz,
  p_expected_review text, p_expected_ready boolean, p_decision text,
  p_category text, p_note text, p_buyer_enabled boolean
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  price public.product_quantity_price_revisions%rowtype;
  current_category text;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_updated_at is null or p_expected_ready is null or
     p_decision not in ('approved','changes_requested') or (p_decision = 'changes_requested' and coalesce(btrim(p_note),'') = '') then
    return jsonb_build_object('status','invalid');
  end if;
  select * into item from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if item.updated_at is distinct from p_expected_updated_at or item.supplier_review_status is distinct from p_expected_review or
     item.ready_for_buyer is distinct from p_expected_ready or
     not (item.supplier_review_status = 'pending' or (p_decision = 'approved' and item.supplier_review_status = 'approved' and not item.ready_for_buyer)) then
    return jsonb_build_object('status','changed');
  end if;
  if p_decision = 'approved' and exists (select 1 from public.quantity_product_creation_requests where product_id = item.id) then
    if p_buyer_enabled is not true then return jsonb_build_object('status','buyer_not_enabled'); end if;
    current_category := coalesce(item.reviewed_category_slug, item.supplier_category_proposal, item.category);
    if p_category is distinct from current_category then return jsonb_build_object('status','category_changed'); end if;
    select * into price from public.product_quantity_price_revisions
      where product_id = item.id and status = 'approved' for update;
    if not found then return jsonb_build_object('status','price_not_approved'); end if;
    if price.product_context is null or price.product_context is distinct from public.quantity_product_review_context(to_jsonb(item)) then
      return jsonb_build_object('status','price_changed');
    end if;
  end if;
  update public.supplier_products set supplier_review_status = p_decision,
    supplier_review_note = case when p_decision = 'approved' then null else p_note end,
    ready_for_buyer = p_decision = 'approved',
    reviewed_category_slug = case when p_decision = 'approved' then p_category else item.reviewed_category_slug end,
    category = case when p_category is not null then p_category else item.category end,
    specs = case when p_decision = 'approved' then coalesce(item.specs, '{}'::jsonb) - 'price_review_summary' else item.specs end,
    updated_at = now() where id = item.id returning * into item;
  return jsonb_build_object('status','saved','product',to_jsonb(item));
end;
$$;
revoke all on function public.decide_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.decide_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text,text,text,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
