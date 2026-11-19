-- Bảng gói nhà cung cấp quản lý trong CRM (/crm/plans).
--
-- 1. supplier_plan_catalog: tên, mô tả ngắn, quyền lợi, bảng giá theo thời hạn, số sản phẩm
--    tối đa (null = không giới hạn) và quyền đăng ảnh/video cho từng gói. Modal "Nâng cấp gói"
--    trong cổng nhà cung cấp và trigger chặn số sản phẩm đều đọc từ đây.
-- 2. supplier_plan_activations: mỗi lần CRM bật/gia hạn gói trả phí ghi một dòng (thời hạn,
--    số tiền ghi nhận). Báo cáo doanh thu ước tính cộng từ bảng này.
--
-- Nội dung ban đầu theo bảng gói chủ sở hữu duyệt ngày 20/11/2026. Chạy lại an toàn: không
-- ghi đè nội dung đã sửa trong CRM.
begin;

create table if not exists public.supplier_plan_catalog (
  plan text primary key check (plan in ('basic', 'premium', 'pro')),
  name text not null check (length(btrim(name)) between 1 and 60),
  summary text not null default '' check (length(summary) <= 300),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  -- [{ "months": 3, "price_vnd": 1399000 }, ...]; rỗng là miễn phí.
  prices jsonb not null default '[]'::jsonb check (jsonb_typeof(prices) = 'array'),
  max_products integer check (max_products is null or max_products between 1 and 100000),
  media_allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.supplier_plan_catalog (plan, name, summary, features, prices, max_products, media_allowed) values
('basic', 'Basic', 'Miễn phí',
  '["Đăng tối đa 5 sản phẩm", "Tin sản phẩm chỉ gồm nội dung chữ, không bao gồm hình ảnh và video", "Hồ sơ nhà cung cấp cơ bản trên nền tảng"]'::jsonb,
  '[]'::jsonb, 5, false),
('premium', 'Premium', '',
  '["Đăng tối đa 20 sản phẩm, bao gồm hình ảnh và video", "1 bài SEO tiếng Anh mỗi tháng trên website Vexim Trade", "1 bài SEO mỗi tháng trên website của doanh nghiệp (nếu có)", "Nhân viên Vexim tư vấn tối ưu gian hàng và hồ sơ năng lực", "Dùng thử 15 ngày cho khách hàng đã dùng dịch vụ FDA/GACC của Vexim Global"]'::jsonb,
  '[{"months": 3, "price_vnd": 1399000}, {"months": 6, "price_vnd": 2499000}]'::jsonb, 20, true),
('pro', 'Pro', '',
  '["Đăng không giới hạn sản phẩm, bao gồm hình ảnh và video", "2 bài SEO tiếng Anh mỗi tháng trên website Vexim Trade", "2 bài SEO mỗi tháng trên website của doanh nghiệp (nếu có)", "Nhân viên Vexim tư vấn tối ưu gian hàng và hồ sơ năng lực", "Tặng Gói 1 · Website Health Check (khám website tổng thể) khi mua gói 6 tháng"]'::jsonb,
  '[{"months": 3, "price_vnd": 1999000}, {"months": 6, "price_vnd": 3499000}]'::jsonb, null, true)
on conflict (plan) do nothing;

create table if not exists public.supplier_plan_activations (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  plan text not null check (plan in ('premium', 'pro')),
  months integer check (months is null or months between 1 and 120),
  amount_vnd bigint check (amount_vnd is null or amount_vnd between 0 and 100000000000),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists supplier_plan_activations_created_idx on public.supplier_plan_activations (created_at desc);
create index if not exists supplier_plan_activations_supplier_idx on public.supplier_plan_activations (supplier_id, created_at desc);

-- Chỉ server (service_role) đọc/ghi; trình duyệt không đọc thẳng.
alter table public.supplier_plan_catalog enable row level security;
alter table public.supplier_plan_activations enable row level security;
revoke all on table public.supplier_plan_catalog, public.supplier_plan_activations from public, anon, authenticated;
grant all on table public.supplier_plan_catalog, public.supplier_plan_activations to service_role;

-- Giới hạn số sản phẩm đọc từ bảng gói; null là không giới hạn. Gói trả phí hết hạn tính là Basic.
create or replace function public.supplier_product_limit(p_plan text, p_expires_at timestamptz)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_plan in ('premium', 'pro') and p_expires_at is not null and p_expires_at <= now()
      then (select max_products from public.supplier_plan_catalog where plan = 'basic')
    else (select max_products from public.supplier_plan_catalog
          where plan = case when p_plan in ('premium', 'pro') then p_plan else 'basic' end)
  end;
$$;

create or replace function public.enforce_supplier_product_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_plan text;
  v_expires timestamptz;
  v_limit integer;
  v_count integer;
begin
  if new.supplier_id is null then
    return new;
  end if;
  select plan, plan_expires_at into v_plan, v_expires
  from public.suppliers where id = new.supplier_id for update;
  if not found then
    return new;
  end if;
  v_limit := public.supplier_product_limit(v_plan, v_expires);
  if v_limit is null then
    return new;
  end if;
  select count(*) into v_count from public.supplier_products where supplier_id = new.supplier_id;
  if v_count >= v_limit then
    raise exception 'supplier_product_limit_reached: % of %', v_count, v_limit
      using errcode = 'P0001', hint = 'Upgrade the supplier plan or remove a product.';
  end if;
  return new;
end;
$$;

comment on column public.suppliers.plan is 'Gói nhà cung cấp: basic, premium, pro. Quyền lợi và giới hạn ở supplier_plan_catalog. Hết hạn thì tính là basic.';

commit;
notify pgrst, 'reload schema';
