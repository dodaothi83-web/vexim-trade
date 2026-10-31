-- Thêm tiền tệ giao dịch: EUR, CNY (nhân dân tệ), VND, JPY (yên Nhật).
-- Chạy trong Supabase SQL Editor sau các migration 20261072 trở về trước.
--
-- Phạm vi:
--   1. Cho cột supplier_products.currency nhận 5 mã tiền tệ (thêm ràng buộc NOT VALID
--      để dữ liệu cũ không bị quét lại và không có bản ghi nào bị sửa).
--   2. Cập nhật hàm duyệt sản phẩm nguyên tử: trước đây hàm chỉ nhận 'USD', nay nhận
--      đủ 5 mã. Không đổi hình dạng dữ liệu, không đổi giá đã duyệt, không backfill.
--   3. Không tự quy đổi giữa các tiền tệ: mỗi bảng giá lưu đúng đơn vị người bán nhập.
--
-- Tắt lại một tiền tệ: bỏ mã khỏi ENTRY_PRICE_CURRENCIES trong
-- lib/products/quantity-pricing.ts, và (nếu muốn chặn ở DB) thu hẹp danh sách dưới đây.
begin;

alter table public.supplier_products
  drop constraint if exists supplier_products_currency_check;
alter table public.supplier_products
  add constraint supplier_products_currency_check
  check (currency is null or currency in ('USD','VND','EUR','CNY','JPY')) not valid;

