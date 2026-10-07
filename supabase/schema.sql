-- ============================================================================
--  VEXIM TRADE – CRM PHÒNG SALE XUẤT KHẨU
--  Chạy toàn bộ file này trong Supabase → SQL Editor (New query → Run)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. NHÀ CUNG CẤP
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,               -- tên pháp nhân
  trade_name      text,                        -- tên thương mại
  contact_name    text,
  contact_title   text,                        -- chức vụ người liên hệ
  email           text,
  phone           text,
  zalo            text,
  website         text,
  country         text,
  address         text,
  province        text,
  role            text not null default 'manufacturer' check (role in
                    ('manufacturer','trader','agent','exporter')),
  markets         text,                        -- thị trường phục vụ / muốn bán
  products        text,                        -- tóm tắt ngành hàng chính
  tax_id          text,
  payment_terms   text,
  lead_time_days  integer,
  rating          integer check (rating between 1 and 5),
  notes           text,
  status          text not null default 'new' check (status in
                    ('new','verifying','verified','paused')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists suppliers_name_idx on public.suppliers (name);

-- Hồ sơ sản phẩm riêng của từng NCC (để so khớp với RFQ của buyer)
create table if not exists public.supplier_products (
  id                uuid primary key default gen_random_uuid(),
  supplier_id       uuid not null references public.suppliers(id) on delete cascade,
  name              text not null,
  category          text,
  description       text,
  spec              text,
  unit              text,
  moq               text,
  monthly_capacity  text,
  lead_time_days    integer,
  packaging         text,
  oem               boolean not null default false,
  certifications    text,
  export_port       text,
  ref_price         numeric(14,2),
  currency          text,
  price_valid_until date,
  incoterm          text,
  incoterm_place    text,
  payment_terms     text,
  samples           boolean not null default false,
  -- Chỉ bật được khi hồ sơ có ít nhất 1 ảnh/catalogue chia sẻ cho buyer
  ready_for_buyer   boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Nếu bảng đã tồn tại từ trước, thêm cột còn thiếu:
alter table public.supplier_products
  add column if not exists ready_for_buyer boolean not null default false;

create index if not exists supplier_products_supplier_idx on public.supplier_products (supplier_id);
create index if not exists supplier_products_category_idx on public.supplier_products (category);

-- ---------------------------------------------------------------------------
-- 2. BUYER  (mỗi buyer = một đơn trong pipeline)
-- ---------------------------------------------------------------------------
create table if not exists public.buyers (
  id                        uuid primary key default gen_random_uuid(),
  company                   text not null,
  contact_name              text,
  email                     text,
  cc_emails                 text,
  phone                     text,
  country                   text,
  website                   text,
  linkedin                  text,
  instagram                 text,
  product                   text,
  spec                      text,
  quantity                  text,
  target_price              text,
  payment_method            text,
  payment_terms             text,
  incoterm                  text,
  port                      text,
  expected_ship_date        date,
  deal_value                numeric(14,2),
  -- NULL = chưa chọn nhà cung cấp (bình thường ở giai đoạn đầu)
  supplier_id               uuid references public.suppliers(id) on delete set null,
  -- Ẩn danh buyer trong email gửi NCC (mặc định: ẩn)
  hide_buyer_from_supplier  boolean not null default true,
  stage                     text not null default 'lead' check (stage in
                              ('lead','contacted','quoted','negotiation',
                               'confirmed','production','shipping','completed','lost')),
  owner                     text,
  source                    text,
  priority                  text not null default 'normal' check (priority in ('low','normal','high')),
  next_action               text,
  next_action_date          date,
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists buyers_stage_idx    on public.buyers (stage);
create index if not exists buyers_supplier_idx on public.buyers (supplier_id);
create index if not exists buyers_owner_idx    on public.buyers (owner);
create index if not exists buyers_updated_idx  on public.buyers (updated_at desc);

-- ---------------------------------------------------------------------------
-- 3. LỊCH SỬ HOẠT ĐỘNG
-- ---------------------------------------------------------------------------
create table if not exists public.buyer_activities (
  id          uuid primary key default gen_random_uuid(),
  buyer_id    uuid not null references public.buyers(id) on delete cascade,
  type        text not null check (type in
                ('created','updated','stage_change','supplier_change','note','email')),
  from_stage  text,
  to_stage    text,
  message     text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists activities_buyer_idx on public.buyer_activities (buyer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. HỘP THƯ – mọi email gửi đi (tự động theo giai đoạn + đội ngũ tự soạn)
-- ---------------------------------------------------------------------------
create table if not exists public.email_messages (
  id           uuid primary key default gen_random_uuid(),
  buyer_id     uuid references public.buyers(id) on delete cascade,
  supplier_id  uuid references public.suppliers(id) on delete set null,
  -- 'auto'  = hệ thống tự gửi khi đổi giai đoạn trong pipeline
  -- 'manual'= đội ngũ soạn bằng trình soạn thảo
  kind         text not null default 'auto' check (kind in ('auto','manual')),
  stage        text,
  direction    text not null check (direction in ('buyer','supplier')),
  thread_id    text not null default '',
  subject      text not null,
  to_emails    text[] not null default '{}',
  cc_emails    text[] not null default '{}',
  bcc_emails   text[] not null default '{}',
  body_html    text not null,
  body_text    text not null default '',
  -- [{ name, size, type, content(base64) }]
  attachments  jsonb not null default '[]',
  status       text not null check (status in ('draft','sent','failed','simulated')),
  provider     text not null default 'resend',
  error        text,
  created_by   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);

create index if not exists email_messages_buyer_idx on public.email_messages (buyer_id, created_at desc);
create index if not exists email_messages_kind_idx  on public.email_messages (kind, created_at desc);
create index if not exists email_messages_created_idx on public.email_messages (created_at desc);

-- ---------------------------------------------------------------------------
-- 5. HÌNH ẢNH & TÀI LIỆU (media)
--    - Ảnh/catalogue/chứng nhận của sản phẩm  -> owner_type = 'product'
--    - Ảnh nhà máy + giấy tờ xác minh NCC     -> owner_type = 'supplier'
--    - audience = 'buyer'    : được phép gửi/chia sẻ cho buyer
--      audience = 'internal' : chỉ dùng nội bộ (giấy tờ xác minh, tài liệu mật)
--    - status: unverified (chưa xác minh) / checked (đã kiểm tra) / expired (hết hạn)
-- ---------------------------------------------------------------------------
create table if not exists public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  owner_type   text not null check (owner_type in ('product','supplier')),
  product_id   uuid references public.supplier_products(id) on delete cascade,
  supplier_id  uuid references public.suppliers(id) on delete cascade,
  kind         text not null check (kind in
                 ('image','catalogue','certificate','document','video')),
  audience     text not null default 'buyer' check (audience in ('buyer','internal')),
  status       text not null default 'unverified' check (status in
                 ('unverified','checked','expired')),
  expires_on   date,
  caption      text,
  -- tệp lưu trong Supabase Storage (hoặc thư mục data/media khi chạy local)
  storage_path text,
  thumb_path   text,
  -- video chỉ lưu link, không tải tệp lên
  external_url text,
  mime         text,
  bytes        bigint,
  width        integer,
  height       integer,
  sort_order   integer not null default 0,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint media_owner_ck check (
    (owner_type = 'product'  and product_id  is not null and supplier_id is null) or
    (owner_type = 'supplier' and supplier_id is not null and product_id  is null)
  )
);

create index if not exists media_product_idx  on public.media_assets (product_id, sort_order, created_at);
create index if not exists media_supplier_idx on public.media_assets (supplier_id, sort_order, created_at);
create index if not exists media_audience_idx on public.media_assets (audience);

-- ---------------------------------------------------------------------------
-- 5b. KHO TỆP (Supabase Storage) — chạy MỘT LẦN trong SQL Editor
--     App tự dùng bucket này khi đã cấu hình Supabase; nếu chưa có thì lưu
--     tạm vào thư mục data/media (chế độ local, không đẩy lên cloud).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vexim-media', 'vexim-media', false)
on conflict (id) do nothing;

-- App phục vụ tệp qua route /api/media/file/... bằng service role key ở server,
-- bucket để private (public = false). Nếu bạn muốn dùng URL công khai của
-- Supabase thì đổi public thành true và tự thêm policy phù hợp.

-- ---------------------------------------------------------------------------
-- 5c. NGƯỜI DÙNG & PHÂN QUYỀN (app_users)
--     - Đăng nhập: Supabase Auth khi kết nối được; khi không kết nối được thì
--       dùng mật khẩu nội bộ (cột password_hash, băm scrypt) — KHÔNG lưu mật khẩu thô.
--     - Quyền do app quyết định theo cột role: admin | sale | sourcing | viewer.
--       Tài khoản có trong Supabase Auth nhưng không có trong bảng này sẽ không
--       vào được app.
--     - Người dùng được tạo từ giao diện (Cài đặt → Người dùng) sẽ được tạo ở
--       cả Supabase Auth (nếu kết nối được) và bảng này.
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text,
  role          text not null default 'viewer' check (role in
                  ('admin','sale','sourcing','viewer')),
  auth_provider text not null default 'local' check (auth_provider in ('supabase','local')),
  -- NULL = tài khoản chỉ có bên Supabase Auth (chưa có mật khẩu dự phòng)
  password_hash text,
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Email không phân biệt hoa/thường
create unique index if not exists app_users_email_key on public.app_users (lower(email));

-- Nếu bảng đã tồn tại từ bản trước, bổ sung cột còn thiếu:
alter table public.app_users add column if not exists name text;
alter table public.app_users add column if not exists role text not null default 'viewer';
alter table public.app_users add column if not exists auth_provider text not null default 'local';
alter table public.app_users add column if not exists password_hash text;
alter table public.app_users add column if not exists is_active boolean not null default true;
alter table public.app_users add column if not exists last_login_at timestamptz;

-- ---------------------------------------------------------------------------
-- 6. TỰ ĐỘNG CẬP NHẬT updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists buyers_touch on public.buyers;
create trigger buyers_touch before update on public.buyers
  for each row execute function public.touch_updated_at();

drop trigger if exists suppliers_touch on public.suppliers;
create trigger suppliers_touch before update on public.suppliers
  for each row execute function public.touch_updated_at();

drop trigger if exists supplier_products_touch on public.supplier_products;
create trigger supplier_products_touch before update on public.supplier_products
  for each row execute function public.touch_updated_at();

drop trigger if exists media_assets_touch on public.media_assets;
create trigger media_assets_touch before update on public.media_assets
  for each row execute function public.touch_updated_at();

drop trigger if exists app_users_touch on public.app_users;
create trigger app_users_touch before update on public.app_users
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. QUYỀN (app dùng service role key ở server-side)
--    Nếu bạn bật RLS, chạy thêm phần dưới và thay policy cho phù hợp.
-- ---------------------------------------------------------------------------
-- alter table public.suppliers        enable row level security;
-- alter table public.buyers           enable row level security;
-- alter table public.buyer_activities enable row level security;
-- alter table public.email_messages   enable row level security;
--
-- create policy "service role full access" on public.buyers
--   for all to service_role using (true) with check (true);
-- (lặp lại cho suppliers, buyer_activities, email_messages)
