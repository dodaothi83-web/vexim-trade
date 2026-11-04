-- Atomic updates keep saves from different tabs from overwriting each other.
begin;
create or replace function public.set_buyer_saved_product(p_account_id uuid, p_product jsonb, p_saved boolean)
returns void language plpgsql security invoker set search_path = public as $$
declare current_saved jsonb; products jsonb;
begin
  if jsonb_typeof(p_product) <> 'object' or coalesce(p_product->>'id', '') = '' then
    raise exception 'Invalid product';
  end if;
  select saved into current_saved from public.buyer_users where id = p_account_id for update;
  if not found then raise exception 'Buyer account not found'; end if;
  select coalesce(jsonb_agg(item), '[]'::jsonb) into products
    from jsonb_array_elements(coalesce(current_saved->'products', '[]'::jsonb)) item
    where item->>'id' <> p_product->>'id';
  if p_saved then
    if jsonb_array_length(products) >= 100 then raise exception 'Saved product limit reached'; end if;
    products := products || jsonb_build_array(p_product);
  end if;
  update public.buyer_users set saved = jsonb_set(current_saved, '{products}', products) where id = p_account_id;
end;
$$;
revoke all on function public.set_buyer_saved_product(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.set_buyer_saved_product(uuid, jsonb, boolean) to service_role;
commit;
notify pgrst, 'reload schema';
