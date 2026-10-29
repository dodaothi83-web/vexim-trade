-- Keep material product changes guarded, but do not invalidate a submitted price
-- merely because product review status or generated translations were updated.
-- Old pending records without a context keep the stricter 20261056 rule.
begin;
alter table public.product_quantity_price_revisions add column if not exists product_context jsonb;
alter table public.product_english_name_revisions add column if not exists product_context jsonb;

create or replace function public.quantity_product_review_context(p jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select (p - array['updated_at', 'supplier_review_status', 'supplier_review_note', 'ready_for_buyer',
    'category', 'supplier_category_proposal', 'reviewed_category_slug', 'images', 'featured_media_id',
    'name_i18n', 'description_i18n', 'spec_i18n', 'description_detail_i18n',
    'packaging_i18n', 'certifications_i18n', 'translation_meta', 'specs']) ||
    jsonb_build_object('review_category', coalesce(p->>'reviewed_category_slug', p->>'supplier_category_proposal', p->>'category'),
      'specs', coalesce(p->'specs', '{}'::jsonb) - 'price_review_summary');
$$;
revoke all on function public.quantity_product_review_context(jsonb) from public, anon, authenticated;
grant execute on function public.quantity_product_review_context(jsonb) to service_role;

create or replace function public.submit_quantity_price_revision(
  p_product_id uuid, p_supplier_id uuid, p_expected_pending_id uuid, p_expected_product_updated_at timestamptz,
  p_grade text, p_incoterm text, p_tiers jsonb, p_warnings jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing uuid;
  created uuid;
  product_updated_at timestamptz;
  product_snapshot jsonb;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_product_updated_at is null or p_grade is null or btrim(p_grade) = '' or
     p_incoterm is null or p_tiers is null or p_warnings is null or
     jsonb_typeof(p_tiers) <> 'array' or jsonb_typeof(p_warnings) <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select updated_at, public.quantity_product_review_context(to_jsonb(p)) into product_updated_at, product_snapshot
    from public.supplier_products p where id = p_product_id and supplier_id = p_supplier_id for update;
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
    (product_id, status, grade, incoterm, tiers, warnings, confirmed_at, product_updated_at, product_context)
    values (p_product_id, 'pending', p_grade, p_incoterm, p_tiers, p_warnings, now(), product_updated_at, product_snapshot)
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
  product_snapshot jsonb;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_product_updated_at is null or p_source_name is null or btrim(p_source_name) = '' or
     p_english_name is null or btrim(p_english_name) = '' or p_origin is null or p_origin not in ('supplier', 'ai') then
    return jsonb_build_object('status', 'invalid');
  end if;
  select updated_at, public.quantity_product_review_context(to_jsonb(p)) into product_updated_at, product_snapshot
    from public.supplier_products p where id = p_product_id and supplier_id = p_supplier_id for update;
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
    (product_id, status, source_name, english_name, origin, product_updated_at, product_context)
    values (p_product_id, 'pending', p_source_name, p_english_name, p_origin, product_updated_at, product_snapshot)
    returning id into created;
  return jsonb_build_object('status', 'pending', 'revision_id', created);
end;
$$;

-- Remove older unguarded service-role entrypoints.
drop function if exists public.decide_quantity_price_revision(uuid, uuid, uuid, boolean);
drop function if exists public.decide_product_english_name_revision(uuid, uuid, uuid, boolean);

create or replace function public.decide_quantity_price_revision(
  p_product_id uuid, p_revision_id uuid, p_actor_id uuid, p_approve boolean, p_expected_product_updated_at timestamptz
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate public.product_quantity_price_revisions%rowtype;
  product_updated_at timestamptz;
  product_snapshot jsonb;
begin
  if p_actor_id is null or p_approve is null or p_expected_product_updated_at is null then return 'invalid'; end if;
  -- All writers of this workflow must lock the product first, in this order.
  select updated_at, public.quantity_product_review_context(to_jsonb(p)) into product_updated_at, product_snapshot from public.supplier_products p where id = p_product_id for update;
  if not found then return 'missing_product'; end if;
  select * into candidate from public.product_quantity_price_revisions
    where id = p_revision_id and product_id = p_product_id for update;
  if not found or candidate.status <> 'pending' then return 'changed'; end if;
  if p_approve and (product_updated_at is distinct from p_expected_product_updated_at or (case when candidate.product_context is null then candidate.product_updated_at is distinct from product_updated_at else candidate.product_context is distinct from product_snapshot end)) then return 'product_changed'; end if;
  if p_approve then
    update public.product_quantity_price_revisions set status = 'superseded'
      where product_id = p_product_id and status = 'approved';
    -- The supplier confirmed the proposed price when it was submitted, not at
    -- the later time staff approved it. Never refresh its age during review.
    update public.product_quantity_price_revisions
      set status = 'approved', reviewed_at = now(), reviewed_by = p_actor_id,
          confirmed_at = coalesce(candidate.confirmed_at, candidate.created_at)
      where id = p_revision_id;
  else
    update public.product_quantity_price_revisions
      set status = 'rejected', reviewed_at = now(), reviewed_by = p_actor_id
      where id = p_revision_id;
  end if;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

create or replace function public.decide_product_english_name_revision(
  p_product_id uuid, p_revision_id uuid, p_actor_id uuid, p_approve boolean, p_expected_product_updated_at timestamptz
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate public.product_english_name_revisions%rowtype;
  product_updated_at timestamptz;
  product_name text;
  product_snapshot jsonb;
begin
  if p_actor_id is null or p_approve is null or p_expected_product_updated_at is null then return 'invalid'; end if;
  select updated_at, name, public.quantity_product_review_context(to_jsonb(p)) into product_updated_at, product_name, product_snapshot from public.supplier_products p where id = p_product_id for update;
  if not found then return 'missing_product'; end if;
  select * into candidate from public.product_english_name_revisions
    where id = p_revision_id and product_id = p_product_id for update;
  if not found or candidate.status <> 'pending' then return 'changed'; end if;
  if p_approve and (product_updated_at is distinct from p_expected_product_updated_at or (case when candidate.product_context is null then candidate.product_updated_at is distinct from product_updated_at else candidate.product_context is distinct from product_snapshot end) or candidate.source_name is distinct from product_name) then return 'product_changed'; end if;
  if p_approve then
    update public.product_english_name_revisions set status = 'superseded'
      where product_id = p_product_id and status = 'approved';
    update public.product_english_name_revisions
      set status = 'approved', reviewed_at = now(), reviewed_by = p_actor_id
      where id = p_revision_id;
  else
    update public.product_english_name_revisions
      set status = 'rejected', reviewed_at = now(), reviewed_by = p_actor_id
      where id = p_revision_id;
  end if;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

revoke all on function public.decide_quantity_price_revision(uuid, uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.decide_product_english_name_revision(uuid, uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.decide_quantity_price_revision(uuid, uuid, uuid, boolean, timestamptz) to service_role;
grant execute on function public.decide_product_english_name_revision(uuid, uuid, uuid, boolean, timestamptz) to service_role;


notify pgrst, 'reload schema';
commit;
