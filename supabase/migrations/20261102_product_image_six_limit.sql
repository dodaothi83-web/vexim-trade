-- Ảnh sản phẩm: một con số duy nhất là 6.
--
-- Giao diện nhà cung cấp có 6 ô ảnh, người mua cũng chỉ nhận tối đa 6 ảnh
-- (`shareableProductImages(..., limit = 6)`), nhưng RPC từ 20261061 vẫn cho 8.
-- Hệ quả: ảnh thứ 7 và thứ 8 được nhận mà không hiện ở đâu cả, vẫn tính vào hạn
-- mức nên nhà cung cấp thấy "đã đủ ảnh" mà không biết vì sao.
--
-- Migration này hạ hạn mức ảnh của sản phẩm xuống 6 cho khớp giao diện và người mua.
-- Không xóa ảnh cũ: sản phẩm đang có 7 hoặc 8 ảnh giữ nguyên dữ liệu, chỉ không thêm
-- ảnh mới được cho đến khi số ảnh giảm xuống dưới 6. Hạn mức 12 tệp mỗi sản phẩm
-- (ảnh và catalogue) và 12 ảnh mỗi kho ảnh giữ nguyên.
begin;
create or replace function public.create_supplier_product_media_guarded(
  p_product_id uuid, p_supplier_id uuid, p_user_id text, p_asset jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  product public.supplier_products%rowtype;
  asset public.media_assets%rowtype;
  media_kind text;
  next_order integer;
begin
  if p_product_id is null or p_supplier_id is null or coalesce(btrim(p_user_id),'') = '' or jsonb_typeof(p_asset) is distinct from 'object' then
    return jsonb_build_object('status','invalid');
  end if;
  media_kind := p_asset->>'kind';
  if media_kind is null or media_kind not in ('image','catalogue') or
     coalesce(p_asset->>'storage_path','') not like ('products/' || p_product_id::text || '/%') then
    return jsonb_build_object('status','invalid');
  end if;
  select * into product from public.supplier_products
    where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found or not (product.supplier_review_status in ('draft','changes_requested') or
     (product.supplier_review_status in ('approved','paused') and product.supplier_originated is true)) then
    return jsonb_build_object('status','state_changed');
  end if;
  if media_kind = 'image' and (select count(*) from public.media_assets
       where owner_type = 'product' and product_id = p_product_id and kind = 'image') >= 6 then
    return jsonb_build_object('status','image_limit');
  end if;
  select coalesce(max(sort_order) + 1, 0) into next_order from public.media_assets
    where owner_type = 'product' and product_id = p_product_id;
  insert into public.media_assets (owner_type,product_id,supplier_id,verification_id,checklist_key,kind,audience,status,expires_on,
    caption,storage_path,thumb_path,external_url,mime,bytes,width,height,sort_order,created_by)
  values ('product',p_product_id,p_supplier_id,null,null,media_kind,
    case when product.supplier_review_status = 'approved' and product.ready_for_buyer then 'buyer' else 'internal' end,
    'unverified',null,left(coalesce(p_asset->>'caption',''),150),p_asset->>'storage_path',nullif(p_asset->>'thumb_path',''),null,
    p_asset->>'mime',nullif(p_asset->>'bytes','')::bigint,nullif(p_asset->>'width','')::integer,
    nullif(p_asset->>'height','')::integer,next_order,p_user_id)
  returning * into asset;
  return jsonb_build_object('status','created','asset',to_jsonb(asset));
end;
$$;
revoke all on function public.create_supplier_product_media_guarded(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_supplier_product_media_guarded(uuid,uuid,text,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
