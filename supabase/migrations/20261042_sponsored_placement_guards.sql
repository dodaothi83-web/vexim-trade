-- Giai đoạn 0: chặn bán bề mặt chưa nối; nháp danh mục bắt đầu khi được duyệt.
-- Không UPDATE, xoá, gia hạn hay đổi trạng thái bất kỳ gói hiện có nào.
-- Áp sau 20261029_sponsored_approver_role.sql. Kiểm trước trên staging.

create or replace function public.guard_sponsored_placement()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  start_time timestamptz;
begin
  -- Gói trang chủ cũ vẫn được đọc và được tạm dừng để đối soát, nhưng không
  -- tạo mới, duyệt, chạy lại hay chuyển một gói khác sang trang chủ.
  if tg_op = 'INSERT' then
    if new.surface = 'home' then
      raise exception 'Sponsored home placement is not supported';
    end if;
    -- Cả lệnh thêm trực tiếp trạng thái approved cũng bắt đầu ngay khi duyệt;
    -- không cho mốc tuỳ ý vượt qua quy tắc đặt lại nháp trong ứng dụng.
    if new.status = 'approved' and new.surface = 'category' then
      start_time := clock_timestamp();
      new.starts_at := start_time;
      new.ends_at := start_time + interval '168 hours';
      new.approved_at := start_time;
    end if;
  else
    if new.surface = 'home' and
      (old.surface <> 'home' or (old.status <> 'approved' and new.status = 'approved')) then
      raise exception 'Sponsored home placement is not supported';
    end if;
    if old.status = 'draft' and new.status = 'approved' and new.surface = 'category' then
      -- Đồng hồ CSDL là nguồn chính. Trigger này chạy trước trigger kiểm bể.
      start_time := clock_timestamp();
      new.starts_at := start_time;
      new.ends_at := start_time + interval '168 hours';
      new.approved_at := start_time;
    end if;
  end if;
  return new;
end;
$$;

-- PostgreSQL chạy các BEFORE trigger cùng loại theo tên: placement trước rules.
drop trigger if exists sponsored_placement_guards_ck on public.sponsored_pushes;
create trigger sponsored_placement_guards_ck
  before insert or update on public.sponsored_pushes
  for each row execute function public.guard_sponsored_placement();
revoke all on function public.guard_sponsored_placement() from public, anon, authenticated;

-- Giữ kiểm tra người duyệt đang hoạt động. Khoá theo sản phẩm và bể để hai lần
-- duyệt đồng thời không bán trùng hoặc vượt trần. Gói tạm dừng vẫn giữ chỗ đã
-- bán cho đến hết hạn, giống thông tin vận hành trên CRM.
create or replace function public.check_sponsored_push_rules()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  pool_cap integer;
  taken integer;
begin
  if new.status = 'approved' then
    if not exists (
      select 1 from public.app_users u
      where u.id = new.approved_by and u.role in ('admin', 'reviewer') and u.is_active
    ) then
      raise exception 'An active Vexim admin or review lead must approve a sponsored push';
    end if;
    if not exists (
      select 1 from public.supplier_products p
      where p.id = new.product_id and p.supplier_id = new.supplier_id
    ) then
      raise exception 'Product % does not belong to supplier %', new.product_id, new.supplier_id;
    end if;

    perform pg_advisory_xact_lock(hashtext('sponsored_push:product:' || new.product_id::text));
    if new.surface = 'home' then
      perform pg_advisory_xact_lock(hashtext('sponsored_push:home'));
    else
      perform pg_advisory_xact_lock(hashtext('sponsored_push:category:' || new.category_slug));
    end if;

    if exists (
      select 1 from public.sponsored_pushes s
      where s.status in ('approved', 'paused') and s.id <> new.id and s.product_id = new.product_id
        and tstzrange(s.starts_at, s.ends_at) && tstzrange(new.starts_at, new.ends_at)
    ) then
      raise exception 'This product already has a sponsored push in that window';
    end if;

    pool_cap := case new.surface when 'category' then 12 else 8 end;
    select count(*) into taken
    from public.sponsored_pushes s
    where s.status in ('approved', 'paused') and s.id <> new.id
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
notify pgrst, 'reload schema';
