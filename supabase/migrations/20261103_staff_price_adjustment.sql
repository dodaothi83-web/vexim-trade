-- Publishing a supplier product is blocked when the product row no longer matches
-- the snapshot the price was approved against. Two gaps made that block a dead end:
-- staff could not see which field differs, and staff could not correct the price on
-- the supplier's behalf, so the only way out was asking the supplier to resend a
-- price sheet. This migration closes both.
--
-- 1. quantity_product_price_context_diff names the fields that changed between the
--    stored price snapshot and the current product. Read-only diagnostic.
-- 2. staff_set_quantity_price records a price that Vexim entered for the supplier
--    and re-bases it on the current product, so the product can be published.
--    The reviewer who enters it is the reviewer of that price, and the caller in
--    the CRM writes an audit entry with the replaced revisions.
begin;

create or replace function public.quantity_product_price_context_diff(p_product_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  price public.product_quantity_price_revisions%rowtype;
  stored jsonb;
  current_ctx jsonb;
  changed text[] := '{}'::text[];
  k1 text;
  k2 text;
begin
  if p_product_id is null then return jsonb_build_object('status','invalid'); end if;
  select * into item from public.supplier_products where id = p_product_id;
  if not found then return jsonb_build_object('status','missing_product'); end if;
  -- The sheet that decides publication: an approved one wins over a pending one.
  select * into price from public.product_quantity_price_revisions
    where product_id = p_product_id and status in ('approved','pending')
    order by case status when 'approved' then 0 else 1 end, created_at desc limit 1;
  if not found then return jsonb_build_object('status','missing_price'); end if;
  if price.product_context is null then
    return jsonb_build_object('status','diff','revision_id',price.id,'revision_status',price.status,
      'changed','[]'::jsonb,'missing_context',true);
  end if;
  -- Compare the same way quantity_product_review_context_matches does: a null value
  -- and a column added after the snapshot describe the same missing field.
  stored := (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from jsonb_each(price.product_context) where value <> 'null'::jsonb);
  current_ctx := (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from jsonb_each(public.quantity_product_review_context(to_jsonb(item))) where value <> 'null'::jsonb);
  for k1 in select jsonb_object_keys(stored) loop
    if not (current_ctx ? k1) or stored->k1 is distinct from current_ctx->k1 then
      -- Name the attribute that moved, not the whole specs object.
      if k1 = 'specs' and jsonb_typeof(stored->k1) = 'object' and jsonb_typeof(current_ctx->k1) = 'object' then
        for k2 in select k from (
          select jsonb_object_keys(stored->k1) as k union select jsonb_object_keys(current_ctx->k1)
        ) attribute_keys loop
          if stored->k1->k2 is distinct from current_ctx->k1->k2 then
            changed := changed || ('specs.' || k2);
          end if;
        end loop;
      else
        changed := changed || k1;
      end if;
    end if;
  end loop;
  for k1 in select jsonb_object_keys(current_ctx) loop
    if not (stored ? k1) then changed := changed || k1; end if;
  end loop;
  return jsonb_build_object('status','diff','revision_id',price.id,'revision_status',price.status,
    'changed',to_jsonb(changed),'missing_context',false);
end $$;

-- A price typed by staff for a supplier who confirmed it by another channel. It
-- applies at once because the staff member entering it is the reviewer of that
-- price. The previous sheets are superseded, never left pending next to it.
create or replace function public.staff_set_quantity_price(
  p_product_id uuid, p_actor_id uuid, p_grade text, p_incoterm text, p_tiers jsonb, p_warnings jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  created uuid;
begin
  if p_product_id is null or p_actor_id is null or coalesce(btrim(p_grade),'') = '' or
     p_incoterm is null or p_incoterm not in ('FOB','CIF','CFR','EXW','FCA','DAP','DDP') or
     p_tiers is null or jsonb_typeof(p_tiers) is distinct from 'array' or jsonb_array_length(p_tiers) = 0 or
     jsonb_array_length(p_tiers) > 100 or
     p_warnings is null or jsonb_typeof(p_warnings) is distinct from 'array' then
    return jsonb_build_object('status','invalid');
  end if;
  select * into item from public.supplier_products where id = p_product_id for update;
  if not found then return jsonb_build_object('status','missing_product'); end if;
  update public.product_quantity_price_revisions set status = 'superseded'
    where product_id = p_product_id and status in ('approved','pending');
  insert into public.product_quantity_price_revisions
    (product_id,status,grade,incoterm,tiers,warnings,confirmed_at,reviewed_at,reviewed_by,product_updated_at,product_context)
    values (p_product_id,'approved',btrim(p_grade),p_incoterm,p_tiers,p_warnings,now(),now(),p_actor_id,
      item.updated_at,public.quantity_product_review_context(to_jsonb(item)))
    returning id into created;
  -- The sheet now describes this product, so the "send a new price sheet" note is stale.
  update public.supplier_products
    set specs = coalesce(specs, '{}'::jsonb) - 'price_review_summary', updated_at = now()
    where id = p_product_id;
  return jsonb_build_object('status','saved','revision_id',created);
end $$;

revoke all on function public.quantity_product_price_context_diff(uuid) from public, anon, authenticated;
revoke all on function public.staff_set_quantity_price(uuid, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.quantity_product_price_context_diff(uuid) to service_role;
grant execute on function public.staff_set_quantity_price(uuid, uuid, text, text, jsonb, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
