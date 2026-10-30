-- KHÔNG CHẠY LÚC NÀY: cần kiểm thử staging trước khi mở form.
-- Khắc phục trạng thái hàm dùng namespace mới nhưng ràng buộc còn namespace cũ.
-- Không sửa hoặc xóa sản phẩm, nháp, ảnh hay Storage; dừng nếu còn ảnh nháp cũ.
begin;
lock table public.product_form_staged_images in access exclusive mode;
do $$
declare
  stage_fn regprocedure := to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)');
begin
  if stage_fn is null or not exists (select 1 from pg_proc where oid = stage_fn and prosecdef
       and proconfig = array['search_path=public, pg_temp'] and md5(prosrc) = '9b434d1a5684e9a0f829a6ddc1bc9869')
     or has_function_privilege('anon', stage_fn, 'execute')
     or has_function_privilege('authenticated', stage_fn, 'execute')
     or not has_function_privilege('service_role', stage_fn, 'execute')
     or to_regprocedure('public.product_form_image_namespace_ready()') is null then
    raise exception 'Hàm ảnh nháp hoặc quyền khác dự kiến; dừng để kiểm tra';
  end if;
  if exists (select 1 from public.product_form_staged_images
    where storage_path is distinct from 'product-form-images/' || product_id::text || '/' || id::text || '.webp'
       or thumb_path is distinct from 'product-form-images/' || product_id::text || '/' || id::text || '-thumb.webp') then
    raise exception 'Ảnh nháp đang dùng đường dẫn cũ; dừng để kiểm tra, không tự chuyển dữ liệu';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.product_form_staged_images'::regclass
      and contype = 'c' and convalidated and (
        (conname = 'product_form_staged_images_check' and pg_get_constraintdef(oid) in (
          'CHECK ((storage_path = ((((''products/''::text || (product_id)::text) || ''/''::text) || (id)::text) || ''.webp''::text)))',
          'CHECK ((storage_path = ((((''product-form-images/''::text || (product_id)::text) || ''/''::text) || (id)::text) || ''.webp''::text)))'))
        or (conname = 'product_form_staged_images_check1' and pg_get_constraintdef(oid) in (
          'CHECK ((thumb_path = ((((''products/''::text || (product_id)::text) || ''/''::text) || (id)::text) || ''-thumb.webp''::text)))',
          'CHECK ((thumb_path = ((((''product-form-images/''::text || (product_id)::text) || ''/''::text) || (id)::text) || ''-thumb.webp''::text)))')))) <> 2 then
    raise exception 'Ràng buộc ảnh nháp khác dự kiến; dừng để kiểm tra';
  end if;
end $$;
alter table public.product_form_staged_images
  drop constraint product_form_staged_images_check,
  drop constraint product_form_staged_images_check1,
  add constraint product_form_staged_images_check
    check (storage_path = 'product-form-images/' || product_id::text || '/' || id::text || '.webp'),
  add constraint product_form_staged_images_check1
    check (thumb_path = 'product-form-images/' || product_id::text || '/' || id::text || '-thumb.webp');
notify pgrst, 'reload schema';
commit;
