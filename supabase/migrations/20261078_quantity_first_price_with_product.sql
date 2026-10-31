-- Publishing a supplier product must not need a second, separate price approval
-- for the price the supplier uploaded together with that product. The reviewer
-- who approves the product is looking at that table, so the first price is
-- approved in the same transaction. Price *updates* keep their own review step:
-- once an approved price exists, publishing never approves a newer pending one.
--
-- Publication also stops depending on a deployment flag. The buyer catalogue now
-- projects approved quantity prices on its own, so `p_buyer_enabled` is kept only
-- as a deprecated, ignored argument (an older app may still send it).
--
-- `p_actor_id` records who approved the first price; it is appended with a
-- default so a caller that only sends the original arguments still resolves.
begin;

-- A snapshot taken before a column existed must still match the same product after
-- that column was added: absent and null describe the same missing value. A field
-- that really changed (value <-> null, or a new value) still differs.
create or replace function public.quantity_product_review_context_matches(p_stored jsonb, p_current jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p_stored is not null and p_current is not null and
    (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(p_stored) where value <> 'null'::jsonb)
    = (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(p_current) where value <> 'null'::jsonb);
$$;
revoke all on function public.quantity_product_review_context_matches(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.quantity_product_review_context_matches(jsonb, jsonb) to service_role;

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
    if not public.quantity_product_review_context_matches(price.product_context, public.quantity_product_review_context(to_jsonb(item))) then
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

drop function if exists public.decide_supplier_product_with_quantity_guard(uuid, uuid, timestamptz, text, boolean, text, text, text, boolean);
create or replace function public.decide_supplier_product_with_quantity_guard(
  p_product_id uuid, p_supplier_id uuid, p_expected_updated_at timestamptz,
  p_expected_review text, p_expected_ready boolean, p_decision text,
  p_category text, p_note text, p_buyer_enabled boolean default null, p_actor_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  price public.product_quantity_price_revisions%rowtype;
  current_category text;
  context jsonb;
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
    current_category := coalesce(item.reviewed_category_slug, item.supplier_category_proposal, item.category);
    if p_category is distinct from current_category then return jsonb_build_object('status','category_changed'); end if;
    context := public.quantity_product_review_context(to_jsonb(item));
    select * into price from public.product_quantity_price_revisions
      where product_id = item.id and status = 'approved' for update;
    if found then
      -- A later publication still needs the approved price to describe this product.
      if not public.quantity_product_review_context_matches(price.product_context, context) then
        return jsonb_build_object('status','price_changed');
      end if;
    else
      -- First price: the product and the table uploaded with it are approved together.
      select * into price from public.product_quantity_price_revisions
        where product_id = item.id and status = 'pending' order by created_at desc limit 1 for update;
      if not found then return jsonb_build_object('status','price_not_approved'); end if;
      if not public.quantity_product_review_context_matches(price.product_context, context) then
        return jsonb_build_object('status','price_changed');
      end if;
      update public.product_quantity_price_revisions
        set status = 'approved', reviewed_at = now(), reviewed_by = p_actor_id,
            confirmed_at = coalesce(confirmed_at, created_at)
        where id = price.id;
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
revoke all on function public.decide_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text,text,text,boolean,uuid) from public, anon, authenticated;
grant execute on function public.decide_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text,text,text,boolean,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
