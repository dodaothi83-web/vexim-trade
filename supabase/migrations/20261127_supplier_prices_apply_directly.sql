-- Supplier prices apply directly; Vexim no longer confirms prices in the CRM.
--
-- Owner decision (19/11/2026):
--  1. A price has no fixed lifetime. The supplier keeps it current; buyers only see
--     the date it was last updated. Remove the "stale after N days" and "remind
--     after N days" settings.
--  2. A price the supplier enters (with a new product, or any later change) is the
--     live price at once. Remove the CRM price review queue and the checks that
--     tied a price to a snapshot of the product it was approved against.
--
-- Product review itself is unchanged: a new product still waits for staff approval
-- before buyers see it, and English-name revisions keep their own review.
--
-- Apply AFTER the app version that stops reading reminder_days/stale_days is live.
begin;

-- 1. Apply prices still waiting in the old review queue (first prices of products
--    that are themselves still waiting for product review).
update public.product_quantity_price_revisions old
  set status = 'superseded'
  where old.status = 'approved'
    and exists (select 1 from public.product_quantity_price_revisions p
                where p.product_id = old.product_id and p.status = 'pending');
update public.product_quantity_price_revisions
  set status = 'approved', confirmed_at = coalesce(confirmed_at, created_at)
  where status = 'pending';

