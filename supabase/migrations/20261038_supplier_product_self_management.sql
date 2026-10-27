-- Cổng NCC: tạm ẩn sản phẩm đã duyệt và xóa an toàn bản nháp chưa có lịch sử.
-- Chạy sau các migration sản phẩm/duyệt, trước khi deploy mã mới. Không thay đổi
-- trạng thái hay xóa dữ liệu hiện có khi áp dụng migration này.
begin;
alter table public.supplier_products drop constraint if exists supplier_products_supplier_review_status_check;
alter table public.supplier_products add constraint supplier_products_supplier_review_status_check
  check (supplier_review_status in ('draft', 'pending', 'approved', 'changes_requested', 'paused'));

-- Chỉ service_role được gọi. Khóa sản phẩm trong giao dịch để đồng bộ chuyển
-- trạng thái và các liên kết có FK đến sản phẩm. Kiểm tra thêm liên kết hiện có
-- (kể cả mảng không có FK); chỉ sau khi xóa CSDL ứng dụng mới dọn Storage.
create or replace function public.delete_supplier_draft_product(p_product_id uuid, p_supplier_id uuid)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  product public.supplier_products%rowtype;
  linked boolean := false;
  paths jsonb := '[]'::jsonb;
begin
  select * into product from public.supplier_products
  where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found or product.supplier_review_status <> 'draft' or product.supplier_originated is not true
     or product.ready_for_buyer is not false or product.reviewed_category_slug is not null then
    return jsonb_build_object('status', 'not_deletable');
  end if;

  -- Một số bảng/cột có thể chưa tồn tại trên môi trường chưa bật tính năng tương ứng.
  if to_regclass('public.rfqs') is not null and exists (
    select 1 from pg_attribute where attrelid = to_regclass('public.rfqs')
      and attname = 'source_product_id' and not attisdropped
  ) then
    execute 'select exists (select 1 from public.rfqs where source_product_id = $1)' into linked using p_product_id;
  end if;
  if not linked and to_regclass('public.audit_log') is not null then
    execute 'select exists (select 1 from public.audit_log where entity = ''product'' and entity_id = $1::text and action in (''supplier.product_approved'', ''supplier.product_published'', ''supplier.product_paused''))'
      into linked using p_product_id;
  end if;
  if not linked and to_regclass('public.sponsored_pushes') is not null then
    execute 'select exists (select 1 from public.sponsored_pushes where product_id = $1)' into linked using p_product_id;
  end if;
  if not linked and to_regclass('public.sponsored_pilot_campaigns') is not null then
    execute 'select exists (select 1 from public.sponsored_pilot_campaigns where product_id = $1)' into linked using p_product_id;
  end if;
  if not linked and to_regclass('public.certificates') is not null and exists (
    select 1 from pg_attribute where attrelid = to_regclass('public.certificates')
      and attname = 'requested_product_ids' and not attisdropped
  ) then
    execute 'select exists (select 1 from public.certificates where $1 = any(requested_product_ids))'
      into linked using p_product_id;
  end if;
  if not linked and to_regclass('public.certificates') is not null and exists (
    select 1 from pg_attribute where attrelid = to_regclass('public.certificates')
      and attname = 'approved_product_ids' and not attisdropped
  ) then
    execute 'select exists (select 1 from public.certificates where $1 = any(approved_product_ids))'
      into linked using p_product_id;
  end if;
  if not linked and to_regclass('public.certificates') is not null and exists (
    select 1 from pg_attribute where attrelid = to_regclass('public.certificates')
      and attname = 'file_media_id' and not attisdropped
  ) then
    execute 'select exists (select 1 from public.certificates c join public.media_assets m on m.id = c.file_media_id where m.product_id = $1)'
      into linked using p_product_id;
  end if;
  if not linked and to_regclass('public.supplier_submission_items') is not null then
    execute 'select exists (select 1 from public.supplier_submission_items i join public.media_assets m on (m.id = i.media_id or i.storage_path = m.storage_path or i.storage_path = m.thumb_path or i.thumb_path = m.storage_path or i.thumb_path = m.thumb_path) where m.product_id = $1)'
      into linked using p_product_id;
  end if;
  if not linked then
    select exists (
      select 1 from public.media_assets m where m.product_id = p_product_id
        and (m.owner_type is distinct from 'product' or m.supplier_id is distinct from p_supplier_id)
    ) into linked;
  end if;
  if not linked then
    select exists (
      select 1 from public.supplier_products other
      join public.media_assets m on m.id = other.featured_media_id
      where other.id <> p_product_id and m.product_id = p_product_id
    ) into linked;
  end if;
  if not linked and exists (
    select 1 from pg_attribute where attrelid = to_regclass('public.supplier_products')
      and attname = 'images' and not attisdropped
  ) then
    execute 'select exists (select 1 from public.supplier_products other join public.media_assets m on m.id = any(other.images) where other.id <> $1 and m.product_id = $1)'
      into linked using p_product_id;
  end if;
  if linked then return jsonb_build_object('status', 'has_links'); end if;

  select coalesce(jsonb_agg(distinct entry.path) filter (where entry.path is not null), '[]'::jsonb)
  into paths from public.media_assets m
  cross join lateral (values (m.storage_path), (m.thumb_path)) as entry(path)
  where m.product_id = p_product_id;

  delete from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id;
  return jsonb_build_object('status', 'deleted', 'paths', paths);