-- Hàm giữ nguyên toàn bộ logic cũ; chỉ nới điều kiện tiền tệ.
create or replace function public.approve_product_form_submission(
  p_product_id uuid, p_submission_id uuid, p_actor_id uuid,
  p_expected_context jsonb, p_patch jsonb, p_images jsonb, p_warnings jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ctx jsonb; sub jsonb; photo jsonb; snap jsonb; old_photo jsonb;
  item public.supplier_products%rowtype; patch public.supplier_products%rowtype;
  reviewer public.app_users%rowtype; supplier_status text;
  idx integer; media_id uuid; seen uuid[] := '{}';
  price_id uuid; name_id uuid;
  required_keys text[] := array['name','name_i18n','category','reviewed_category_slug','description','description_detail',
    'spec','specs','raw_material_region','input_material_origin','unit','moq','moq_qty','moq_unit','ref_price','ref_price_max',
    'currency','price_publicly_visible','incoterm','incoterm_place','payment_terms','oem','odm','samples','packaging',
    'export_port','lead_time_days','monthly_capacity'];
begin
  if p_product_id is null or p_submission_id is null or p_actor_id is null or
      jsonb_typeof(p_expected_context) is distinct from 'object' or jsonb_typeof(p_patch) is distinct from 'object' or
      not (p_patch ?& required_keys) or p_patch - required_keys <> '{}'::jsonb or
      jsonb_typeof(p_images) is distinct from 'array' or jsonb_array_length(p_images) not between 1 and 8 or
      jsonb_typeof(p_warnings) is distinct from 'array' or jsonb_array_length(p_warnings) > 100 then
    return jsonb_build_object('status','invalid');
  end if;
  -- Refuse to rely on a changed or exposed SQL65 review-context implementation.
  if not exists (select 1 from pg_proc f join pg_namespace n on n.oid=f.pronamespace
      where n.nspname='public' and f.oid=to_regprocedure('public.product_form_review_context(uuid,uuid)')
        and f.prosecdef and f.proconfig @> array['search_path=public, pg_temp']
        and md5(f.prosrc)='bde4535c3c6fec13efda975f08c82e77') or
      has_function_privilege('anon','public.product_form_review_context(uuid,uuid)','execute') or
      has_function_privilege('authenticated','public.product_form_review_context(uuid,uuid)','execute') or
      not has_function_privilege('service_role','public.product_form_review_context(uuid,uuid)','execute') then
    return jsonb_build_object('status','review_unavailable');
  end if;
  ctx := public.product_form_review_context(p_product_id,p_submission_id);
  if ctx->>'status' is distinct from 'ok' or ctx is distinct from p_expected_context then
    return jsonb_build_object('status','context_changed');
  end if;
  select * into reviewer from public.app_users where id=p_actor_id for share;
  if not found or not reviewer.is_active or reviewer.role not in ('admin','reviewer') then
    return jsonb_build_object('status','not_authorized');
  end if;
  select * into item from public.supplier_products where id=p_product_id;
  select status into supplier_status from public.suppliers where id=item.supplier_id for share;
  if not found or supplier_status <> 'published' then return jsonb_build_object('status','supplier_unavailable'); end if;
  sub := ctx->'submission';
  if jsonb_array_length(sub->'image_selection') <> jsonb_array_length(p_images) or
     jsonb_typeof(sub->'quantity') is distinct from 'object' then return jsonb_build_object('status','invalid'); end if;
  -- Existing independent draft/pending quantity revisions are never discarded.
  if exists (select 1 from public.product_quantity_price_revisions where product_id=p_product_id and status in ('draft','pending')) or
     exists (select 1 from public.product_english_name_revisions where product_id=p_product_id and status in ('draft','pending')) then
    return jsonb_build_object('status','other_revision_pending');
  end if;
  patch := jsonb_populate_record(null::public.supplier_products,p_patch);
  if patch.name is distinct from btrim(sub->'payload'->>'name') or patch.category is distinct from sub->'payload'->>'category' or
     patch.reviewed_category_slug is distinct from patch.category or patch.incoterm is distinct from sub->'quantity'->>'incoterm' or
     patch.specs->>'grade' is distinct from sub->'quantity'->>'grade' or jsonb_typeof(patch.name_i18n) is distinct from 'object' or
     coalesce(btrim(patch.name_i18n->>'en'),'') = '' or coalesce(patch.currency,'') not in ('USD','VND','EUR','CNY','JPY') or
     patch.price_publicly_visible is distinct from (sub->'payload'->>'pricePubliclyVisible')::boolean or
     (patch.price_publicly_visible and (sub->'payload'->>'priceConsent')::boolean is distinct from true) then
    return jsonb_build_object('status','invalid');
  end if;
  -- Until HTTP category redirects are fully cut over, never change the route of
  -- an existing published product. Indexed IDs, slugs and URLs stay untouched.
  if item.supplier_review_status in ('approved','paused') and
     coalesce(item.reviewed_category_slug,item.supplier_category_proposal,item.category) is distinct from patch.category then
    return jsonb_build_object('status','category_route_changed');
  end if;
  for idx in 0..jsonb_array_length(p_images)-1 loop
    photo := p_images->idx; snap := sub->'image_snapshot'->idx; old_photo := snap->'row';
    if sub->'image_selection'->idx->>'source' is distinct from 'staged' or
       photo->>'stagedId' is distinct from sub->'image_selection'->idx->>'id' or
       jsonb_typeof(photo) is distinct from 'object' or
       coalesce(photo->>'mediaId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('status','images_changed');
    end if;
    media_id := (photo->>'mediaId')::uuid;
    if media_id=any(seen) or media_id=any(array(select (value->>'id')::uuid from jsonb_array_elements(sub->'image_selection'))) or
       photo->>'storagePath' is distinct from 'product-form-images/'||p_product_id::text||'/'||media_id::text||'.webp' or
       photo->>'thumbPath' is distinct from 'product-form-images/'||p_product_id::text||'/'||media_id::text||'-thumb.webp' or
       photo->'bytes' is distinct from old_photo->'bytes' or photo->'thumbBytes' is distinct from old_photo->'thumb_bytes' or
       photo->'width' is distinct from old_photo->'width' or photo->'height' is distinct from old_photo->'height' or
       photo->'sha256' is distinct from old_photo->'sha256' or photo->'thumbSha256' is distinct from old_photo->'thumb_sha256' or
       photo->'caption' is distinct from old_photo->'caption' or
       exists (select 1 from public.media_assets m where m.id=media_id or m.storage_path in (photo->>'storagePath',photo->>'thumbPath') or m.thumb_path in (photo->>'storagePath',photo->>'thumbPath')) or
       exists (select 1 from public.product_form_staged_images s where s.id=media_id or s.storage_path in (photo->>'storagePath',photo->>'thumbPath') or s.thumb_path in (photo->>'storagePath',photo->>'thumbPath')) then
      return jsonb_build_object('status','images_changed');
    end if;
    seen := array_append(seen,media_id);
  end loop;
  insert into public.product_form_publication_history(submission_id,product_id,supplier_id,reviewer_id,previous_context)
    values(p_submission_id,p_product_id,item.supplier_id,p_actor_id,ctx);
  for idx in 0..jsonb_array_length(p_images)-1 loop
    photo := p_images->idx;
    insert into public.media_assets(id,owner_type,product_id,supplier_id,kind,audience,status,caption,storage_path,thumb_path,mime,bytes,width,height,sort_order,created_by)
      values ((photo->>'mediaId')::uuid,'product',p_product_id,item.supplier_id,'image','buyer','checked',photo->>'caption',
        photo->>'storagePath',photo->>'thumbPath','image/webp',(photo->>'bytes')::bigint,(photo->>'width')::integer,(photo->>'height')::integer,idx,p_actor_id::text);
  end loop;
  update public.supplier_products set name=patch.name,name_i18n=patch.name_i18n,category=patch.category,
    reviewed_category_slug=patch.reviewed_category_slug,description=patch.description,description_detail=patch.description_detail,
    spec=patch.spec,specs=patch.specs,raw_material_region=patch.raw_material_region,input_material_origin=patch.input_material_origin,
    unit=patch.unit,moq=patch.moq,moq_qty=patch.moq_qty,moq_unit=patch.moq_unit,ref_price=patch.ref_price,ref_price_max=patch.ref_price_max,
    currency=patch.currency,price_publicly_visible=patch.price_publicly_visible,incoterm=patch.incoterm,incoterm_place=patch.incoterm_place,
    payment_terms=patch.payment_terms,oem=patch.oem,odm=patch.odm,samples=patch.samples,packaging=patch.packaging,export_port=patch.export_port,
    lead_time_days=patch.lead_time_days,monthly_capacity=patch.monthly_capacity,featured_media_id=(p_images->0->>'mediaId')::uuid,
    supplier_review_status=case when item.supplier_review_status='pending' then 'approved' else item.supplier_review_status end,
    ready_for_buyer=case when item.supplier_review_status='pending' then true else item.ready_for_buyer end,
    supplier_review_note=null,updated_at=now() where id=p_product_id returning * into item;
  update public.product_quantity_price_revisions set status='superseded' where product_id=p_product_id and status='approved';
  update public.product_english_name_revisions set status='superseded' where product_id=p_product_id and status='approved';
  insert into public.product_quantity_price_revisions(product_id,status,grade,incoterm,tiers,warnings,confirmed_at,reviewed_at,reviewed_by,product_updated_at,product_context)
    values(p_product_id,'approved',sub->'quantity'->>'grade',sub->'quantity'->>'incoterm',sub->'quantity'->'tiers',p_warnings,now(),now(),p_actor_id,item.updated_at,public.quantity_product_review_context(to_jsonb(item))) returning id into price_id;
  insert into public.product_english_name_revisions(product_id,status,source_name,english_name,origin,reviewed_at,reviewed_by,product_updated_at,product_context)
    values(p_product_id,'approved',item.name,item.name_i18n->>'en','staff',now(),p_actor_id,item.updated_at,public.quantity_product_review_context(to_jsonb(item))) returning id into name_id;
  update public.product_form_submissions set status='superseded' where product_id=p_product_id and status='approved';
  update public.product_form_submissions set status='approved',decided_at=now(),decided_by=p_actor_id,approved_price_revision_id=price_id,
    approved_product_updated_at=item.updated_at where id=p_submission_id;
  -- Rebase only the exact submitted draft. A newer draft is left untouched and
  -- remains stale for manual reconciliation rather than silently overwriting it.
  -- A new review must obtain fresh price consent, and incrementing revision
  -- invalidates browser tabs that still hold the submitted draft.
  update public.product_form_drafts set base_product_updated_at=item.updated_at,
    payload=jsonb_set(payload,'{priceConsent}','false'::jsonb,true),revision=revision+1,updated_at=now()
    where product_id=p_product_id and supplier_id=item.supplier_id and revision=(sub->>'draft_revision')::integer
      and payload=sub->'payload' and image_selection=sub->'image_selection';
  delete from public.product_form_published_images where product_id=p_product_id;
  for idx in 0..jsonb_array_length(p_images)-1 loop
    insert into public.product_form_published_images(product_id,submission_id,media_id,position)
      values(p_product_id,p_submission_id,(p_images->idx->>'mediaId')::uuid,idx);
  end loop;
  insert into public.audit_log(actor_id,actor_email,entity,entity_id,action,before,after)
    values(p_actor_id,reviewer.email,'product',p_product_id::text,'product_form.approved',
      jsonb_build_object('submission_id',p_submission_id,'product_updated_at',ctx->'product'->'updated_at'),
      jsonb_build_object('price_revision_id',price_id,'name_revision_id',name_id,'product_updated_at',item.updated_at));
  return jsonb_build_object('status','approved','price_revision_id',price_id,'name_revision_id',name_id);
end;
$$;

commit;
