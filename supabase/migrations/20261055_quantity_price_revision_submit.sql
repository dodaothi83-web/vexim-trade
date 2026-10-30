-- Staged supplier revisions: old approved snapshots remain unchanged. All callers
-- must validate policy/grade/name, consent and account authorization before RPC.
-- Service-role only; never grant directly to browser clients.
begin;

create or replace function public.submit_quantity_price_revision(
  p_product_id uuid, p_supplier_id uuid, p_expected_pending_id uuid, p_expected_product_updated_at timestamptz,
  p_grade text, p_incoterm text, p_tiers jsonb, p_warnings jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing uuid;
  created uuid;
  product_updated_at timestamptz;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_product_updated_at is null or p_grade is null or btrim(p_grade) = '' or
     p_incoterm is null or p_tiers is null or p_warnings is null or
     jsonb_typeof(p_tiers) <> 'array' or jsonb_typeof(p_warnings) <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select updated_at into product_updated_at from public.supplier_products
    where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  if product_updated_at is distinct from p_expected_product_updated_at then return jsonb_build_object('status', 'product_changed'); end if;
  select id into existing from public.product_quantity_price_revisions
    where product_id = p_product_id and status = 'pending' for update;
  if existing is distinct from p_expected_pending_id then
    return jsonb_build_object('status', 'changed');
  end if;
  if existing is not null then
    update public.product_quantity_price_revisions set status = 'superseded' where id = existing;
  end if;
  insert into public.product_quantity_price_revisions
    (product_id, status, grade, incoterm, tiers, warnings, confirmed_at)
    values (p_product_id, 'pending', p_grade, p_incoterm, p_tiers, p_warnings, now())
    returning id into created;
  return jsonb_build_object('status', 'pending', 'revision_id', created);
end;
$$;

create or replace function public.submit_product_english_name_revision(
  p_product_id uuid, p_supplier_id uuid, p_expected_pending_id uuid, p_expected_product_updated_at timestamptz,
  p_source_name text, p_english_name text, p_origin text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing uuid;
  created uuid;
  product_updated_at timestamptz;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_product_updated_at is null or p_source_name is null or btrim(p_source_name) = '' or
     p_english_name is null or btrim(p_english_name) = '' or p_origin is null or p_origin not in ('supplier', 'ai') then
    return jsonb_build_object('status', 'invalid');
  end if;
  select updated_at into product_updated_at from public.supplier_products
    where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  if product_updated_at is distinct from p_expected_product_updated_at then return jsonb_build_object('status', 'product_changed'); end if;
  select id into existing from public.product_english_name_revisions
    where product_id = p_product_id and status = 'pending' for update;
  if existing is distinct from p_expected_pending_id then
    return jsonb_build_object('status', 'changed');
  end if;
  if existing is not null then
    update public.product_english_name_revisions set status = 'superseded' where id = existing;
  end if;
  insert into public.product_english_name_revisions
    (product_id, status, source_name, english_name, origin)
    values (p_product_id, 'pending', p_source_name, p_english_name, p_origin)
    returning id into created;
  return jsonb_build_object('status', 'pending', 'revision_id', created);
end;
$$;

revoke all on function public.submit_quantity_price_revision(uuid, uuid, uuid, timestamptz, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.submit_product_english_name_revision(uuid, uuid, uuid, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_quantity_price_revision(uuid, uuid, uuid, timestamptz, text, text, jsonb, jsonb) to service_role;
grant execute on function public.submit_product_english_name_revision(uuid, uuid, uuid, timestamptz, text, text, text) to service_role;
notify pgrst, 'reload schema';
commit;