-- 2. A submitted price replaces the live one immediately.
create or replace function public.submit_quantity_price_revision(
  p_product_id uuid, p_supplier_id uuid, p_expected_pending_id uuid, p_expected_product_updated_at timestamptz,
  p_grade text, p_incoterm text, p_tiers jsonb, p_warnings jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  created uuid;
  product_updated_at timestamptz;
begin
  -- p_expected_pending_id is kept for call compatibility; there is no pending price any more.
  if p_product_id is null or p_supplier_id is null or p_expected_product_updated_at is null or p_grade is null or btrim(p_grade) = '' or
     p_incoterm is null or p_tiers is null or p_warnings is null or
     jsonb_typeof(p_tiers) <> 'array' or jsonb_typeof(p_warnings) <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select updated_at into product_updated_at
    from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  -- Optimistic concurrency only: the form was opened on this version of the product.
  if product_updated_at is distinct from p_expected_product_updated_at then return jsonb_build_object('status', 'product_changed'); end if;
  update public.product_quantity_price_revisions set status = 'superseded'
    where product_id = p_product_id and status in ('draft', 'pending', 'approved');
  insert into public.product_quantity_price_revisions
    (product_id, status, grade, incoterm, tiers, warnings, confirmed_at, product_updated_at)
    values (p_product_id, 'approved', btrim(p_grade), p_incoterm, p_tiers, p_warnings, now(), product_updated_at)
    returning id into created;
  return jsonb_build_object('status', 'approved', 'revision_id', created);
end;
$$;
revoke all on function public.submit_quantity_price_revision(uuid,uuid,uuid,timestamptz,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.submit_quantity_price_revision(uuid,uuid,uuid,timestamptz,text,text,jsonb,jsonb) to service_role;

-- 3. A new product's price is live data from the start (buyers still see it only
--    once the product itself is approved).
create or replace function public.create_supplier_product_with_quantity(
  p_request_id uuid, p_supplier_id uuid, p_product jsonb, p_grade text, p_incoterm text,
  p_tiers jsonb, p_warnings jsonb, p_english_name text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  allowed text[] := array['supplier_id','name','slug','name_i18n','category','description','description_detail','spec','specs',
    'unit','moq','moq_qty','moq_unit','monthly_capacity','raw_material_region','input_material_origin','lead_time_days',
    'packaging','oem','odm','samples','certifications','export_port','ref_price','ref_price_max','price_publicly_visible',
    'currency','price_valid_until','incoterm','incoterm_place','payment_terms','ready_for_buyer','supplier_review_status',
    'supplier_review_note','supplier_originated','supplier_category_proposal','reviewed_category_slug','images',
    'keywords','sample_price_usd','package_type','package_weight_kg','package_size','units_per_carton'];
  columns_sql text;
  values_sql text;
  saved public.supplier_products%rowtype;
  snapshot jsonb;
  request_row public.quantity_product_creation_requests%rowtype;
  digest text;
begin
  if p_request_id is null or p_supplier_id is null or jsonb_typeof(p_product) is distinct from 'object' or
     p_product->>'supplier_id' is distinct from p_supplier_id::text or
     p_product->>'supplier_review_status' is distinct from 'draft' or
     p_product->>'ready_for_buyer' is distinct from 'false' or
     p_product->>'supplier_originated' is distinct from 'true' or
     coalesce(p_product->>'name','') = '' or coalesce(p_grade,'') = '' or
     p_incoterm not in ('FOB','CIF','CFR','EXW','FCA','DAP','DDP') or
     jsonb_typeof(p_tiers) is distinct from 'array' or jsonb_array_length(p_tiers) = 0 or
     jsonb_typeof(p_warnings) is distinct from 'array' or
     exists (select 1 from jsonb_object_keys(p_product) as x(k) where not (k = any(allowed))) then
    raise exception 'Invalid new product payload';
  end if;
  digest := md5(jsonb_build_array(p_supplier_id,p_product,p_grade,p_incoterm,p_tiers,p_warnings,p_english_name)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into request_row from public.quantity_product_creation_requests where request_id = p_request_id;
  if found then
    if request_row.supplier_id is distinct from p_supplier_id or request_row.payload_hash is distinct from digest then
      raise exception 'Creation request already used with different data';
    end if;
    select * into saved from public.supplier_products where id = request_row.product_id and supplier_id = p_supplier_id;
    if not found then raise exception 'Created product no longer exists'; end if;
    return to_jsonb(saved);
  end if;
  select string_agg(format('%I', k), ',' order by k), string_agg(format('(r).%I', k), ',' order by k)
    into columns_sql, values_sql from jsonb_object_keys(p_product) as x(k);
  execute format('insert into public.supplier_products (%s) select %s from (select jsonb_populate_record(null::public.supplier_products, $1) as r) q returning *', columns_sql, values_sql)
    using p_product into saved;
  insert into public.product_quantity_price_revisions
    (product_id,status,grade,incoterm,tiers,warnings,confirmed_at,product_updated_at)
    values (saved.id,'approved',p_grade,p_incoterm,p_tiers,p_warnings,now(),saved.updated_at);
  if p_english_name is not null and btrim(p_english_name) <> '' then
    snapshot := public.quantity_product_review_context(to_jsonb(saved));
    insert into public.product_english_name_revisions
      (product_id,status,source_name,english_name,origin,product_updated_at,product_context)
      values (saved.id,'pending',saved.name,btrim(p_english_name),'supplier',saved.updated_at,snapshot);
  end if;
  insert into public.quantity_product_creation_requests(request_id,supplier_id,product_id,payload_hash)
    values (p_request_id,p_supplier_id,saved.id,digest);
  return to_jsonb(saved);
end;
$$;
revoke all on function public.create_supplier_product_with_quantity(uuid,uuid,jsonb,text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.create_supplier_product_with_quantity(uuid,uuid,jsonb,text,text,jsonb,jsonb,text) to service_role;

-- 4. Sending a product for review no longer checks its price against a snapshot.
create or replace function public.submit_supplier_product_with_quantity_guard(
  p_product_id uuid, p_supplier_id uuid, p_expected_updated_at timestamptz,
  p_expected_review text, p_expected_ready boolean, p_proposal text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
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
  update public.supplier_products set supplier_review_status = 'pending', supplier_review_note = null,
    ready_for_buyer = false, supplier_category_proposal = case when item.supplier_review_status = 'paused' then p_proposal else item.supplier_category_proposal end,
    updated_at = now() where id = item.id returning * into item;
  return jsonb_build_object('status','submitted','product',to_jsonb(item));
end;
$$;
revoke all on function public.submit_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text) from public, anon, authenticated;
grant execute on function public.submit_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text) to service_role;

-- 5. Approving a product is a product decision only; it never approves or checks a price.
create or replace function public.decide_supplier_product_with_quantity_guard(
  p_product_id uuid, p_supplier_id uuid, p_expected_updated_at timestamptz,
  p_expected_review text, p_expected_ready boolean, p_decision text,
  p_category text, p_note text, p_buyer_enabled boolean default null, p_actor_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
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
  update public.supplier_products set supplier_review_status = p_decision,
    supplier_review_note = case when p_decision = 'approved' then null else p_note end,
    ready_for_buyer = p_decision = 'approved',
    reviewed_category_slug = case when p_decision = 'approved' then p_category else item.reviewed_category_slug end,
    category = case when p_category is not null then p_category else item.category end,
    specs = coalesce(item.specs, '{}'::jsonb) - 'price_review_summary',
    updated_at = now() where id = item.id returning * into item;
  return jsonb_build_object('status','saved','product',to_jsonb(item));
end;
$$;
revoke all on function public.decide_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text,text,text,boolean,uuid) from public, anon, authenticated;
grant execute on function public.decide_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text,text,text,boolean,uuid) to service_role;

-- 6. Remove the CRM price review entry points.
drop function if exists public.decide_quantity_price_revision(uuid, uuid, uuid, boolean, timestamptz);
drop function if exists public.staff_set_quantity_price(uuid, uuid, text, text, jsonb, jsonb);
drop function if exists public.quantity_product_price_context_diff(uuid);
drop index if exists public.product_quantity_price_revision_review_queue_idx;
-- Old price snapshots described "the product this price was approved for".
update public.product_quantity_price_revisions set product_context = null where product_context is not null;
update public.supplier_products set specs = specs - 'price_review_summary' where specs ? 'price_review_summary';

-- 7. No fixed price lifetime.
alter table public.quantity_price_settings drop column if exists reminder_days;
alter table public.quantity_price_settings drop column if exists stale_days;

notify pgrst, 'reload schema';
commit;
