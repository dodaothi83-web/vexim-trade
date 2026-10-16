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
-- 2b. PROSPECTS OUTBOUND (liên hệ tiềm năng, chưa có yêu cầu sourcing thực tế)
-- ---------------------------------------------------------------------------
create table if not exists public.prospects (
  id                    uuid primary key default gen_random_uuid(),
  company               text not null,
  contact_name          text,
  contact_title         text,
  email                 text not null check (btrim(email) <> ''),
  email_status          text,
  phone                 text,
  country               text,
  city                  text,
  website               text,
  linkedin_url          text,
  company_linkedin_url  text,
  industry              text,
  employee_range        text,
  apollo_id             text,
  data_source           text not null default 'Apollo',
  source_list           text,
  target_product        text,
  ai_company_summary    text,
  ai_company_sources    jsonb not null default '[]'::jsonb,
  ai_company_analyzed_at timestamptz,
  ai_products           jsonb,
  status                text not null default 'new' check (status in
                          ('new','researched','ready','contacted','replied','meeting',
                           'qualified','converted','disqualified','unsubscribed')),
  owner                 text,
  next_action           text,
  next_action_at        timestamptz,
  notes                 text,
  converted_buyer_id    uuid references public.buyers(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists prospects_status_idx on public.prospects (status);
create index if not exists prospects_email_idx on public.prospects (lower(email));
alter table public.prospects
  add column if not exists data_source text not null default 'Apollo',
  add column if not exists target_product text,
  add column if not exists ai_company_summary text,
  add column if not exists ai_company_sources jsonb not null default '[]'::jsonb,
  add column if not exists ai_company_analyzed_at timestamptz;

alter table public.prospects
  add column if not exists ai_products jsonb;
update public.prospects
set target_product = 'Mì ăn liền'
where target_product is null and source_list is not null
  and (source_list ilike '%mì ăn liền%' or source_list ilike '%mỳ ăn liền%');
create index if not exists prospects_company_idx on public.prospects (lower(company));
create index if not exists prospects_owner_idx on public.prospects (owner);
create index if not exists prospects_target_product_idx on public.prospects (target_product);

create table if not exists public.prospect_activities (
  id          uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  channel     text not null check (channel in ('email','linkedin','phone','meeting','note')),
  summary     text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists prospect_activities_prospect_idx
  on public.prospect_activities (prospect_id, created_at desc);

-- Cold-outreach templates are editable and remain separate from Buyer stage templates.
create table if not exists public.prospect_outreach_templates (
  id text primary key check (id in ('intro', 'followup')),
  label text not null,
  subject text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

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
  prospect_id  uuid references public.prospects(id) on delete set null,
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

-- Thư ĐẾN qua Resend Inbound (webhook email.received): mở rộng kind/status + 2 cột mới.
-- Chạy lại đoạn này (idempotent) khi nâng cấp từ bản trước:
alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check
  check (kind in ('auto','manual','inbound','rfq_outreach','rfq_followup','shortlist_buyer','buyer_status_update'));
alter table public.email_messages drop constraint if exists email_messages_status_check;
alter table public.email_messages add constraint email_messages_status_check
  check (status in ('draft','sent','failed','simulated','received'));
alter table public.email_messages add column if not exists rfc_message_id text;
alter table public.email_messages add column if not exists read_at timestamptz;
alter table public.email_messages
  add column if not exists prospect_id uuid references public.prospects(id) on delete set null;
create index if not exists email_messages_prospect_idx
  on public.email_messages (prospect_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4b. TỆP ĐÍNH KÈM EMAIL (metadata) — nội dung nằm trong Supabase Storage
--     - KHÔNG lưu base64 / binary trong cơ sở dữ liệu, chỉ lưu metadata.
--     - bucket: 'email-attachments' (private, xem mục 5b)
--     - status: pending  = vừa tải lên, chưa gắn vào email nào
--               uploaded = đã gắn vào email đang soạn
--               attached = email đã gửi thành công
--               failed   = gửi hỏng, giữ lại để gửi lại an toàn
--               deleted  = đã xoá (đã xoá cả tệp trong Storage)
--     - Tệp có message_id = null và cũ hơn 24h được coi là mồ côi và sẽ bị dọn.
-- ---------------------------------------------------------------------------
create table if not exists public.email_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid references public.email_messages(id) on delete cascade,
  bucket       text not null default 'email-attachments',
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null default 'application/octet-stream',
  size_bytes   bigint not null default 0,
  status       text not null default 'pending'
                 check (status in ('pending','uploaded','attached','failed','deleted')),
  last_error   text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Mỗi tệp trong Storage chỉ có một dòng metadata
create unique index if not exists email_attachments_path_key
  on public.email_attachments (bucket, storage_path);
create index if not exists email_attachments_message_idx
  on public.email_attachments (message_id, created_at);
create index if not exists email_attachments_orphan_idx
  on public.email_attachments (created_at) where message_id is null;

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

-- Tệp đính kèm email: bucket RIÊNG, không public. Chỉ server (service_role) ghi/đọc,
-- người dùng tải qua URL có chữ ký hết hạn (signed URL), không có URL công khai.
insert into storage.buckets (id, name, public, file_size_limit)
values ('email-attachments', 'email-attachments', false, 4194304)
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
-- Chữ ký email cá nhân (HTML) của từng người dùng; null = dùng chữ ký tự động.
alter table public.app_users add column if not exists signature_html text;
-- Số điện thoại cá nhân trong chữ ký email (chạy một lần)
alter table public.app_users add column if not exists phone text;

-- Địa chỉ gửi riêng theo tên người (deliverability — bản chạy lẻ: 20261012_user_sender_email.sql)
-- NULL = app tự sinh từ họ tên: "Nguyễn Văn Dung" -> dung@veximtrade.com,
-- trùng tên thì dung2@, dung3@ (lib/email/sender.ts). Đặt giá trị khác NULL = giữ
-- đúng địa chỉ đó, app không tự đổi. Không cần tạo mailbox ở Resend: domain đã
-- verify thì mọi local-part của domain đều gửi được.
alter table public.app_users add column if not exists sender_email text;
create unique index if not exists app_users_sender_email_key
  on public.app_users (lower(sender_email))
  where sender_email is not null;

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

drop trigger if exists email_attachments_touch on public.email_attachments;
create trigger email_attachments_touch before update on public.email_attachments
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

-- ---------------------------------------------------------------------------
-- 7b. RLS CHỐNG TRUY CẬP CHÉO (tuỳ chọn nhưng NÊN chạy)
--     App chạy server-side bằng service_role key (bỏ qua RLS). Phần này khoá đường
--     truy cập trực tiếp từ trình duyệt bằng anon/publishable key: không ai đọc/xoá
--     được tệp hay bản ghi của người khác.
--     LƯU Ý: khoá service_role chỉ nằm ở server, KHÔNG bao giờ lộ ra trình duyệt.
-- ---------------------------------------------------------------------------
alter table public.email_attachments enable row level security;

-- Chỉ service_role được thao tác (server app). Không cấp policy cho anon/authenticated
-- nghĩa là mọi truy cập trực tiếp từ client đều bị từ chối.
drop policy if exists "email_attachments service only" on public.email_attachments;
create policy "email_attachments service only" on public.email_attachments
  for all to service_role using (true) with check (true);

-- Nếu bảng đã bật "own-only" policy từ trước, gỡ các policy cho phép authenticated:
-- drop policy if exists "email_attachments own" on public.email_attachments;

-- Tệp trong Storage: cùng nguyên tắc — chỉ service_role.
alter table storage.objects enable row level security;

drop policy if exists "email attachments service only" on storage.objects;
create policy "email attachments service only" on storage.objects
  for all to service_role
  using (bucket_id = 'email-attachments')
  with check (bucket_id = 'email-attachments');

-- (không tạo policy cho anon/authenticated trên bucket này = không truy cập chéo được)

-- ---------------------------------------------------------------------------
-- 9) GHI ĐÈ NỘI DUNG EMAIL THEO GIAI ĐOẠN (trang Templates)
--    Mỗi cặp (stage, dir) tối đa một bản ghi; thiếu bảng => hệ thống dùng
--    nội dung mặc định trong lib/email/stage-content.ts, không chặn gửi thư.
-- ---------------------------------------------------------------------------
create table if not exists public.email_template_overrides (
  stage       text not null,
  dir         text not null check (dir in ('buyer','supplier')),
  subject     text not null,
  body        text not null,
  action      text,
  tasks       text,
  deadline    text,
  updated_at  timestamptz not null default now(),
  primary key (stage, dir)
);
-- alter table public.email_template_overrides enable row level security;

-- ============================================================================
-- RFQ FOUNDATION (GĐ 0)
-- Categories, supplier mở rộng, certificates, verifications, rfqs, rfq_matches,
-- rfq_attachments, introductions, audit_log, views whitelist, cashew seed.
-- Xem supabase/migrations/20261016_rfq_foundation.sql để biết lịch sử thay đổi.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SUPPLIERS – mở rộng
-- ---------------------------------------------------------------------------
alter table public.suppliers
  add column if not exists slug text,
  add column if not exists display_name text,
  add column if not exists supplier_type text check (supplier_type in
    ('manufacturer','trading','cooperative')),
  add column if not exists founded_year integer,
  add column if not exists employees integer,
  add column if not exists summary_i18n jsonb not null default '{}'::jsonb,
  add column if not exists moq_text text,
  add column if not exists capacity_per_month text,
  add column if not exists ports text[] not null default '{}',
  add column if not exists incoterms text[] not null default '{}',
  add column if not exists export_markets text[] not null default '{}',
  add column if not exists private_label boolean not null default false,
  add column if not exists verification_level smallint not null default 0
    check (verification_level between 0 and 3),
  add column if not exists verified_at timestamptz,
  add column if not exists next_reverify_at timestamptz,
  add column if not exists rating_avg numeric(3,2),
  add column if not exists rating_count integer not null default 0,
  add column if not exists fob_min numeric(14,2),
  add column if not exists fob_max numeric(14,2),
  add column if not exists fob_unit text,
  add column if not exists fob_currency text default 'USD',
  add column if not exists fob_updated_at timestamptz,
  add column if not exists fob_publicly_visible boolean not null default false;
-- Public supplier images and preview-only demo flag.
alter table public.suppliers
  add column if not exists profile_image text,
  add column if not exists cover_image text,
  add column if not exists is_demo boolean not null default false;

alter table public.suppliers drop constraint if exists suppliers_status_check;
alter table public.suppliers add constraint suppliers_status_check
  check (status in
    ('new','verifying','verified','paused',
     'draft','submitted','in_verification','published','suspended','archived'));

create unique index if not exists suppliers_slug_key on public.suppliers (slug) where slug is not null;
create index if not exists suppliers_status_idx on public.suppliers (status);
create index if not exists suppliers_verification_level_idx on public.suppliers (verification_level desc);

-- ---------------------------------------------------------------------------
-- 1b. SUPPLIER_PRODUCTS – mở rộng
-- ---------------------------------------------------------------------------
alter table public.supplier_products
  add column if not exists slug text,
  add column if not exists name_i18n jsonb not null default '{}'::jsonb,
  add column if not exists specs jsonb not null default '{}'::jsonb,
  add column if not exists images uuid[] not null default '{}',
  add column if not exists moq_qty numeric(14,2),
  add column if not exists moq_unit text;

create unique index if not exists supplier_products_slug_key
  on public.supplier_products (slug) where slug is not null;

-- ---------------------------------------------------------------------------
-- 2. CATEGORIES
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  parent_id   uuid references public.categories(id) on delete cascade,
  name_i18n   jsonb not null default '{}'::jsonb,
  intro_i18n  jsonb not null default '{}'::jsonb,
  faq_i18n    jsonb not null default '[]'::jsonb,
  seo_title_i18n jsonb not null default '{}'::jsonb,
  seo_desc_i18n  jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- CMS fields added after the RFQ foundation. public_page_ready is derived on
-- read from approved suppliers, never written to the categories table.
alter table public.categories
  add column if not exists h1_i18n jsonb,
  add column if not exists body_i18n jsonb,
  add column if not exists spec_columns jsonb not null default '[]'::jsonb,
  add column if not exists spec_rows jsonb not null default '[]'::jsonb,
  add column if not exists buying_facts jsonb not null default '[]'::jsonb,
  add column if not exists filters jsonb not null default '[]'::jsonb,
  add column if not exists hero_image text,
  add column if not exists hero_alt_i18n jsonb,
  add column if not exists homepage_kicker_i18n jsonb,
  add column if not exists active_on_homepage boolean not null default false,
  add column if not exists status text,
  add column if not exists seo_indexable boolean not null default false,
  add column if not exists previous_slugs text[] not null default '{}',
  add column if not exists created_by text,
  add column if not exists updated_by text;
update public.categories
set status = case when is_published then 'published' else 'draft' end
where status is null;
alter table public.categories alter column status set default 'draft';
alter table public.categories alter column status set not null;

create unique index if not exists categories_slug_key on public.categories (slug);
create index if not exists categories_parent_idx on public.categories (parent_id) where parent_id is not null;

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2b. SUPPLIER_CATEGORIES (N-N)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_categories (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (supplier_id, category_id)
);
create index if not exists supplier_categories_category_idx
  on public.supplier_categories (category_id);

-- ---------------------------------------------------------------------------
-- 3. CERTIFICATES
-- ---------------------------------------------------------------------------
create table if not exists public.certificates (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references public.suppliers(id) on delete cascade,
  name         text not null,
  issuer       text,
  number       text,
  valid_until  date,
  file_media_id uuid references public.media_assets(id) on delete set null,
  check_status text not null default 'on_file' check (check_status in
                 ('on_file','original_seen','checked_with_issuer')),
  checked_at   timestamptz,
  checked_by   text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists certificates_supplier_idx on public.certificates (supplier_id);

drop trigger if exists certificates_touch on public.certificates;
create trigger certificates_touch before update on public.certificates
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. VERIFICATIONS
-- ---------------------------------------------------------------------------
create table if not exists public.verifications (
  id                 uuid primary key default gen_random_uuid(),
  supplier_id        uuid not null references public.suppliers(id) on delete cascade,
  target_level       smallint not null check (target_level between 1 and 3),
  status             text not null default 'scheduled' check (status in
                       ('scheduled','in_progress','submitted','approved','returned')),
  inspector_id       uuid references public.app_users(id) on delete set null,
  visit_date         date,
  checklist          jsonb not null default '[]'::jsonb,
  public_summary_i18n jsonb not null default '{}'::jsonb,
  internal_notes     text,
  approved_by        uuid references public.app_users(id) on delete set null,
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint verifications_four_eyes check (
    approved_by is null or inspector_id is null or approved_by <> inspector_id
  )
);
create index if not exists verifications_supplier_idx on public.verifications (supplier_id, created_at desc);

drop trigger if exists verifications_touch on public.verifications;
create trigger verifications_touch before update on public.verifications
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. BUYERS – bổ sung cột
-- ---------------------------------------------------------------------------
alter table public.buyers
  add column if not exists email_domain text,
  add column if not exists business_type text,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_policy_version text,
  add column if not exists is_blocked boolean not null default false;

create index if not exists buyers_email_domain_idx on public.buyers (lower(email_domain));
create index if not exists buyers_email_lower_idx on public.buyers (lower(email));

-- ---------------------------------------------------------------------------
-- 6. RFQs
-- ---------------------------------------------------------------------------
create table if not exists public.rfqs (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null,
  buyer_id              uuid not null references public.buyers(id) on delete cascade,
  category_id           uuid references public.categories(id) on delete set null,
  product_text          text not null,
  specs                 jsonb not null default '{}'::jsonb,
  quantity              numeric(14,2),
  unit                  text,
  frequency             text,
  destination_country   text,
  incoterm              text,
  needed_by             date,
  target_price          numeric(14,2),
  target_price_currency text default 'USD',
  wants_samples         boolean not null default false,
  wants_inspection      boolean not null default false,
  wants_video_call      boolean not null default false,
  preferred_supplier_ids uuid[] not null default '{}',
  source_page           text,
  utm                   jsonb not null default '{}'::jsonb,
  referrer              text,
  spam_score            integer not null default 0,
  spam_flags            text[] not null default '{}',
  status                text not null default 'new' check (status in
                          ('new','needs_review','in_progress','matching','quoted',
                           'sampling','won','lost','spam')),
  assigned_to           uuid references public.app_users(id) on delete set null,
  first_response_at     timestamptz,
  closed_reason         text,
  lost_reason           text,
  access_token          text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- Upgrade older installations (the original RFQ status check used legacy values).
alter table public.rfqs add column if not exists lost_reason text;
alter table public.rfqs drop constraint if exists rfqs_status_check;
update public.rfqs set status = case status
  when 'qualified' then 'in_progress'
  when 'quoting' then 'matching'
  when 'closed' then 'lost'
  else status end
where status in ('qualified','quoting','closed');
update public.rfqs set lost_reason = 'legacy_unspecified'
where status = 'lost' and nullif(trim(lost_reason), '') is null;
alter table public.rfqs add constraint rfqs_status_check check (status in
  ('new','needs_review','in_progress','matching','quoted','sampling','won','lost','spam'));
alter table public.rfqs drop constraint if exists rfqs_lost_reason_check;
alter table public.rfqs add constraint rfqs_lost_reason_check check (
  status <> 'lost' or nullif(trim(lost_reason), '') is not null);

create unique index if not exists rfqs_code_key on public.rfqs (code);
create unique index if not exists rfqs_access_token_key on public.rfqs (access_token);
create index if not exists rfqs_status_idx on public.rfqs (status, created_at desc);
create index if not exists rfqs_assigned_idx on public.rfqs (assigned_to, created_at desc);
create index if not exists rfqs_buyer_idx on public.rfqs (buyer_id, created_at desc);
create index if not exists rfqs_created_idx on public.rfqs (created_at desc);

drop trigger if exists rfqs_touch on public.rfqs;
create trigger rfqs_touch before update on public.rfqs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6b. RFQ_ATTACHMENTS
-- ---------------------------------------------------------------------------
create table if not exists public.rfq_attachments (
  id           uuid primary key default gen_random_uuid(),
  rfq_id       uuid not null references public.rfqs(id) on delete cascade,
  bucket       text not null default 'rfq-attachments',
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null default 'application/octet-stream',
  size_bytes   bigint not null default 0,
  uploaded_by  text,
  created_at   timestamptz not null default now()
);
create unique index if not exists rfq_attachments_path_key
  on public.rfq_attachments (bucket, storage_path);
create index if not exists rfq_attachments_rfq_idx on public.rfq_attachments (rfq_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('rfq-attachments', 'rfq-attachments', false, 10 * 1024 * 1024)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6c. RFQ_MATCHES
-- ---------------------------------------------------------------------------
create table if not exists public.rfq_matches (
  id                 uuid primary key default gen_random_uuid(),
  rfq_id             uuid not null references public.rfqs(id) on delete cascade,
  supplier_id        uuid not null references public.suppliers(id) on delete cascade,
  status             text not null default 'proposed' check (status in
                       ('proposed','sent_to_supplier','quoted','declined',
                        'no_response','presented_to_buyer','selected','not_selected')),
  sent_to_supplier_at timestamptz,
  quote_price        numeric(14,2),
  quote_currency     text default 'USD',
  quote_unit         text,
  quote_incoterm     text,
  quote_lead_time_days integer,
  quote_valid_until  date,
  quote_file_id      uuid references public.rfq_attachments(id) on delete set null,
  sent_to_buyer_at   timestamptz,
  internal_note      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (rfq_id, supplier_id)
);
create index if not exists rfq_matches_rfq_idx on public.rfq_matches (rfq_id, status);
create index if not exists rfq_matches_supplier_idx on public.rfq_matches (supplier_id, created_at desc);

-- RFQ timeline linking (một email có thể gắn với 1 RFQ và 1 RfqMatch cụ thể)
alter table public.email_messages add column if not exists rfq_id uuid references public.rfqs(id) on delete set null;
alter table public.email_messages add column if not exists rfq_match_id uuid references public.rfq_matches(id) on delete set null;
create index if not exists email_messages_rfq_idx
  on public.email_messages (rfq_id, created_at desc);
-- A single buyer status email per RFQ + stage (atomic claim before sending).
create unique index if not exists email_messages_buyer_status_once_idx
  on public.email_messages (rfq_id, stage) where kind = 'buyer_status_update';

drop trigger if exists rfq_matches_touch on public.rfq_matches;
create trigger rfq_matches_touch before update on public.rfq_matches
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. INTRODUCTIONS
-- ---------------------------------------------------------------------------
create table if not exists public.introductions (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid not null references public.buyers(id) on delete cascade,
  supplier_id     uuid not null references public.suppliers(id) on delete cascade,
  first_rfq_id    uuid not null references public.rfqs(id) on delete cascade,
  introduced_at   timestamptz not null default now(),
  protected_until timestamptz not null,
  created_at      timestamptz not null default now()
);
create unique index if not exists introductions_buyer_supplier_key
  on public.introductions (buyer_id, supplier_id);
create index if not exists introductions_protected_until_idx
  on public.introductions (protected_until);

-- ---------------------------------------------------------------------------
-- 8. AUDIT_LOG
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigserial primary key,
  actor_id   uuid references public.app_users(id) on delete set null,
  actor_email text,
  entity     text not null,
  entity_id  text not null,
  action     text not null,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. PUBLIC WHITELIST VIEWS
-- ---------------------------------------------------------------------------
create or replace view public.v_public_suppliers as
select
  s.id,
  s.slug,
  coalesce(s.display_name, s.trade_name, s.name)        as display_name,
  s.supplier_type                                       as supplier_type,
  s.province,
  s.country,
  s.founded_year,
  s.employees,
  s.summary_i18n,
  s.moq_text,
  s.capacity_per_month,
  s.ports,
  s.incoterms,
  s.export_markets,
  s.private_label,
  s.verification_level,
  s.verified_at,
  s.next_reverify_at,
  case when s.rating_count >= 3 then s.rating_avg end   as rating_avg,
  case when s.rating_count >= 3 then s.rating_count end as rating_count,
  case when s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at > now() - interval '180 days' then s.fob_min end as fob_min,
  case when s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at > now() - interval '180 days' then s.fob_max end as fob_max,
  case when s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at > now() - interval '180 days' then s.fob_unit end as fob_unit,
  case when s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at > now() - interval '180 days' then s.fob_currency end as fob_currency,
  s.fob_updated_at,
  s.lead_time_days,
  s.updated_at
from public.suppliers s
where s.status = 'published';

create or replace view public.v_public_supplier_products as
select
  sp.id,
  sp.supplier_id,
  sp.slug,
  sp.name_i18n,
  coalesce(sp.name_i18n->>'en', sp.name)                as name,
  sp.specs,
  sp.description,
  sp.packaging,
  sp.moq_qty,
  sp.moq_unit,
  sp.moq                                                as moq_text,
  sp.monthly_capacity,
  sp.lead_time_days,
  sp.samples,
  sp.images,
  sp.export_port,
  sp.incoterm,
  sp.incoterm_place,
  case when s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at > now() - interval '180 days' then sp.ref_price end as ref_price,
  case when s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at > now() - interval '180 days' then sp.currency end as currency,
  sp.updated_at
from public.supplier_products sp
join public.suppliers s on s.id = sp.supplier_id
where s.status = 'published';

-- ---------------------------------------------------------------------------
-- 10. SEED – Cashew category
-- ---------------------------------------------------------------------------
insert into public.categories (slug, parent_id, name_i18n, intro_i18n, faq_i18n, seo_title_i18n, seo_desc_i18n, is_published, sort_order)
values (
  'cashew', null,
  '{"en": "Cashew"}'::jsonb,
  '{"en": "Verified Vietnamese cashew kernel suppliers, graded WW320, WW240, W180, LP, SP. Factory-audited by Vexim Trade."}'::jsonb,
  '[]'::jsonb,
  '{"en": "Cashew Suppliers in Vietnam – Verified Manufacturers | Vexim Trade"}'::jsonb,
  '{"en": "Compare verified Vietnamese cashew kernel suppliers by grade, MOQ, certification and lead time. Send a shortlist RFQ and receive quotes within 5 working days."}'::jsonb,
  true, 10
)
on conflict (slug) do update set
  name_i18n = excluded.name_i18n,
  intro_i18n = excluded.intro_i18n,
  seo_title_i18n = excluded.seo_title_i18n,
  seo_desc_i18n = excluded.seo_desc_i18n,
  is_published = excluded.is_published,
  sort_order = excluded.sort_order;
