-- Đổi slug danh mục trong CRM: chuyển mọi chỗ còn lưu slug cũ dạng chữ sang slug mới.
--
-- Trước đây CRM chỉ đổi categories.slug; sản phẩm vẫn trỏ slug cũ nên biến mất khỏi
-- website (gặp ngày 2026-11-22 với ready-to-drink-coffee-tea → ready-to-drink-coffee).
-- Hàm chạy trong một giao dịch, tắt tạm trigger "touch" để ngày cập nhật của sản phẩm,
-- nhà cung cấp và bài viết không bị đặt lại chỉ vì danh mục đổi tên. Chỉ tắt trigger
-- của bảng nào thật sự có dòng cần sửa.
--
-- Không đụng các bảng quảng cáo (sponsored_*): chúng có trigger bảo vệ riêng và lịch
-- sử chiến dịch nên giữ đúng slug tại thời điểm chạy.

create or replace function public.follow_category_slug(p_old text, p_new text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer := 0;
begin
  if p_old is null or p_new is null or btrim(p_old) = '' or btrim(p_new) = '' or p_old = p_new then
    return 0;
  end if;
  if not exists (select 1 from categories where slug = p_new) then
    raise exception 'follow_category_slug: category % does not exist', p_new;
  end if;

  if exists (
    select 1 from supplier_products
    where category = p_old or reviewed_category_slug = p_old or supplier_category_proposal = p_old
  ) then
    alter table supplier_products disable trigger supplier_products_touch;
    update supplier_products set
      category = case when category = p_old then p_new else category end,
      reviewed_category_slug = case when reviewed_category_slug = p_old then p_new else reviewed_category_slug end,
      supplier_category_proposal = case when supplier_category_proposal = p_old then p_new else supplier_category_proposal end
    where category = p_old or reviewed_category_slug = p_old or supplier_category_proposal = p_old;
    get diagnostics moved = row_count;
    alter table supplier_products enable trigger supplier_products_touch;
  end if;

  update supplier_category_requests set category_slug = p_new where category_slug = p_old;

  if exists (select 1 from suppliers where p_old = any(requested_category_slugs)) then
    alter table suppliers disable trigger suppliers_touch;
    update suppliers
      set requested_category_slugs = array(select x from unnest(array_replace(requested_category_slugs, p_old, p_new)) with ordinality t(x, n) group by x order by min(n))
      where p_old = any(requested_category_slugs);
    alter table suppliers enable trigger suppliers_touch;
  end if;

  if exists (select 1 from posts where p_old = any(related_categories)) then
    alter table posts disable trigger posts_set_updated_at;
    update posts
      set related_categories = array(select x from unnest(array_replace(related_categories, p_old, p_new)) with ordinality t(x, n) group by x order by min(n))
      where p_old = any(related_categories);
    alter table posts enable trigger posts_set_updated_at;
  end if;

  return moved;
end;
$$;

revoke all on function public.follow_category_slug(text, text) from public, anon, authenticated;
grant execute on function public.follow_category_slug(text, text) to service_role;
