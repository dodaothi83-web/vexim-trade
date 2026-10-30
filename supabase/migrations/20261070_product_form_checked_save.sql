-- KHÔNG CHẠY TRÊN PRODUCTION LÚC NÀY: cần kiểm thử staging và luồng duyệt.
-- Thêm wrapper an toàn, không sửa sản phẩm, ảnh, bản nháp hay hàm đã triển khai.
begin;
create or replace function public.save_product_form_draft_checked(
  p_supplier_id uuid, p_product_id uuid, p_expected_revision integer, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  product public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
  old_fn regprocedure := to_regprocedure('public.save_product_form_draft(uuid,uuid,integer,jsonb)');
begin
  if p_supplier_id is null or p_product_id is null or p_expected_revision is null or p_expected_revision < 0
    or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 65536 then
    return jsonb_build_object('status','invalid');
  end if;
  -- Do not call an unknown or publicly callable older implementation.
  if old_fn is null or not exists (select 1 from pg_proc where oid = old_fn and prosecdef
      and proconfig = array['search_path=public, pg_temp'] and md5(prosrc) = '19eadfaddd70ea675d36ff82a0fa7d5b')
    or has_function_privilege('anon', old_fn, 'execute') or has_function_privilege('authenticated', old_fn, 'execute')
    or not has_function_privilege('service_role', old_fn, 'execute') then
    return jsonb_build_object('status','save_unavailable');
  end if;
  -- Existing writers and the inner RPC use this lock order. These locks survive
  -- until the outer transaction commits, so no product change can slip through.
  select * into product from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_owned'); end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id for update;
  if found then
    if draft.supplier_id is distinct from p_supplier_id or draft.revision is distinct from p_expected_revision then
      return jsonb_build_object('status','changed');
    end if;
    if draft.base_product_updated_at is distinct from product.updated_at then
      return jsonb_build_object('status','product_changed');
    end if;
  elsif p_expected_revision <> 0 then
    return jsonb_build_object('status','changed');
  end if;
  return public.save_product_form_draft(p_supplier_id,p_product_id,p_expected_revision,p_payload);
end;
$$;
revoke all on function public.save_product_form_draft_checked(uuid,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.save_product_form_draft_checked(uuid,uuid,integer,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
