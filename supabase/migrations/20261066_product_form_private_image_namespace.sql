-- KHÔNG CHẠY LÚC NÀY: sửa sai khác SQL64, cần kiểm thử staging trước khi triển khai form.
-- Không đổi/xóa sản phẩm, ảnh, bản nháp hay bản gửi. Nếu còn ảnh nháp dùng
-- đường dẫn cũ, dừng toàn bộ migration để xử lý thủ công; không tự chuyển file.
begin;
lock table public.product_form_staged_images in access exclusive mode;
do $$
declare
  stage_fn regprocedure := to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)');
begin
  if stage_fn is null or has_function_privilege('anon', stage_fn, 'execute')
     or has_function_privilege('authenticated', stage_fn, 'execute')
     or not has_function_privilege('service_role', stage_fn, 'execute') then
    raise exception 'Hàm ảnh nháp hoặc quyền khác dự kiến; dừng để kiểm tra';
  end if;
  if exists (select 1 from public.product_form_staged_images
    where storage_path is distinct from 'product-form-images/' || product_id::text || '/' || id::text || '.webp'
       or thumb_path is distinct from 'product-form-images/' || product_id::text || '/' || id::text || '-thumb.webp') then
    raise exception 'Ảnh nháp đang dùng đường dẫn cũ; dừng để kiểm tra, không tự chuyển dữ liệu';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.product_form_staged_images'::regclass
      and contype = 'c' and conname in ('product_form_staged_images_check','product_form_staged_images_check1')
      and pg_get_constraintdef(oid) like '%product_id%'
      and ((conname = 'product_form_staged_images_check' and pg_get_constraintdef(oid) like '%storage_path%')
        or (conname = 'product_form_staged_images_check1' and pg_get_constraintdef(oid) like '%thumb_path%'))
      and (pg_get_constraintdef(oid) like '%products/%' or pg_get_constraintdef(oid) like '%product-form-images/%')) <> 2 then
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

