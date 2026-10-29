-- KHÔNG CHẠY LÚC NÀY: cần kiểm thử staging trước khi mở form.
-- Chỉ tạo hàm kiểm tra, không thay đổi sản phẩm, nháp, ảnh hay dữ liệu Storage.
begin;
-- Called before any Storage write. A missing or mismatched migration must not
-- leave orphan files while an older stage function still targets products/.
-- The hash pins the SQL66 function body. Any later change to that function must
-- update this readiness contract in a new reviewed migration.
create or replace function public.product_form_image_namespace_ready()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)') is not null
    and exists (select 1 from pg_proc where oid = to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)')
      and prosecdef and proconfig = array['search_path=public, pg_temp']
      and md5(prosrc) = '9b434d1a5684e9a0f829a6ddc1bc9869')
    and not has_function_privilege('anon', to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)'), 'execute')
    and not has_function_privilege('authenticated', to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)'), 'execute')
    and has_function_privilege('service_role', to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)'), 'execute')
    and (select count(*) from pg_constraint where conrelid = 'public.product_form_staged_images'::regclass
      and contype = 'c' and ((conname = 'product_form_staged_images_check' and pg_get_constraintdef(oid) like '%storage_path%')
        or (conname = 'product_form_staged_images_check1' and pg_get_constraintdef(oid) like '%thumb_path%'))
      and pg_get_constraintdef(oid) like '%product-form-images/%') = 2,
    false);
$$;
revoke all on function public.product_form_image_namespace_ready() from public, anon, authenticated;
grant execute on function public.product_form_image_namespace_ready() to service_role;
notify pgrst, 'reload schema';
commit;
