-- ============================================================================
--  VEXIM TRADE – AI ĐƯỢC DUYỆT GÓI ĐẨY SẢN PHẨM
--
--  Trước: chỉ tài khoản admin đang hoạt động mới duyệt được. Nhưng việc xét duyệt
--  nội dung công khai của Vexim vốn do trưởng kiểm duyệt làm (role 'reviewer'), và
--  người đó đã duyệt hồ sơ xác minh NCC, công khai danh mục. Duyệt gói đẩy cũng là
--  một quyết định công khai, nên giao cùng một người thay vì buộc admin làm.
--
--  Sau: admin hoặc reviewer, tài khoản phải đang hoạt động. Không nới thêm vai trò
--  nào khác, và không đổi điều kiện bốn mắt: dòng approved vẫn phải có approved_by
--  và approved_at (ràng buộc sponsored_pushes_approval_ck ở migration trước).
--
--  Chạy trong Supabase SQL Editor sau 20261028_sponsored_product_push.sql.
--  Chỉ thay phần kiểm người duyệt; các luật còn lại của hàm giữ nguyên từng dòng để
--  chạy lại nhiều lần vẫn ra cùng kết quả.
-- ============================================================================

create or replace function public.check_sponsored_push_rules()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  pool_cap integer;
  taken integer;
begin
  if new.status = 'approved' then
    if not exists (
      select 1 from public.app_users u
      where u.id = new.approved_by
        and u.role in ('admin', 'reviewer')
        and u.is_active
    ) then
      raise exception 'An active Vexim admin or review lead must approve a sponsored push';
    end if;

    if not exists (
      select 1 from public.supplier_products p
      where p.id = new.product_id and p.supplier_id = new.supplier_id
    ) then
      raise exception 'Product % does not belong to supplier %', new.product_id, new.supplier_id;
    end if;

    -- Khoá theo bể để hai giao dịch đồng thời không cùng vượt trần.
    if new.surface = 'home' then
      perform pg_advisory_xact_lock(hashtext('sponsored_push:home'));
    else
      perform pg_advisory_xact_lock(hashtext('sponsored_push:category:' || new.category_slug));
    end if;

    -- Một sản phẩm chỉ có một gói trong cùng khoảng thời gian.
    if exists (
      select 1 from public.sponsored_pushes s
      where s.status = 'approved' and s.id <> new.id and s.product_id = new.product_id
        and tstzrange(s.starts_at, s.ends_at) && tstzrange(new.starts_at, new.ends_at)
    ) then
      raise exception 'This product already has a sponsored push in that window';
    end if;

    -- Bể gói: 12 suất mỗi danh mục, 8 suất cho trang chủ (xem đặc tả mục 3).
    pool_cap := case new.surface when 'category' then 12 else 8 end;
    select count(*) into taken
    from public.sponsored_pushes s
    where s.status = 'approved' and s.id <> new.id
      and s.surface = new.surface
      and (new.surface = 'home' or s.category_slug = new.category_slug)
      and tstzrange(s.starts_at, s.ends_at) && tstzrange(new.starts_at, new.ends_at);
    if taken >= pool_cap then
      raise exception 'Sponsored pool is full (% slots) for % %', pool_cap, new.surface, new.category_slug;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.check_sponsored_push_rules() from public, anon, authenticated;

-- Nhắc lại điều kiện của cột để người sửa sau không phải mở migration cũ:
comment on column public.sponsored_pushes.approved_by is
  'Người duyệt: app_users.id của admin hoặc reviewer đang hoạt động. Trigger kiểm lại khi ghi status = approved.';