-- Replace only the existing service-only function; keep its signature and grants.
create or replace function public.stage_product_form_image(
  p_supplier_id uuid, p_product_id uuid, p_user_id text, p_expected_revision integer,
  p_id uuid, p_caption text, p_bytes bigint, p_width integer, p_height integer,
  p_sha256 text, p_thumb_bytes bigint, p_thumb_sha256 text,
  p_replaces_media_id uuid default null, p_expected_media jsonb default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  product public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
  photo public.product_form_staged_images%rowtype;
  source_media public.media_assets%rowtype;
  next_selection jsonb;
  path text;
  thumb text;
begin
  if p_supplier_id is null or p_product_id is null or p_id is null or coalesce(btrim(p_user_id), '') = ''
     or p_expected_revision is null or p_expected_revision < 1 or length(coalesce(p_caption,'')) > 150
     or p_bytes is null or p_bytes not between 1 and 8388608
     or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
     or p_thumb_bytes is null or p_thumb_bytes not between 1 and 8388608
     or p_thumb_sha256 is null or p_thumb_sha256 !~ '^[a-f0-9]{64}$'
     or (p_replaces_media_id is null) <> (p_expected_media is null)
     or (p_expected_media is not null and jsonb_typeof(p_expected_media) is distinct from 'object')
     or p_width is null or p_width not between 1 and 20000 or p_height is null or p_height not between 1 and 20000 then
    return jsonb_build_object('status','invalid');
  end if;
  select * into product from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_owned'); end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','missing_draft'); end if;
  select * into photo from public.product_form_staged_images where id = p_id;
  if found then
    if photo.product_id = p_product_id and photo.supplier_id = p_supplier_id and photo.created_by = p_user_id
       and photo.caption = coalesce(p_caption,'') and photo.bytes = p_bytes and photo.sha256 = p_sha256
       and photo.thumb_bytes = p_thumb_bytes and photo.thumb_sha256 = p_thumb_sha256
       and photo.width = p_width and photo.height = p_height then
      return jsonb_build_object('status','exists','revision',draft.revision,'image_id',photo.id);
    end if;
    return jsonb_build_object('status','conflict');
  end if;
  if product.supplier_review_status is null or product.supplier_review_status not in ('draft','changes_requested','approved','paused') then
    return jsonb_build_object('status','state_changed');
  end if;
  if draft.revision <> p_expected_revision then return jsonb_build_object('status','changed'); end if;
  if draft.base_product_updated_at is distinct from product.updated_at then return jsonb_build_object('status','product_changed'); end if;
  if p_replaces_media_id is null then
    if jsonb_array_length(draft.image_selection) >= 8 then return jsonb_build_object('status','image_limit'); end if;
    next_selection := draft.image_selection || jsonb_build_array(jsonb_build_object('source','staged','id',p_id));
  else
    -- Replace the selected reference in place, without deleting or changing
    -- the public media. The trusted caller has copied the source bytes first.
    select * into source_media from public.media_assets where id = p_replaces_media_id for update;
    if not found or to_jsonb(source_media) is distinct from p_expected_media
       or source_media.owner_type is distinct from 'product' or source_media.product_id is distinct from p_product_id
       or source_media.supplier_id is distinct from p_supplier_id or source_media.kind is distinct from 'image'
       or source_media.storage_path is null or btrim(source_media.storage_path) = ''
       or source_media.status is null or source_media.status = 'expired'
       or (source_media.expires_on is not null and source_media.expires_on < (now() at time zone 'UTC')::date)
       or (source_media.audience is distinct from 'buyer' and source_media.created_by is distinct from p_user_id)
       or (select count(*) from jsonb_array_elements(draft.image_selection) e
           where e->>'source' = 'media' and e->>'id' = p_replaces_media_id::text) <> 1 then
      return jsonb_build_object('status','image_unavailable');
    end if;
    select jsonb_agg(case when e.value->>'source' = 'media' and e.value->>'id' = p_replaces_media_id::text
      then jsonb_build_object('source','staged','id',p_id) else e.value end order by e.ordinality)
      into next_selection from jsonb_array_elements(draft.image_selection) with ordinality e(value, ordinality);
  end if;
  path := 'product-form-images/' || p_product_id::text || '/' || p_id::text || '.webp';
  thumb := 'product-form-images/' || p_product_id::text || '/' || p_id::text || '-thumb.webp';
  -- Never create an ambiguous owner for a path served by public-media.
  if exists (select 1 from public.media_assets where id = p_id or storage_path in (path,thumb) or thumb_path in (path,thumb))
     or exists (select 1 from public.product_form_staged_images where storage_path in (path,thumb) or thumb_path in (path,thumb)) then
    return jsonb_build_object('status','conflict');
  end if;
  insert into public.product_form_staged_images (id,product_id,supplier_id,created_by,storage_path,thumb_path,caption,mime,bytes,width,height,sha256,thumb_bytes,thumb_sha256)
    values (p_id,p_product_id,p_supplier_id,p_user_id,path,thumb,coalesce(p_caption,''),'image/webp',p_bytes,p_width,p_height,p_sha256,p_thumb_bytes,p_thumb_sha256);
  update public.product_form_drafts set revision = revision + 1, updated_at = now(), image_selection = next_selection
    where product_id = p_product_id returning * into draft;
  return jsonb_build_object('status','created','revision',draft.revision,'image_id',p_id);
end;
$$;

-- Called before any Storage write. A missing or mismatched migration must not
-- leave orphan files while an older stage function still targets products/.
create or replace function public.product_form_image_namespace_ready()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)') is not null
    and position('product-form-images/' in pg_get_functiondef(to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)'))) > 0
    and not has_function_privilege('anon', to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)'), 'execute')
    and not has_function_privilege('authenticated', to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)'), 'execute')
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
