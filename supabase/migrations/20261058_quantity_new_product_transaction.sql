-- Atomic creation: never save a new product without the quantity table entered
-- in the same form. The caller is the authorized, validating server action.
begin;
create table if not exists public.quantity_product_creation_requests (
  request_id uuid primary key,
  supplier_id uuid not null,
  product_id uuid references public.supplier_products(id) on delete set null,
  payload_hash text not null
);
alter table public.quantity_product_creation_requests enable row level security;
revoke all on public.quantity_product_creation_requests from public, anon, authenticated;
grant all on public.quantity_product_creation_requests to service_role;

create or replace function public.create_supplier_product_with_quantity(
  p_request_id uuid, p_supplier_id uuid, p_product jsonb, p_grade text, p_incoterm text,
  p_tiers jsonb, p_warnings jsonb, p_english_name text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  allowed text[] := array['supplier_id','name','slug','name_i18n','category','description','description_detail','spec','specs',
    'unit','moq','moq_qty','moq_unit','monthly_capacity','raw_material_region','input_material_origin','lead_time_days',
    'packaging','oem','odm','samples','certifications','export_port','ref_price','ref_price_max','price_publicly_visible',
    'currency','price_valid_until','incoterm','incoterm_place','payment_terms','ready_for_buyer','supplier_review_status',
    'supplier_review_note','supplier_originated','supplier_category_proposal','reviewed_category_slug','images'];
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
  -- Serialize retries for one request without serializing unrelated creations.
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
  -- Only pre-approved column names are interpolated. Missing columns use their
  -- database defaults; values are typed by PostgreSQL rather than interpolated.
  select string_agg(format('%I', k), ',' order by k), string_agg(format('(r).%I', k), ',' order by k)
    into columns_sql, values_sql from jsonb_object_keys(p_product) as x(k);
  execute format('insert into public.supplier_products (%s) select %s from (select jsonb_populate_record(null::public.supplier_products, $1) as r) q returning *', columns_sql, values_sql)
    using p_product into saved;
  snapshot := public.quantity_product_review_context(to_jsonb(saved));
  insert into public.product_quantity_price_revisions
    (product_id,status,grade,incoterm,tiers,warnings,confirmed_at,product_updated_at,product_context)
    values (saved.id,'pending',p_grade,p_incoterm,p_tiers,p_warnings,now(),saved.updated_at,snapshot);
  if p_english_name is not null and btrim(p_english_name) <> '' then
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
notify pgrst, 'reload schema';
commit;
