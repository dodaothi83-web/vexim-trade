-- Atomic independent review decisions for the new pricing/name model. Existing
-- public data is not changed here; application cutover happens separately.
begin;

create or replace function public.decide_quantity_price_revision(
  p_product_id uuid, p_revision_id uuid, p_actor_id uuid, p_approve boolean
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate public.product_quantity_price_revisions%rowtype;
begin
  if p_actor_id is null or p_approve is null then return 'invalid'; end if;
  -- All writers of this workflow must lock the product first, in this order.
  perform 1 from public.supplier_products where id = p_product_id for update;
  if not found then return 'missing_product'; end if;
  select * into candidate from public.product_quantity_price_revisions
    where id = p_revision_id and product_id = p_product_id for update;
  if not found or candidate.status <> 'pending' then return 'changed'; end if;
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
  p_product_id uuid, p_revision_id uuid, p_actor_id uuid, p_approve boolean
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate public.product_english_name_revisions%rowtype;
begin
  if p_actor_id is null or p_approve is null then return 'invalid'; end if;
  perform 1 from public.supplier_products where id = p_product_id for update;
  if not found then return 'missing_product'; end if;
  select * into candidate from public.product_english_name_revisions
    where id = p_revision_id and product_id = p_product_id for update;
  if not found or candidate.status <> 'pending' then return 'changed'; end if;
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

revoke all on function public.decide_quantity_price_revision(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.decide_product_english_name_revision(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.decide_quantity_price_revision(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.decide_product_english_name_revision(uuid, uuid, uuid, boolean) to service_role;
notify pgrst, 'reload schema';
commit;