end;
$$;
revoke all on function public.delete_supplier_draft_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_supplier_draft_product(uuid, uuid) to service_role;

-- Xóa tệp trong cùng transaction với kiểm tra trạng thái và tệp buyer cuối;
-- hai yêu cầu xóa đồng thời của cùng sản phẩm được tuần tự hóa trên khóa sản phẩm.
create or replace function public.delete_supplier_product_media(
  p_product_id uuid, p_supplier_id uuid, p_user_id text, p_media_id uuid
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  product public.supplier_products%rowtype;
  asset public.media_assets%rowtype;
  linked boolean := false;
  replacement boolean := false;
  paths jsonb := '[]'::jsonb;
begin
  select * into product from public.supplier_products
  where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found or not (
    product.supplier_review_status in ('draft', 'changes_requested') or
    (product.supplier_review_status in ('approved', 'paused') and product.supplier_originated is true)
  ) then
    return jsonb_build_object('status', 'state_changed');
  end if;
  select * into asset from public.media_assets where id = p_media_id for update;
  if not found or asset.owner_type <> 'product' or asset.product_id is distinct from p_product_id
     or asset.supplier_id is distinct from p_supplier_id or asset.created_by is distinct from p_user_id
     or (product.supplier_review_status = 'draft' and asset.audience <> 'internal') then
    return jsonb_build_object('status', 'forbidden');
  end if;

  if product.supplier_review_status = 'approved' and product.ready_for_buyer and asset.audience = 'buyer' then
    select exists (
      select 1 from public.media_assets m
      where m.id <> p_media_id and m.owner_type = 'product' and m.product_id = p_product_id
        and m.supplier_id = p_supplier_id and m.kind in ('image', 'catalogue') and m.audience = 'buyer'
        and m.storage_path is not null and m.storage_path <> '' and m.status <> 'expired'
        and (m.expires_on is null or m.expires_on >= (now() at time zone 'UTC')::date)
    ) into replacement;
    if not replacement then return jsonb_build_object('status', 'last_file'); end if;
  end if;

  if to_regclass('public.certificates') is not null and exists (
    select 1 from pg_attribute where attrelid = to_regclass('public.certificates')
      and attname = 'file_media_id' and not attisdropped
  ) then
    execute 'select exists (select 1 from public.certificates where file_media_id = $1)' into linked using p_media_id;
  end if;
  if not linked and to_regclass('public.supplier_submission_items') is not null then
    execute 'select exists (select 1 from public.supplier_submission_items where media_id = $1 or storage_path in ($2, $3) or thumb_path in ($2, $3))'
      into linked using p_media_id, asset.storage_path, asset.thumb_path;
  end if;
  if not linked then
    select exists (select 1 from public.supplier_products other
      where other.id <> p_product_id and other.featured_media_id = p_media_id) into linked;
  end if;
  if not linked and exists (
    select 1 from pg_attribute where attrelid = to_regclass('public.supplier_products')
      and attname = 'images' and not attisdropped
  ) then
    execute 'select exists (select 1 from public.supplier_products other where other.id <> $1 and $2 = any(other.images))'
      into linked using p_product_id, p_media_id;
  end if;
  if linked then return jsonb_build_object('status', 'has_links'); end if;

  select coalesce(jsonb_agg(distinct entry.path) filter (where entry.path is not null), '[]'::jsonb)
    into paths from (values (asset.storage_path), (asset.thumb_path)) as entry(path);
  delete from public.media_assets where id = p_media_id;
  return jsonb_build_object('status', 'deleted', 'kind', asset.kind, 'paths', paths);
end;
$$;
revoke all on function public.delete_supplier_product_media(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.delete_supplier_product_media(uuid, uuid, text, uuid) to service_role;
commit;
notify pgrst, 'reload schema';
