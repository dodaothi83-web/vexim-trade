-- Đẩy sản phẩm: chỗ chứa gói bán thật.
--
-- Áp migration này KHÔNG tạo gói nào và KHÔNG bật hiển thị gì. Nó chỉ tạo bảng,
-- chặn các trường hợp sai (thời hạn khác 7 ngày, gói trùng sản phẩm, vượt bể, sản
-- phẩm không thuộc nhà cung cấp, người duyệt không phải admin đang hoạt động) và
-- ghi nhận lượt hiển thị cùng lượt bấm.
--
-- Cách chọn thẻ nào hiện ở vùng đẩy nằm ở mã ứng dụng, không nằm trong bảng: xem
-- docs/sponsored-listing-spec.md mục 4.

create table if not exists public.sponsored_pushes (
  id uuid primary key default gen_random_uuid(),
  -- 'category': vùng đẩy trên một trang danh mục. 'home': vùng đẩy trên trang chủ.
  surface text not null default 'category' check (surface in ('category', 'home')),
  -- Danh mục của sản phẩm. Với surface = 'home' vẫn ghi lại để tra cứu, nhưng bể
  -- gói của trang chủ tính chung cho cả trang.
  category_slug text not null,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paused')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Giá bán ghi lại để đối soát. Chưa có thanh toán trong hệ thống.
  price_amount numeric(12, 2) check (price_amount is null or price_amount >= 0),
  price_currency text,
  note text,
  approved_by uuid references public.app_users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  -- Gói chuẩn là đúng 168 giờ. Ghi bằng giờ chứ không bằng ngày: cộng '7 days'
  -- vào timestamptz là cộng theo lịch địa phương, qua mốc đổi giờ có thể ra 167
  -- hoặc 169 giờ. Đặc tả chốt đúng 168 giờ để phủ trọn buyer ở múi giờ khác.
  constraint sponsored_pushes_seven_days_ck check (ends_at = starts_at + interval '168 hours'),
  constraint sponsored_pushes_approval_ck check (
    status <> 'approved' or (approved_by is not null and approved_at is not null)
  )
);

comment on table public.sponsored_pushes is
  'Gói đẩy sản phẩm. Một gói là một sản phẩm trong 168 giờ. Không chứa logic chọn thẻ.';

create index if not exists sponsored_pushes_live_idx
  on public.sponsored_pushes (surface, category_slug, starts_at, ends_at)
  where status = 'approved';

create index if not exists sponsored_pushes_product_idx
  on public.sponsored_pushes (product_id, starts_at, ends_at)
  where status = 'approved';

create or replace function public.check_sponsored_push_rules()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  pool_cap integer;
  taken integer;
begin
  if new.status = 'approved' then
    if not exists (
      select 1 from public.app_users u
      where u.id = new.approved_by and u.role = 'admin' and u.is_active
    ) then
      raise exception 'An active Vexim admin must approve a sponsored push';
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

drop trigger if exists sponsored_push_rules_ck on public.sponsored_pushes;
create trigger sponsored_push_rules_ck
  before insert or update on public.sponsored_pushes
  for each row execute function public.check_sponsored_push_rules();

revoke all on function public.check_sponsored_push_rules() from public, anon, authenticated;

alter table public.sponsored_pushes enable row level security;
revoke all on public.sponsored_pushes from public, anon, authenticated;
grant select, insert, update, delete on public.sponsored_pushes to service_role;

-- Đếm theo ngày UTC, tách khỏi bộ đếm tự nhiên và báo cáo RFQ.
create table if not exists public.sponsored_push_daily (
  push_id uuid not null references public.sponsored_pushes(id) on delete cascade,
  day date not null,
  event_type text not null check (event_type in ('impression', 'click')),
  events bigint not null default 0 check (events >= 0),
  primary key (push_id, day, event_type)
);

alter table public.sponsored_push_daily enable row level security;
revoke all on public.sponsored_push_daily from public, anon, authenticated;
grant select, insert, update, delete on public.sponsored_push_daily to service_role;

-- Chỉ service role gọi được. Kiểm lại trạng thái và thời hạn tại thời điểm ghi, nên
-- một gói đã hết hạn hoặc bị tạm dừng không nhận thêm số.
create or replace function public.record_sponsored_push_event(p_push_id uuid, p_event_type text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_event_type not in ('impression', 'click') then
    raise exception 'Invalid sponsored push event';
  end if;
  if not exists (
    select 1 from public.sponsored_pushes s
    where s.id = p_push_id and s.status = 'approved'
      and s.starts_at <= now() and s.ends_at > now()
  ) then
    return;
  end if;
  insert into public.sponsored_push_daily (push_id, day, event_type, events)
    values (p_push_id, (now() at time zone 'UTC')::date, p_event_type, 1)
  on conflict (push_id, day, event_type)
    do update set events = public.sponsored_push_daily.events + 1;
end;
$$;

revoke all on function public.record_sponsored_push_event(uuid, text) from public, anon, authenticated;
grant execute on function public.record_sponsored_push_event(uuid, text) to service_role;

notify pgrst, 'reload schema';
