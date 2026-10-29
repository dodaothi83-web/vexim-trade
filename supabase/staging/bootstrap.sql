-- STAGING ONLY: new empty synthetic project, NEVER production.
-- Built from consolidated schema and migrations, no production data.
-- Guard plus all schema changes share one transaction.
do $vexim_staging_guard$
begin
  if exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')) then
    raise exception 'Staging bootstrap requires an empty public schema';
  end if;
  if not exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity)
    or exists (select 1 from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'objects') then
    raise exception 'Staging storage must have RLS enabled and no object policies';
  end if;
  execute $vexim_staging_sql$
-- BEGIN supabase/schema.sql
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

alter table public.suppliers add column if not exists requested_category_slugs text[] not null default '{}';
alter table public.suppliers add column if not exists requested_category_other text;
alter table public.suppliers add column if not exists categories_reviewed_at timestamptz;
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
alter table public.supplier_products add column if not exists supplier_category_proposal text;
alter table public.supplier_products add column if not exists reviewed_category_slug text;
alter table public.supplier_products add column if not exists supplier_originated boolean not null default false;
alter table public.supplier_products add column if not exists featured_media_id uuid;
alter table public.supplier_products add column if not exists description_detail text;
alter table public.supplier_products add column if not exists name_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists description_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists description_detail_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists spec_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists packaging_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists certifications_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists translation_meta jsonb;
alter table public.supplier_products add column if not exists price_publicly_visible boolean not null default false;
alter table public.supplier_products add column if not exists odm boolean not null default false;
alter table public.supplier_products add column if not exists raw_material_region text;
alter table public.supplier_products add column if not exists input_material_origin text;
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
  checklist_key text,
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

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_products_featured_media_fk'
      and conrelid = 'public.supplier_products'::regclass) then
    alter table public.supplier_products add constraint supplier_products_featured_media_fk
      foreign key (featured_media_id) references public.media_assets(id) on delete set null;
  end if;
end $$;
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
--     - Quyền do app quyết định theo cột role: admin | sale | sourcing | reviewer | viewer | supplier.
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
                  ('admin','sale','sourcing','reviewer','viewer','supplier')),
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
alter table public.app_users add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create unique index if not exists app_users_supplier_id_key
  on public.app_users (supplier_id) where supplier_id is not null;
-- On existing databases, run 20261017_supplier_self_registration.sql to replace the old role CHECK.
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
-- Hosted storage.objects is left unchanged; staging guard verifies RLS and zero policies.

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
  add column if not exists intro_source text,
  add column if not exists moq_text text,
  add column if not exists moq_text_i18n jsonb not null default '{}'::jsonb,
  add column if not exists export_markets_i18n jsonb not null default '{}'::jsonb,
  add column if not exists profile_translation_meta jsonb,
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
  add column if not exists product_fields jsonb not null default '[]'::jsonb,
  add column if not exists spec_rows jsonb not null default '[]'::jsonb,
  add column if not exists buying_facts jsonb not null default '[]'::jsonb,
  add column if not exists filters jsonb not null default '[]'::jsonb,
  add column if not exists harvest jsonb,
  add column if not exists price_unit text,
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
alter table public.certificates
  add column if not exists holder_name text,
  add column if not exists scope_text text,
  add column if not exists requested_product_ids uuid[] not null default '{}',
  add column if not exists approved_product_ids uuid[] not null default '{}',
  add column if not exists review_status text not null default 'unreviewed',
  add column if not exists review_note text,
  add column if not exists publicly_visible boolean not null default false;
alter table public.certificates drop constraint if exists certificates_review_status_check;
alter table public.certificates add constraint certificates_review_status_check
  check (review_status in ('unreviewed', 'pending', 'changes_requested', 'approved', 'rejected'));
-- 21/10/2026: chứng nhận hợp nhất vào L1 — AI quét tệp (đơn vị đứng tên + ngày hết hạn),
-- tự công bố kèm nhãn chính chủ/đối tác; staff_hidden là phanh ẩn của nhân viên;
-- expiry_notified lưu mốc cron nhắc hết hạn 60/30/7/1 ngày (idempotent).
-- Chi tiết: supabase/migrations/20261021_l1_certificate_ai_scan.sql
alter table public.certificates
  add column if not exists holder_match text,
  add column if not exists ai_scanned_at timestamptz,
  add column if not exists ai_summary text,
  add column if not exists ai_confidence text,
  add column if not exists source text not null default 'manual',
  add column if not exists checklist_key text,
  add column if not exists verification_id uuid,
  add column if not exists staff_hidden boolean not null default false,
  add column if not exists expiry_notified jsonb not null default '{}'::jsonb;
alter table public.certificates drop constraint if exists certificates_holder_match_check;
alter table public.certificates add constraint certificates_holder_match_check
  check (holder_match is null or holder_match in ('owner','partner','unclear'));
alter table public.certificates drop constraint if exists certificates_ai_confidence_check;
alter table public.certificates add constraint certificates_ai_confidence_check
  check (ai_confidence is null or ai_confidence in ('low','medium','high'));
alter table public.certificates drop constraint if exists certificates_source_check;
alter table public.certificates add constraint certificates_source_check
  check (source in ('manual','l1-supplier','l1-staff'));
create index if not exists certificates_valid_until_idx on public.certificates (valid_until);
alter table public.certificates enable row level security;
revoke all on public.certificates from anon, authenticated;
alter table public.media_assets enable row level security;
revoke all on public.media_assets from anon, authenticated;

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
  checklist          jsonb not null default '{}'::jsonb,
  checklist_notes    jsonb not null default '{}'::jsonb,
  tax_number         text,
  bank_account_number text,
  visit_lat          double precision,
  visit_lng          double precision,
  visit_address      text,
  return_reason      text,
  public_summary_i18n jsonb not null default '{}'::jsonb,
  internal_notes     text,
  approved_by        uuid references public.app_users(id) on delete set null,
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  legacy_self_approved boolean not null default false,
  self_approved      boolean not null default false,
  updated_at         timestamptz not null default now(),
  constraint verifications_four_eyes check (
    approved_by is null
    or (inspector_id is not null and (
      inspector_id <> approved_by or legacy_self_approved or self_approved
    ))
    or (inspector_id is null and self_approved)
  )
);
alter table public.verifications
  add column if not exists checklist_notes jsonb not null default '{}'::jsonb,
  add column if not exists tax_number text,
  add column if not exists bank_account_number text,
  add column if not exists visit_lat double precision,
  add column if not exists visit_lng double precision,
  add column if not exists visit_address text,
  add column if not exists return_reason text,
  add column if not exists legacy_self_approved boolean not null default false,
  add column if not exists self_approved boolean not null default false;
alter table public.verifications drop constraint if exists verifications_four_eyes;
alter table public.verifications add constraint verifications_four_eyes
  check (
    approved_by is null
    or (inspector_id is not null and (
      inspector_id <> approved_by or legacy_self_approved or self_approved
    ))
    or (inspector_id is null and self_approved)
  ) not valid;
alter table public.verifications alter column checklist set default '{}'::jsonb;
update public.verifications set checklist = '{}'::jsonb where checklist = '[]'::jsonb;
alter table public.verifications
  add column if not exists l2_scope text,
  add column if not exists shipment_ref text,
  add column if not exists shipped_on date,
  add column if not exists shipment_destination text;

-- Active admin/sourcing staff may complete their own inspection because both
-- roles hold inspect + approve. Supplier-uploaded reviews keep the no-inspector path.
create or replace function public.check_verification_self_approval()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.approved_by is not null
     and new.inspector_id = new.approved_by
     and not new.legacy_self_approved
     and not exists (
       select 1 from public.app_users u
       where u.id = new.approved_by
         and u.role in ('admin', 'sourcing')
         and u.is_active
     ) then
    raise exception 'Only active staff with inspect and approve permissions can complete their own verification';
  end if;
  return new;
end;
$$;

drop trigger if exists verifications_self_approval_guard on public.verifications;
create trigger verifications_self_approval_guard
  before insert or update of status, inspector_id, approved_by, self_approved, legacy_self_approved
  on public.verifications
  for each row execute function public.check_verification_self_approval();
revoke all on function public.check_verification_self_approval() from public, anon, authenticated;

comment on column public.verifications.self_approved is
  'Explicit single-person decision: supplier-uploaded review with no inspector, or authorized admin/sourcing staff completing their own inspection after an evidence re-check. AI never approves. Always audit logged.';

-- Media for a specific inspection (internal documents/photos); add FK after
-- verifications exists, since media_assets is declared earlier in this file.
alter table public.media_assets add column if not exists verification_id uuid;
alter table public.media_assets add column if not exists checklist_key text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'media_assets_verification_id_fkey'
    and conrelid = 'public.media_assets'::regclass) then
    alter table public.media_assets add constraint media_assets_verification_id_fkey
      foreign key (verification_id) references public.verifications(id) on delete cascade;
  end if;
end $$;
alter table public.media_assets add column if not exists submission_id uuid;
alter table public.media_assets drop constraint if exists media_assets_owner_type_check;
alter table public.media_assets add constraint media_assets_owner_type_check
  check (owner_type in ('product','supplier','verification','submission'));
alter table public.media_assets drop constraint if exists media_owner_ck;
alter table public.media_assets add constraint media_owner_ck check (
  (owner_type = 'product' and product_id is not null and verification_id is null and submission_id is null) or
  (owner_type = 'supplier' and supplier_id is not null and product_id is null and verification_id is null and submission_id is null) or
  (owner_type = 'verification' and verification_id is not null and supplier_id is not null
    and product_id is null and submission_id is null and audience = 'internal') or
  (owner_type = 'submission' and submission_id is not null and supplier_id is not null
    and product_id is null and verification_id is null and audience = 'internal')
);
create index if not exists media_verification_idx
  on public.media_assets (verification_id, created_at desc)
  where verification_id is not null;
alter table public.media_assets drop constraint if exists media_checklist_key_ck;
alter table public.media_assets add constraint media_checklist_key_ck check (
  checklist_key is null or
  (owner_type in ('verification', 'submission') and checklist_key in (
    'business_license', 'tax_certificate', 'bank_letter', 'food_safety',
    'haccp_or_brc', 'product_certs', 'export_license',
    'factory_address_confirmed', 'production_line_seen', 'warehouse_seen',
    'qc_lab_seen', 'documents_original', 'capacity_verified',
    'worker_interview', 'management_interview', 'photos_taken',
    'order_matched', 'shipping_proof', 'delivery_proof',
    -- 9 ảnh nhà máy + các loại chứng từ xuất khẩu của cổng NCC tự gửi
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe',
    'pest_control', 'partner_factory_contract', 'partner_factory_photos',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'
  ))
);
create index if not exists media_verification_checklist_idx
  on public.media_assets (verification_id, checklist_key)
  where owner_type = 'verification' and checklist_key is not null;
create index if not exists verifications_supplier_idx on public.verifications (supplier_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4b. CỔNG NCC TỰ GỬI BẰNG CHỨNG L2 (nhà máy) / L3 (lịch sử xuất khẩu)
--     Hồ sơ tự gửi KHÔNG phải kết quả xác minh: huy hiệu vẫn chỉ đến từ một
--     đợt kiểm verifications do nhân sự Vexim có quyền kiểm và duyệt xác nhận.
--     (Bản đầy đủ: migrations/20261020_supplier_self_verification_submissions.sql)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_submissions (
  id                  uuid primary key default gen_random_uuid(),
  supplier_id         uuid not null references public.suppliers(id) on delete cascade,
  target_level        smallint not null check (target_level in (2,3)),
  l2_scope            text,
  status              text not null default 'draft'
                        check (status in ('draft','pending_review','returned','accepted')),
  created_by          uuid references public.app_users(id) on delete set null,
  verification_code   text check (verification_code is null or (
                        char_length(verification_code) between 8 and 24 and
                        verification_code ~ '^[A-Z0-9-]+$')),
  code_issued_at      timestamptz,
  device_lat          double precision,
  device_lng          double precision,
  device_accuracy_m   double precision,
  device_captured_at  timestamptz,
  shipment_ref        text,
  shipped_on          date,
  shipment_destination text,
  supplier_note       text check (supplier_note is null or char_length(supplier_note) <= 2000),
  flags               jsonb not null default '[]'::jsonb,
  ai_review           jsonb,
  ai_scanned_at       timestamptz,
  submitted_at        timestamptz,
  reviewed_by         uuid references public.app_users(id) on delete set null,
  reviewed_at         timestamptz,
  review_note         text,
  verification_id     uuid references public.verifications(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.supplier_submissions add column if not exists l2_scope text;
create index if not exists supplier_submissions_supplier_idx
  on public.supplier_submissions (supplier_id, target_level, updated_at desc);
create index if not exists supplier_submissions_queue_idx
  on public.supplier_submissions (status, submitted_at desc);
drop index if exists public.supplier_submissions_one_open_per_level;
create unique index if not exists supplier_submissions_one_open_per_scope
  on public.supplier_submissions (supplier_id, target_level, coalesce(l2_scope, 'factory'))
  where status <> 'accepted';
alter table public.supplier_submissions enable row level security;
revoke all on public.supplier_submissions from anon, authenticated;

create table if not exists public.supplier_submission_items (
  id                 uuid primary key default gen_random_uuid(),
  submission_id      uuid not null references public.supplier_submissions(id) on delete cascade,
  supplier_id        uuid not null references public.suppliers(id) on delete cascade,
  checklist_key      text not null,
  media_id           uuid references public.media_assets(id) on delete set null,
  storage_path       text,
  thumb_path         text,
  exif_lat           double precision,
  exif_lng           double precision,
  exif_captured_at   timestamptz,
  exif_camera_make   text,
  exif_camera_model  text,
  exif_software      text,
  has_exif           boolean not null default false,
  mime               text,
  bytes              integer,
  width              integer,
  height             integer,
  capture_lat        double precision,
  capture_lng        double precision,
  capture_accuracy_m double precision,
  captured_at        timestamptz,
  flags              jsonb not null default '[]'::jsonb,
  ai_verdict         text check (ai_verdict is null or ai_verdict in ('pass','fail','uncertain')),
  ai_reason          text,
  ai_detected_text   text,
  ai_code_visible    boolean,
  ai_code_read       text,
  uploaded_at        timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'media_assets_submission_id_fkey'
    and conrelid = 'public.media_assets'::regclass) then
    alter table public.media_assets add constraint media_assets_submission_id_fkey
      foreign key (submission_id) references public.supplier_submissions(id) on delete cascade;
  end if;
end $$;
create index if not exists media_submission_idx on public.media_assets (submission_id, sort_order, created_at)
  where submission_id is not null;

create index if not exists supplier_submission_items_submission_idx
  on public.supplier_submission_items (submission_id, uploaded_at);
create index if not exists supplier_submission_items_supplier_idx
  on public.supplier_submission_items (supplier_id, checklist_key);
alter table public.supplier_submission_items drop constraint if exists supplier_submission_items_key_ck;
alter table public.supplier_submission_items add constraint supplier_submission_items_key_ck check (
  checklist_key in (
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe',
    'pest_control', 'partner_factory_contract', 'partner_factory_photos',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'
  )
);
alter table public.supplier_submission_items enable row level security;
revoke all on public.supplier_submission_items from anon, authenticated;

-- Serialize L3 file mutations with submission and keep the pending queue meaningful.
-- The shared parent-row lock prevents a delete/upload racing a manual submission.
create or replace function public.guard_l3_submission_item_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  parent_id uuid;
  parent_level smallint;
  parent_status text;
begin
  if tg_op = 'INSERT' then parent_id := new.submission_id;
  else parent_id := old.submission_id;
  end if;

  select target_level, status into parent_level, parent_status
    from public.supplier_submissions where id = parent_id for update;
  -- A parent already deleted by a cascade need not be locked or checked.
  if not found or parent_level <> 3 then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if parent_status not in ('draft', 'returned') then
    raise exception using errcode = 'P0001', message = 'L3_SUBMISSION_LOCKED';
  end if;
  if tg_op = 'INSERT' and new.media_id is not null and (
    select count(*) from public.supplier_submission_items
    where submission_id = parent_id and checklist_key = new.checklist_key and media_id is not null
  ) >= 3 then
    raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_LIMIT';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_l3_submission_item_mutation() from public;
drop trigger if exists guard_l3_submission_items on public.supplier_submission_items;
create trigger guard_l3_submission_items before insert or delete on public.supplier_submission_items
  for each row execute function public.guard_l3_submission_item_mutation();

create or replace function public.guard_l3_pending_evidence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.target_level = 3 and new.status = 'pending_review' and old.status <> 'pending_review'
    and not exists (
      select 1 from public.supplier_submission_items i
      where i.submission_id = new.id and i.media_id is not null
        and nullif(btrim(i.storage_path), '') is not null
        and i.checklist_key in ('bill_of_lading', 'customs_declaration', 'commercial_invoice',
          'packing_list', 'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence')
    ) then
    raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_l3_pending_evidence() from public;
drop trigger if exists guard_l3_pending_evidence on public.supplier_submissions;
create trigger guard_l3_pending_evidence before update of status on public.supplier_submissions
  for each row execute function public.guard_l3_pending_evidence();


create table if not exists public.supplier_submission_links (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.supplier_submissions(id) on delete cascade,
  url            text not null check (char_length(url) between 8 and 800),
  label          text check (label is null or char_length(label) <= 200),
  allowed_source boolean not null default false,
  fetched_at     timestamptz,
  fetch_status   text not null default 'pending'
                   check (fetch_status in ('pending','fetched','blocked','failed','manual')),
  fetch_note     text,
  created_by     uuid references public.app_users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists supplier_submission_links_submission_idx
  on public.supplier_submission_links (submission_id, created_at);
alter table public.supplier_submission_links enable row level security;
revoke all on public.supplier_submission_links from anon, authenticated;

drop trigger if exists supplier_submissions_touch on public.supplier_submissions;
create trigger supplier_submissions_touch before update on public.supplier_submissions
  for each row execute function public.touch_updated_at();

create table if not exists public.supplier_verification_requests (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  target_level smallint not null check (target_level in (2,3)),
  status text not null default 'requested' check (status in ('requested','contacted')),
  requested_at timestamptz not null default now(),
  contacted_at timestamptz,
  contacted_by uuid references public.app_users(id) on delete set null,
  primary key (supplier_id, target_level)
);
create index if not exists supplier_verification_requests_queue_idx
  on public.supplier_verification_requests(status, requested_at desc);
alter table public.supplier_verification_requests enable row level security;
revoke all on public.supplier_verification_requests from anon, authenticated;

-- Quyền cổng NCC riêng với status công khai và kết quả từng đợt xác minh.
alter table public.suppliers add column if not exists onboarding_status text not null default 'not_started';
alter table public.suppliers add column if not exists onboarding_note text;
alter table public.suppliers drop constraint if exists suppliers_onboarding_status_check;
alter table public.suppliers add constraint suppliers_onboarding_status_check
  check (onboarding_status in ('not_started','pending','approved','changes_requested'));
update public.suppliers s set onboarding_status = 'pending'
where s.onboarding_status = 'not_started' and exists (
  select 1 from public.app_users u where u.supplier_id = s.id and u.role = 'supplier'
) and s.tax_id is not null and s.products is not null;

-- Moderation of supplier-authored products; pre-existing staff products remain approved.
alter table public.supplier_products add column if not exists supplier_review_status text not null default 'approved';
alter table public.supplier_products add column if not exists supplier_review_note text;
alter table public.supplier_products drop constraint if exists supplier_products_supplier_review_status_check;
alter table public.supplier_products add constraint supplier_products_supplier_review_status_check
  check (supplier_review_status in ('draft','pending','approved','changes_requested','paused'));
create index if not exists supplier_products_review_queue_idx
  on public.supplier_products(supplier_review_status, updated_at desc);

create table if not exists public.supplier_portal_notice_reads (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  notice_key text not null check (char_length(notice_key) between 1 and 100),
  read_at timestamptz not null default now(),
  primary key (supplier_id, notice_key)
);
alter table public.supplier_portal_notice_reads enable row level security;
revoke all on public.supplier_portal_notice_reads from anon, authenticated;

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
alter table public.rfq_matches add column if not exists response_due_at timestamptz;
alter table public.rfq_matches add column if not exists supplier_replied_at timestamptz;
create index if not exists rfq_matches_supplier_sent_idx on public.rfq_matches(supplier_id, sent_to_supplier_at desc)
  where sent_to_supplier_at is not null;
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
  -- Legacy supplier-wide price columns retained in the view for compatibility,
  -- but always empty: reference prices belong to individual products only.
  case when false then s.fob_min end as fob_min,
  case when false then s.fob_max end as fob_max,
  case when false then s.fob_unit end as fob_unit,
  case when false then s.fob_currency end as fob_currency,
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
  regexp_replace(
    regexp_replace(sp.description,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact via Vexim]', 'gi'),
    '(\+?[0-9][ ().-]?){9,15}[0-9]', '[contact via Vexim]', 'g') as description,
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
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.ref_price end as ref_price,
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.currency end as currency,
  sp.updated_at,
  case when sp.ready_for_buyer
    and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
    and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
    then regexp_replace(
    regexp_replace(sp.description_detail,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact via Vexim]', 'gi'),
    '(\+?[0-9][ ().-]?){9,15}[0-9]', '[contact via Vexim]', 'g') end as description_detail,
  sp.oem,
  sp.odm
from public.supplier_products sp
join public.suppliers s on s.id = sp.supplier_id
where s.status = 'published'
  and not coalesce(s.is_demo, false)
  and sp.ready_for_buyer
  and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
  and (not sp.supplier_originated or exists (
    select 1 from public.categories c where c.slug = sp.reviewed_category_slug
      and c.status = 'published' and c.is_published
  ));

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

-- Cổng NCC: xóa an toàn bản nháp chưa có lịch sử (giống migration 20261038).
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
notify pgrst, 'reload schema';


-- L2 partner scope (same guards as migration 20261040).
-- L2 thương mại: phạm vi là hợp đồng với nhà máy đối tác, KHÔNG phải kiểm nhà máy sở hữu.
-- Chạy sau 20261031_supplier_submission_media_owner.sql và 20261039_l3_other_export_evidence.sql.
-- Không sửa hồ sơ, kết luận hoặc loại hình cũ. NULL ở L2 giữ nghĩa luồng nhà máy cũ.

alter table public.supplier_submissions add column if not exists l2_scope text;
alter table public.verifications add column if not exists l2_scope text;
alter table public.supplier_submissions drop constraint if exists supplier_submissions_l2_scope_ck;
alter table public.supplier_submissions add constraint supplier_submissions_l2_scope_ck check (
  l2_scope is null or (target_level = 2 and l2_scope in ('factory', 'partner_contract'))
);
alter table public.verifications drop constraint if exists verifications_l2_scope_ck;
alter table public.verifications add constraint verifications_l2_scope_ck check (
  l2_scope is null or (target_level = 2 and l2_scope in ('factory', 'partner_contract'))
);

-- Retain an existing factory draft, including one on a trader's account. A new
-- partner case is separate; neither case is rewritten or silently transferred.
drop index if exists public.supplier_submissions_one_open_per_level;
create unique index if not exists supplier_submissions_one_open_per_scope
  on public.supplier_submissions (supplier_id, target_level, coalesce(l2_scope, 'factory'))
  where status <> 'accepted';

alter table public.supplier_submission_items drop constraint if exists supplier_submission_items_key_ck;
alter table public.supplier_submission_items add constraint supplier_submission_items_key_ck check (
  checklist_key in (
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe', 'pest_control',
    'partner_factory_contract', 'partner_factory_photos',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'
  )
);
alter table public.media_assets drop constraint if exists media_checklist_key_ck;
alter table public.media_assets add constraint media_checklist_key_ck check (
  checklist_key is null or
  (owner_type in ('verification', 'submission') and checklist_key in (
    'business_license', 'tax_certificate', 'bank_letter', 'food_safety',
    'haccp_or_brc', 'product_certs', 'export_license',
    'factory_address_confirmed', 'production_line_seen', 'warehouse_seen',
    'qc_lab_seen', 'documents_original', 'capacity_verified', 'worker_interview', 'management_interview', 'photos_taken',
    'order_matched', 'shipping_proof', 'delivery_proof',
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe', 'pest_control',
    'partner_factory_contract', 'partner_factory_photos',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'
  ))
);

-- New cases follow the registered type; a legacy NULL scope still means factory.
-- Existing records are left untouched and may be inspected as history.
create or replace function public.guard_new_l2_scope_type()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare current_type text; expected_scope text;
begin
  if new.target_level <> 2 then return new; end if;
  select supplier_type into current_type from public.suppliers where id = new.supplier_id for share;
  expected_scope := case when current_type = 'trading' then 'partner_contract'
                         when current_type in ('manufacturer', 'cooperative') then 'factory' else null end;
  if expected_scope is null or coalesce(new.l2_scope, 'factory') <> expected_scope then
    raise exception using errcode = 'P0001', message = 'L2_SCOPE_TYPE_MISMATCH';
  end if;
  if tg_table_name = 'verifications' and new.l2_scope = 'partner_contract' and new.status = 'approved' then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_APPROVAL_REQUIRES_REVIEW';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_new_l2_scope_type() from public;
drop trigger if exists guard_new_submission_l2_scope on public.supplier_submissions;
create trigger guard_new_submission_l2_scope before insert on public.supplier_submissions
  for each row execute function public.guard_new_l2_scope_type();
drop trigger if exists guard_new_review_l2_scope on public.verifications;
create trigger guard_new_review_l2_scope before insert on public.verifications
  for each row execute function public.guard_new_l2_scope_type();

-- Neither type changes nor a later staff edit can change the legal entity,
-- level or meaning of an existing submission/review.
create or replace function public.guard_verification_scope_identity()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.supplier_id is distinct from old.supplier_id or
     new.target_level is distinct from old.target_level or
     new.l2_scope is distinct from old.l2_scope then
    raise exception using errcode = 'P0001', message = 'VERIFICATION_SCOPE_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_verification_scope_identity() from public;
drop trigger if exists guard_submission_scope_identity on public.supplier_submissions;
create trigger guard_submission_scope_identity before update of supplier_id, target_level, l2_scope on public.supplier_submissions
  for each row execute function public.guard_verification_scope_identity();
drop trigger if exists guard_review_scope_identity on public.verifications;
create trigger guard_review_scope_identity before update of supplier_id, target_level, l2_scope on public.verifications
  for each row execute function public.guard_verification_scope_identity();

-- Share the parent row lock with pending transition; enforce scope-specific keys,
-- a maximum of three files and no edits while a manual case is in the queue.
create or replace function public.guard_l3_submission_item_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  parent_id uuid;
  parent_supplier uuid;
  parent_level smallint;
  parent_scope text;
  parent_status text;
  manual_case boolean;
begin
  if tg_op = 'INSERT' then parent_id := new.submission_id; else parent_id := old.submission_id; end if;
  select target_level, l2_scope, status, supplier_id into parent_level, parent_scope, parent_status, parent_supplier
    from public.supplier_submissions where id = parent_id for update;
  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'INSERT' then
    if (parent_level = 2 and parent_scope = 'partner_contract' and new.supplier_id is distinct from parent_supplier)
       or (parent_level = 2 and parent_scope = 'partner_contract' and new.checklist_key not in ('partner_factory_contract', 'partner_factory_photos'))
       or (coalesce(parent_scope, '') <> 'partner_contract' and new.checklist_key in ('partner_factory_contract', 'partner_factory_photos')) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_KEY_MISMATCH';
    end if;
  end if;
  manual_case := parent_level = 3 or (parent_level = 2 and coalesce(parent_scope, 'factory') = 'partner_contract');
  if not manual_case then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if parent_status not in ('draft', 'returned') then
    raise exception using errcode = 'P0001', message = 'L3_SUBMISSION_LOCKED';
  end if;
  if tg_op = 'INSERT' and new.media_id is not null and (
    select count(*) from public.supplier_submission_items
    where submission_id = parent_id and checklist_key = new.checklist_key and media_id is not null
  ) >= 3 then
    raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_LIMIT';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_l3_submission_item_mutation() from public;
drop trigger if exists guard_l3_submission_items on public.supplier_submission_items;
create trigger guard_l3_submission_items before insert or delete on public.supplier_submission_items
  for each row execute function public.guard_l3_submission_item_mutation();

create or replace function public.guard_partner_submission_item_update()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare p_level smallint; p_scope text; p_status text; destination_scope text;
begin
  select target_level, l2_scope, status into p_level, p_scope, p_status
    from public.supplier_submissions where id = old.submission_id for update;
  if new.submission_id is distinct from old.submission_id then
    select l2_scope into destination_scope from public.supplier_submissions where id = new.submission_id for update;
    if destination_scope = 'partner_contract' or p_level = 3 or (p_level = 2 and p_scope = 'partner_contract') or exists (select 1 from public.supplier_submissions where id = new.submission_id and target_level = 3) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_KEY_MISMATCH';
    end if;
  end if;
  if found and (p_level = 3 or (p_level = 2 and p_scope = 'partner_contract')) then
    if p_status not in ('draft', 'returned') then
      raise exception using errcode = 'P0001', message = 'L3_SUBMISSION_LOCKED';
    end if;
    if new.submission_id is distinct from old.submission_id or new.supplier_id is distinct from old.supplier_id or
       new.checklist_key is distinct from old.checklist_key or (p_level = 2 and new.checklist_key not in ('partner_factory_contract', 'partner_factory_photos')) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_KEY_MISMATCH';
    end if;
    if old.media_id is null and new.media_id is not null and (
      select count(*) from public.supplier_submission_items
      where submission_id = old.submission_id and checklist_key = old.checklist_key and media_id is not null
    ) >= 3 then
      raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_LIMIT';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_partner_submission_item_update() from public;
drop trigger if exists guard_partner_submission_item_update on public.supplier_submission_items;
create trigger guard_partner_submission_item_update before update of submission_id, supplier_id, checklist_key, media_id, storage_path on public.supplier_submission_items
  for each row execute function public.guard_partner_submission_item_update();

create or replace function public.guard_l3_pending_evidence()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare current_type text; expected_scope text;
begin
  if new.status = 'pending_review' and old.status <> 'pending_review' then
    if new.target_level = 2 then
      select supplier_type into current_type from public.suppliers where id = new.supplier_id for share;
      expected_scope := case when current_type = 'trading' then 'partner_contract'
                             when current_type in ('manufacturer', 'cooperative') then 'factory' else null end;
      if expected_scope is null or coalesce(new.l2_scope, 'factory') <> expected_scope then
        raise exception using errcode = 'P0001', message = 'L2_SCOPE_TYPE_MISMATCH';
      end if;
    end if;
    if new.target_level = 3 and not exists (
      select 1 from public.supplier_submission_items i
      where i.submission_id = new.id and i.media_id is not null and nullif(btrim(i.storage_path), '') is not null
        and i.checklist_key in ('bill_of_lading', 'customs_declaration', 'commercial_invoice',
          'packing_list', 'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence')
    ) then
      raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_REQUIRED';
    end if;
    if new.target_level = 2 and new.l2_scope = 'partner_contract' and not exists (
      select 1 from public.supplier_submission_items i
      join public.media_assets m on m.id = i.media_id
      where i.submission_id = new.id and i.supplier_id = new.supplier_id
        and i.checklist_key = 'partner_factory_contract' and nullif(btrim(i.storage_path), '') is not null
        and m.owner_type = 'submission' and m.submission_id = new.id and m.supplier_id = new.supplier_id
        and m.storage_path = i.storage_path and m.checklist_key = i.checklist_key
        and m.audience = 'internal' and m.kind in ('image', 'document')
    ) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_CONTRACT_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_l3_pending_evidence() from public;
drop trigger if exists guard_l3_pending_evidence on public.supplier_submissions;
create trigger guard_l3_pending_evidence before update of status on public.supplier_submissions
  for each row execute function public.guard_l3_pending_evidence();

-- Manual submission files share the same parent lock as the queue transition.
-- Reject moving them between submissions/entities and allow cleanup of an
-- unattached upload that lost a race with submit.
create or replace function public.guard_manual_submission_media()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare old_parent uuid; new_parent uuid; p_level smallint; p_scope text; p_status text; p_supplier uuid; manual_case boolean := false;
begin
  if tg_op <> 'INSERT' then old_parent := old.submission_id; end if;
  if tg_op <> 'DELETE' then new_parent := new.submission_id; end if;
  if old_parent is not null then
    select target_level, l2_scope, status, supplier_id into p_level, p_scope, p_status, p_supplier
      from public.supplier_submissions where id = old_parent for update;
    manual_case := found and (p_level = 3 or (p_level = 2 and coalesce(p_scope, 'factory') = 'partner_contract'));
    if manual_case and tg_op = 'UPDATE' and new_parent is distinct from old_parent then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
    end if;
  end if;
  if new_parent is not null and (old_parent is null or new_parent is distinct from old_parent) then
    select target_level, l2_scope, status, supplier_id into p_level, p_scope, p_status, p_supplier
      from public.supplier_submissions where id = new_parent for update;
    manual_case := found and (p_level = 3 or (p_level = 2 and coalesce(p_scope, 'factory') = 'partner_contract'));
    if manual_case and tg_op = 'UPDATE' then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
    end if;
  end if;
  if not manual_case then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  if p_status not in ('draft', 'returned') then
    if tg_op = 'DELETE' and not exists (select 1 from public.supplier_submission_items where media_id = old.id) then return old; end if;
    raise exception using errcode = 'P0001', message = 'L3_SUBMISSION_LOCKED';
  end if;
  if tg_op <> 'DELETE' and (new.owner_type <> 'submission' or new.submission_id is distinct from coalesce(old_parent, new_parent)
      or new.supplier_id is distinct from p_supplier or new.audience is distinct from 'internal' or new.kind is null or new.kind not in ('image', 'document', 'certificate') or new.checklist_key is null
      or (p_scope = 'partner_contract' and (new.checklist_key not in ('partner_factory_contract', 'partner_factory_photos')
          or (new.checklist_key = 'partner_factory_photos' and new.kind <> 'image') or (new.checklist_key = 'partner_factory_contract' and new.kind not in ('image', 'document'))))
      or (p_level = 3 and new.checklist_key not in ('bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
          'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'))) then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_manual_submission_media() from public;
drop trigger if exists guard_manual_submission_media on public.media_assets;
create trigger guard_manual_submission_media before insert or update or delete on public.media_assets
  for each row execute function public.guard_manual_submission_media();

-- Lock partner evidence to its review and keep it private. Taking the same
-- review lock serializes edits/deletes against approval.
create or replace function public.guard_partner_review_media()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare review_id uuid; review_scope text; review_status text; review_supplier uuid;
begin
  -- Never move an existing file into or out of a partner review; create a new
  -- internal evidence record instead. Check the destination as well as source.
  if tg_op = 'UPDATE' and new.verification_id is distinct from old.verification_id and new.verification_id is not null then
    select l2_scope into review_scope from public.verifications where id = new.verification_id for update;
    if found and review_scope = 'partner_contract' then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
    end if;
  end if;
  if tg_op = 'INSERT' then review_id := new.verification_id; else review_id := old.verification_id; end if;
  if review_id is null then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  select l2_scope, status, supplier_id into review_scope, review_status, review_supplier
    from public.verifications where id = review_id for update;
  if not found or review_scope is distinct from 'partner_contract' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if review_status not in ('scheduled', 'in_progress', 'returned') then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_REVIEW_LOCKED';
  end if;
  if tg_op <> 'DELETE' and (new.verification_id is distinct from review_id or new.supplier_id is distinct from review_supplier
      or new.owner_type <> 'verification' or new.audience <> 'internal') then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_partner_review_media() from public;
drop trigger if exists guard_partner_review_media on public.media_assets;
create trigger guard_partner_review_media before insert or update or delete on public.media_assets
  for each row execute function public.guard_partner_review_media();

-- The human reviewer must mark the contract checked and confirm the parties
-- and restricted scope. This is not a factory ownership or site-visit claim.
create or replace function public.guard_partner_review_approval()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare current_type text;
begin
  if new.target_level = 2 and new.status = 'approved' and old.status <> 'approved' then
    select supplier_type into current_type from public.suppliers where id = new.supplier_id for share;
    if (new.l2_scope = 'partner_contract' and current_type is distinct from 'trading') or
       (coalesce(new.l2_scope, 'factory') = 'factory' and (current_type is null or current_type not in ('manufacturer', 'cooperative'))) then
      raise exception using errcode = 'P0001', message = 'L2_SCOPE_TYPE_MISMATCH';
    end if;
  end if;
  if new.target_level = 2 and new.l2_scope = 'partner_contract' and new.status = 'approved' and old.status <> 'approved' then
    if not exists (
      select 1 from public.media_assets m where m.verification_id = new.id and m.owner_type = 'verification'
        and m.supplier_id = new.supplier_id and m.checklist_key = 'partner_factory_contract'
        and m.kind in ('image', 'document') and m.audience = 'internal' and m.status = 'checked'
        and nullif(btrim(m.storage_path), '') is not null
    ) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_CONTRACT_CHECK_REQUIRED';
    end if;
    if new.checklist->>'partner_identity_confirmed' is distinct from 'true' or
       new.checklist->>'partner_scope_confirmed' is distinct from 'true' then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_SCOPE_CONFIRM_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_partner_review_approval() from public;
drop trigger if exists guard_partner_review_approval on public.verifications;
create trigger guard_partner_review_approval before update of status on public.verifications
  for each row execute function public.guard_partner_review_approval();


notify pgrst, 'reload schema';

-- Keep factory submissions complete and immutable while a person reviews them.
-- Apply after 20261040_l2_partner_contract.sql. No existing status is changed.
-- AI findings (including historical `hard` flags) never block submission.

-- Item mutations share the submission row lock with the transition to pending.
-- AI may still update its advisory fields on an already-submitted item.
create or replace function public.guard_l2_factory_item_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  parent_id uuid;
  p_level smallint;
  p_scope text;
  p_status text;
  p_supplier uuid;
  destination_factory boolean := false;
begin
  if tg_op = 'INSERT' then parent_id := new.submission_id; else parent_id := old.submission_id; end if;
  select target_level, l2_scope, status, supplier_id into p_level, p_scope, p_status, p_supplier
    from public.supplier_submissions where id = parent_id for update;
  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'UPDATE' and new.submission_id is distinct from old.submission_id then
    select exists(select 1 from public.supplier_submissions s where s.id = new.submission_id
      and s.target_level = 2 and coalesce(s.l2_scope, 'factory') = 'factory') into destination_factory;
    if (p_level = 2 and coalesce(p_scope, 'factory') = 'factory') or destination_factory then
      raise exception using errcode = 'P0001', message = 'L2_FACTORY_ITEM_INVALID';
    end if;
  end if;
  if p_level <> 2 or coalesce(p_scope, 'factory') <> 'factory' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if p_status not in ('draft', 'returned') then
    raise exception using errcode = 'P0001', message = 'L2_FACTORY_LOCKED';
  end if;
  if tg_op <> 'DELETE' and (new.supplier_id is distinct from p_supplier or new.checklist_key not in (
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe', 'pest_control'
  )) then
    raise exception using errcode = 'P0001', message = 'L2_FACTORY_ITEM_INVALID';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_l2_factory_item_mutation() from public;
drop trigger if exists guard_l2_factory_item_insert_delete on public.supplier_submission_items;
create trigger guard_l2_factory_item_insert_delete before insert or delete on public.supplier_submission_items
  for each row execute function public.guard_l2_factory_item_mutation();
drop trigger if exists guard_l2_factory_item_identity on public.supplier_submission_items;
create trigger guard_l2_factory_item_identity before update of submission_id, supplier_id, checklist_key, media_id, storage_path, thumb_path, mime
  on public.supplier_submission_items for each row execute function public.guard_l2_factory_item_mutation();

-- Check structural requirements in the same transaction that locks the row.
-- Missing/incorrect codes reported by AI are suggestions for staff, not gates.
create or replace function public.guard_l2_factory_pending_evidence()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.target_level = 2 and coalesce(new.l2_scope, 'factory') = 'factory'
    and new.status = 'pending_review' and old.status <> 'pending_review' then
    if nullif(btrim(new.verification_code), '') is null or new.code_issued_at is null
      or new.code_issued_at < now() - interval '72 hours' then
      raise exception using errcode = 'P0001', message = 'L2_FACTORY_CODE_REQUIRED';
    end if;
    if (select count(distinct i.checklist_key) from public.supplier_submission_items i
      where i.submission_id = new.id and i.supplier_id = new.supplier_id
        and i.media_id is not null and nullif(btrim(i.storage_path), '') is not null
        and i.checklist_key in ('factory_gate', 'raw_material_warehouse', 'production_line_running',
          'packing_area', 'finished_goods_warehouse', 'open_carton_lot_label',
          'hygiene_station', 'worker_ppe', 'pest_control')) < 9 then
      raise exception using errcode = 'P0001', message = 'L2_FACTORY_PHOTOS_REQUIRED';
    end if;
    if exists (
      select 1 from public.supplier_submission_items i
      cross join lateral jsonb_array_elements(case when jsonb_typeof(i.flags) = 'array' then i.flags else '[]'::jsonb end) flag
      where i.submission_id = new.id and i.media_id is not null
        and i.checklist_key in ('factory_gate', 'production_line_running', 'finished_goods_warehouse')
        and flag->>'severity' = 'hard' and flag->>'source' is distinct from 'ai'
        and flag->>'flag' in ('code_missing', 'code_mismatch')
    ) then
      raise exception using errcode = 'P0001', message = 'L2_FACTORY_CODE_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_l2_factory_pending_evidence() from public;
drop trigger if exists guard_l2_factory_pending_evidence on public.supplier_submissions;
create trigger guard_l2_factory_pending_evidence before update of status on public.supplier_submissions
  for each row execute function public.guard_l2_factory_pending_evidence();


notify pgrst, 'reload schema';

-- END supabase/schema.sql


-- BEGIN supabase/migrations/20261008_prospect_company_ai.sql
-- Store a concise, source-backed company introduction generated by the AI research action.
alter table public.prospects
  add column if not exists ai_company_summary text,
  add column if not exists ai_company_sources jsonb not null default '[]'::jsonb,
  add column if not exists ai_company_analyzed_at timestamptz;

-- END supabase/migrations/20261008_prospect_company_ai.sql


-- BEGIN supabase/migrations/20261008_prospect_segmentation.sql
-- Separate import provenance from the target outreach segment.
-- Existing records are retained and receive a best-effort noodle segment backfill.
alter table public.prospects
  add column if not exists data_source text not null default 'Apollo',
  add column if not exists target_product text;

update public.prospects
set data_source = 'Apollo'
where data_source is null or btrim(data_source) = '';

update public.prospects
set target_product = 'Mì ăn liền'
where target_product is null
  and source_list is not null
  and (source_list ilike '%mì ăn liền%' or source_list ilike '%mỳ ăn liền%');

create index if not exists prospects_target_product_idx
  on public.prospects (target_product);

-- END supabase/migrations/20261008_prospect_segmentation.sql


-- BEGIN supabase/migrations/20261008_prospects.sql
-- Prospect cold outreach, activity history, and mail linkage.
-- Safe to run once on the live Supabase project.
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text,
  contact_title text,
  email text,
  email_status text,
  phone text,
  country text,
  city text,
  website text,
  linkedin_url text,
  company_linkedin_url text,
  industry text,
  employee_range text,
  apollo_id text,
  source_list text,
  status text not null default 'new' check (status in
    ('new','researched','ready','contacted','replied','meeting','qualified','converted','disqualified','unsubscribed')),
  owner text,
  next_action text,
  next_action_at timestamptz,
  notes text,
  converted_buyer_id uuid references public.buyers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prospects_status_idx on public.prospects (status);
create index if not exists prospects_email_idx on public.prospects (lower(email));
create index if not exists prospects_company_idx on public.prospects (lower(company));
create index if not exists prospects_owner_idx on public.prospects (owner);

create table if not exists public.prospect_activities (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  channel text not null check (channel in ('email','linkedin','phone','meeting','note')),
  summary text not null,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists prospect_activities_prospect_idx
  on public.prospect_activities (prospect_id, created_at desc);

-- Separate, editable cold-outreach copy. It does not share Buyer stage templates.
create table if not exists public.prospect_outreach_templates (
  id text primary key check (id in ('intro', 'followup')),
  label text not null,
  subject text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table public.email_messages
  add column if not exists prospect_id uuid references public.prospects(id) on delete set null;
create index if not exists email_messages_prospect_idx
  on public.email_messages (prospect_id, created_at desc);

-- END supabase/migrations/20261008_prospects.sql


-- BEGIN supabase/migrations/20261008_prospects_require_email.sql
-- The user requires email for every active target contact.
-- This deletes only records with a missing or blank email.
-- Activities cascade; related email messages are retained and unlinked by ON DELETE SET NULL.
-- Optional preview before applying: select count(*) from public.prospects where email is null or btrim(email) = '';

delete from public.prospects
where email is null or btrim(email) = '';

alter table public.prospects
  alter column email set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'prospects_email_nonblank_check'
      and conrelid = 'public.prospects'::regclass
  ) then
    alter table public.prospects
      add constraint prospects_email_nonblank_check check (btrim(email) <> '');
  end if;
end $$;


-- END supabase/migrations/20261008_prospects_require_email.sql


-- BEGIN supabase/migrations/20261010_blog_posts.sql
-- Module blog (veximtrade.com/blog).
-- Gộp các thay đổi của module CMS gốc thành một migration; chạy một lần trên Supabase.
-- Bảng chỉ được đọc/ghi qua server bằng service role. RLS bật và KHÔNG có chính sách
-- công khai, nên khóa anon không đọc được bản nháp hay ghi được bài viết.

CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  -- Nội dung dạng JSON các khối (heading / paragraph / image / quote / table / list)
  content TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL,
  featured_image TEXT,
  featured_image_alt TEXT,
  meta_title TEXT,
  meta_description TEXT,
  focus_keyword TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_status ON public.posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON public.posts(published_at DESC);

CREATE OR REPLACE FUNCTION public.posts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_set_updated_at ON public.posts;
CREATE TRIGGER posts_set_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_set_updated_at();

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- END supabase/migrations/20261010_blog_posts.sql


-- BEGIN supabase/migrations/20261011_blog_author.sql
-- Tác giả và người duyệt nội dung cho bài blog (tín hiệu E-E-A-T).
-- Chạy một lần trên Supabase sau 20261010_blog_posts.sql. Có thể chạy lại an toàn.

alter table public.posts
  add column if not exists author_name text,
  add column if not exists reviewer_name text;

comment on column public.posts.author_name is 'Tên người viết bài hiển thị cho người đọc (để trống thì hiển thị Veximtrade)';
comment on column public.posts.reviewer_name is 'Người kiểm duyệt nội dung chuyên môn (tùy chọn)';

-- END supabase/migrations/20261011_blog_author.sql


-- BEGIN supabase/migrations/20261012_prospect_ai_products.sql
-- Sản phẩm đọc được từ website của đầu mối — căn cứ duy nhất để thư tiếp cận
-- dám viết "I understand that <company> supplies <products>". Trước đó hệ thống chỉ
-- lưu bản TÓM TẮT CÔNG TY (ai_company_summary) nên khi soạn thư, model phải tự đoán
-- ngành hàng của khách từ target_product (giả định gán theo tên file import) -> ra thư bịa.
-- Cột mới giữ nguyên cấu trúc {products, group, note, sources, scanned_at} do
-- lib/ai/company-products.ts trả về; NULL = chưa quét.
alter table public.prospects
  add column if not exists ai_products jsonb;

-- END supabase/migrations/20261012_prospect_ai_products.sql


-- BEGIN supabase/migrations/20261012_signature_html_cleanup.sql
-- Dọn CHỮ KÝ EMAIL đã lưu trong DB, sau hai thay đổi của hệ thống:
--   (1) chữ ký tự động KHÔNG còn logo;
--   (2) lời chào chỉ còn tiếng Anh "Best regards," (bỏ bản tiếng Việt).
-- Ai từng bấm "Lưu chữ ký" thì chữ ký của họ nằm cứng trong app_users.signature_html,
-- sửa code không tự đổi được — chạy file này một lần để gỡ đúng phần thừa đó.
--
-- An toàn:
--   • Chỉ xoá thẻ <img> trỏ email-logo.png (không đụng ảnh khác) và ô <td> trống còn lại;
--   • Chỉ bỏ cụm "Trân trọng" ở dòng chào, giữ nguyên mọi chữ khác;
--   • Không xoá bản ghi; phần chữ chỉ bị bớt đúng hai chuỗi trên, còn lại giữ nguyên;
--   • Không đặt signature_html về NULL (khối "TUỲ CHỌN" cuối file mới làm việc đó, có chủ đích)
--   • Idempotent: chạy lần 2 không thay đổi gì thêm.
--
-- Muốn nhận chữ ký tự động MỚI (in đúng địa chỉ riêng dung@veximtrade.com thay vì
-- sales@) thì nhanh nhất là để người đó bấm "Xoá chữ ký tuỳ chỉnh" trong cửa sổ soạn
-- thư; hoặc chạy khối "Tuỳ chọn" ở cuối file cho cả đội một lượt.

with src as (
  select id, signature_html as html
  from public.app_users
  where signature_html is not null
    and (signature_html ilike '%email-logo.png%' or signature_html ilike '%Trân trọng%')
),
-- 1) gỡ ảnh logo trong chữ ký
rm_logo as (
  select id, regexp_replace(html, '<img[^>]*email-logo\.png[^>]*/?>', '', 'gi') as html
  from src
),
-- 2) gỡ ô bảng bỏ trống còn lại sau khi xoá logo (nếu để lại sẽ thành khoảng thụt lề lệch)
rm_empty_cell as (
  select id, regexp_replace(html, '<td[^>]*>[[:space:]]*</td>', '', 'g') as html
  from rm_logo
),
-- 3) "Best regards / Trân trọng," -> "Best regards,"
fix_greeting as (
  select id,
         regexp_replace(html, 'Best regards([[:space:]]*[/|·•][[:space:]]*)?Trân trọng,?', 'Best regards,', 'gi') as html
  from rm_empty_cell
),
-- 4) dòng "Trân trọng," đứng riêng một mình -> bỏ cả thẻ <p>
drop_own_line as (
  select id, regexp_replace(html, '<p[^>]*>[[:space:]]*Trân trọng,?[[:space:]]*</p>', '', 'gi') as html
  from fix_greeting
),
-- 5) mọi cụm " / Trân trọng" còn sót lại ở dạng khác
drop_rest as (
  select id, regexp_replace(html, '([[:space:]]*[/|·•][[:space:]]*)?Trân trọng,?', '', 'gi') as html
  from drop_own_line
)
update public.app_users u
set signature_html = d.html
from drop_rest d
where u.id = d.id;

-- ---------------------------------------------------------------------------
-- TUỲ CHỌN (bỏ comment nếu muốn chạy): trả cả đội về chữ ký tự động mới.
-- Xoá chữ ký tuỳ chỉnh của NHỮNG NGƯỜI CHƯA sửa gì ngoài bản mặc định (nhận diện
-- bằng dấu vết của khung bảng cũ). Chữ ký tự soạn khác không bị chạm tới.
--
-- update public.app_users
-- set signature_html = null
-- where signature_html is not null
--   and signature_html ilike '%role="presentation"%'
--   and signature_html ilike '%email-logo.png%';
-- ---------------------------------------------------------------------------

-- END supabase/migrations/20261012_signature_html_cleanup.sql


-- BEGIN supabase/migrations/20261012_user_sender_email.sql
-- Địa chỉ gửi riêng theo tên người cho từng tài khoản (deliverability).
-- Thư gửi từ địa chỉ chức năng (sales@, contact@) bị các công cụ chấm điểm xếp vào
-- nhóm mailbox nhận đại trà -> điểm tụt xuống "Risky" -> thư rơi vào Quảng cáo.
-- Gửi từ địa chỉ mang tên người (vd. dung@veximtrade.com) thì không bị.
--
-- Chạy một lần trên Supabase. Idempotent: chạy lại an toàn.
-- KHÔNG cần tạo mailbox/hộp thư mới ở đâu cả: domain veximtrade.com đã verify trong
-- Resend nên mọi local-part của domain đều gửi được, và domain nhận thư đang là
-- catch-all nên thư trả lời gửi tới dung@ vẫn về /api/webhooks/resend như cũ.

alter table public.app_users
  add column if not exists sender_email text;

-- NULL = app tự sinh từ họ tên (bỏ dấu, lấy tên chính, trùng thì đánh số dung2@).
-- Đặt giá trị khác NULL = giữ đúng địa chỉ này, app không tự đổi nữa.
comment on column public.app_users.sender_email is
  'Địa chỉ gửi riêng của người này; NULL = tự sinh từ họ tên (lib/email/sender.ts)';

-- Hai người không được dùng trùng một địa chỉ gửi.
create unique index if not exists app_users_sender_email_key
  on public.app_users (lower(sender_email))
  where sender_email is not null;

-- END supabase/migrations/20261012_user_sender_email.sql


-- BEGIN supabase/migrations/20261016_rfq_foundation.sql
-- ============================================================================\n--  VEXIM TRADE – RFQ FOUNDATION (GĐ 0)\n--  Chạy trong Supabase SQL Editor sau khi đã áp dụng supabase/schema.sql.\n--\n--  Thêm:\n--    - categories (2 cấp, i18n-ready)\n--    - supplier_categories (N-N)\n--    - cột mới cho suppliers + mở rộng status\n--    - cột mới cho supplier_products\n--    - certificates\n--    - verifications (khung, UI/quy trình kích hoạt sau)\n--    - rfqs + rfq_attachments + rfq_matches (chờ luồng công khai ở GĐ 2)\n--    - introductions (bảo vệ không vượt mặt)\n--    - audit_log\n--    - bổ sung cột buyers (consent_at, business_type, is_blocked, email_domain)\n--    - view whitelist công khai + index + bucket rfq-attachments\n--\n--  Tuân thủ quy tắc: mọi thay đổi thiết kế phá hoại (xoá cột, đổi kiểu) đều được\n--  làm mềm (thêm cột mới, giữ cột cũ) để code cũ tiếp tục chạy trong quá trình\n--  di chuyển; code mới sẽ ưu tiên đọc cột mới.\n-- ============================================================================\n\ncreate extension if not exists \"pgcrypto\";\n\n-- ---------------------------------------------------------------------------\n-- 0. TYPES\n-- ---------------------------------------------------------------------------\n\n-- Không dùng CREATE TYPE ... AS ENUM để tránh migrate ràng buộc khi cần thêm giá\n-- trị mới; dùng CHECK constraint như các bảng hiện có.\n\n-- ---------------------------------------------------------------------------\n-- 1. SUPPLIERS – mở rộng\n-- ---------------------------------------------------------------------------\n\n-- Giữ cột role cũ cho code cũ tiếp tục chạy (manufacturer/trader/agent/exporter)\n-- trong khi xây dựng GĐ. Khi code mới đã dùng cột type thì hãy thêm migration\n-- xoá cột role sau.\nalter table public.suppliers\n  add column if not exists slug text,\n  add column if not exists display_name text,\n  -- type mới: manufacturer/trading/cooperative (đồng bộ với vai trò ở mục 4 đặc tả)\n  add column if not exists supplier_type text check (supplier_type in\n    ('manufacturer','trading','cooperative')),\n  add column if not exists founded_year integer,\n  add column if not exists employees integer,\n  add column if not exists summary_i18n jsonb not null default '{}'::jsonb,\n  add column if not exists moq_text text,\n  add column if not exists capacity_per_month text,\n  add column if not exists ports text[] not null default '{}',\n  add column if not exists incoterms text[] not null default '{}',\n  add column if not exists export_markets text[] not null default '{}',\n  add column if not exists private_label boolean not null default false,\n  add column if not exists verification_level smallint not null default 0\n    check (verification_level between 0 and 3),\n  add column if not exists verified_at timestamptz,\n  add column if not exists next_reverify_at timestamptz,\n  add column if not exists rating_avg numeric(3,2),\n  add column if not exists rating_count integer not null default 0,\n  add column if not exists fob_min numeric(14,2),\n  add column if not exists fob_max numeric(14,2),\n  add column if not exists fob_unit text,\n  add column if not exists fob_currency text default 'USD',\n  add column if not exists fob_updated_at timestamptz,\n  add column if not exists fob_publicly_visible boolean not null default false;\n\n-- Mở rộng status enum cũ (new/verifying/verified/paused) → thêm draft/submitted/in_verification/published/suspended/archived.\nalter table public.suppliers drop constraint if exists suppliers_status_check;\nalter table public.suppliers add constraint suppliers_status_check\n  check (status in\n    ('new','verifying','verified','paused',\n     'draft','submitted','in_verification','published','suspended','archived'));\n\n-- Di chuyển dữ liệu cũ sang trạng thái mới:\n--   'new'       -> 'draft'       (chưa nhập đủ hồ sơ)\n--   'verifying' -> 'in_verification' (đang kiểm tra)\n--   'verified'  -> 'published'   (đã kiểm tra, công khai)\n--   'paused'    -> 'suspended'   (ngừng hiện công khai)\nupdate public.suppliers set status = 'draft' where status = 'new';\nupdate public.suppliers set status = 'in_verification' where status = 'verifying';\nupdate public.suppliers set status = 'published' where status = 'verified';\nupdate public.suppliers set status = 'suspended' where status = 'paused';\n\n-- Migrate giá trị cột role cũ sang supplier_type:\n--   manufacturer -> manufacturer; trader/exporter/agent -> trading\nupdate public.suppliers set supplier_type = 'manufacturer'\n  where supplier_type is null and role = 'manufacturer';\nupdate public.suppliers set supplier_type = 'trading'\n  where supplier_type is null and role in ('trader','agent','exporter');\n\n-- Đồng bộ private_label từ oem (nếu oem=true thì private_label=true; lúc MVP coi OEM và private-label là một)\nupdate public.suppliers set private_label = true\n  where private_label = false and id in (\n    select sp.supplier_id from public.supplier_products sp where sp.oem = true\n  );\n\ncreate unique index if not exists suppliers_slug_key on public.suppliers (slug) where slug is not null;\ncreate index if not exists suppliers_status_idx on public.suppliers (status);\ncreate index if not exists suppliers_verification_level_idx on public.suppliers (verification_level desc);\n\n-- ---------------------------------------------------------------------------\n-- 1b. SUPPLIER_PRODUCTS – mở rộng\n-- ---------------------------------------------------------------------------\n\nalter table public.supplier_products\n  add column if not exists slug text,\n  add column if not exists name_i18n jsonb not null default '{}'::jsonb,\n  add column if not exists specs jsonb not null default '{}'::jsonb,\n  add column if not exists images uuid[] not null default '{}',\n  add column if not exists moq_qty numeric(14,2),\n  add column if not exists moq_unit text;\n\ncreate unique index if not exists supplier_products_slug_key\n  on public.supplier_products (slug) where slug is not null;\ncreate index if not exists supplier_products_slug_idx\n  on public.supplier_products (supplier_id, slug);\n\n-- ---------------------------------------------------------------------------\n-- 2. CATEGORIES (2 cấp: danh mục ngành / sản phẩm con)\n-- ---------------------------------------------------------------------------\n\ncreate table if not exists public.categories (\n  id          uuid primary key default gen_random_uuid(),\n  slug        text not null,\n  parent_id   uuid references public.categories(id) on delete cascade,\n  name_i18n   jsonb not null default '{}'::jsonb,\n  intro_i18n  jsonb not null default '{}'::jsonb,\n  faq_i18n    jsonb not null default '[]'::jsonb,\n  seo_title_i18n jsonb not null default '{}'::jsonb,\n  seo_desc_i18n  jsonb not null default '{}'::jsonb,\n  is_published boolean not null default false,\n  sort_order  integer not null default 0,\n  created_at  timestamptz not null default now(),\n  updated_at  timestamptz not null default now()\n);\n\ncreate unique index if not exists categories_slug_key on public.categories (slug);\ncreate index if not exists categories_parent_idx on public.categories (parent_id) where parent_id is not null;\ncreate index if not exists categories_published_idx on public.categories (is_published, sort_order);\n\ndrop trigger if exists categories_touch on public.categories;\ncreate trigger categories_touch before update on public.categories\n  for each row execute function public.touch_updated_at();\n\n-- ---------------------------------------------------------------------------\n-- 2b. SUPPLIER_CATEGORIES (N-N)\n-- ---------------------------------------------------------------------------\n\ncreate table if not exists public.supplier_categories (\n  supplier_id uuid not null references public.suppliers(id) on delete cascade,\n  category_id uuid not null references public.categories(id) on delete cascade,\n  is_primary  boolean not null default false,\n  created_at  timestamptz not null default now(),\n  primary key (supplier_id, category_id)\n);\n\ncreate index if not exists supplier_categories_category_idx\n  on public.supplier_categories (category_id);\n\n-- ---------------------------------------------------------------------------\n-- 3. CERTIFICATES (tách từ media_assets)\n-- ---------------------------------------------------------------------------\n\ncreate table if not exists public.certificates (\n  id           uuid primary key default gen_random_uuid(),\n  supplier_id  uuid not null references public.suppliers(id) on delete cascade,\n  name         text not null,\n  issuer       text,\n  number       text,\n  valid_until  date,\n  file_media_id uuid references public.media_assets(id) on delete set null,\n  check_status text not null default 'on_file' check (check_status in\n                 ('on_file','original_seen','checked_with_issuer')),\n  checked_at   timestamptz,\n  checked_by   text,\n  notes        text,\n  created_at   timestamptz not null default now(),\n  updated_at   timestamptz not null default now()\n);\n\ncreate index if not exists certificates_supplier_idx on public.certificates (supplier_id);\ncreate index if not exists certificates_valid_until_idx on public.certificates (valid_until);\n\ndrop trigger if exists certificates_touch on public.certificates;\ncreate trigger certificates_touch before update on public.certificates\n  for each row execute function public.touch_updated_at();\n\n-- ---------------------------------------------------------------------------\n-- 4. VERIFICATIONS (khung bảng, UI & quy trình chi tiết kích hoạt sau)\n-- ---------------------------------------------------------------------------\n\ncreate table if not exists public.verifications (\n  id                 uuid primary key default gen_random_uuid(),\n  supplier_id        uuid not null references public.suppliers(id) on delete cascade,\n  target_level       smallint not null check (target_level between 1 and 3),\n  status             text not null default 'scheduled' check (status in\n                       ('scheduled','in_progress','submitted','approved','returned')),\n  inspector_id       uuid references public.app_users(id) on delete set null,\n  visit_date         date,\n  checklist          jsonb not null default '[]'::jsonb,\n  public_summary_i18n jsonb not null default '{}'::jsonb,\n  internal_notes     text,\n  approved_by        uuid references public.app_users(id) on delete set null,\n  approved_at        timestamptz,\n  created_at         timestamptz not null default now(),\n  updated_at         timestamptz not null default now(),\n  -- Ràng buộc 4-eyes: người duyệt không được là người kiểm tra (chỉ ép khi đủ 2 người)\n  constraint verifications_four_eyes check (\n    approved_by is null or inspector_id is null or approved_by <> inspector_id\n  )\n);\n\ncreate index if not exists verifications_supplier_idx on public.verifications (supplier_id, created_at desc);\ncreate index if not exists verifications_status_idx on public.verifications (status);\n\ndrop trigger if exists verifications_touch on public.verifications;\ncreate trigger verifications_touch before update on public.verifications\n  for each row execute function public.touch_updated_at();\n\n-- ---------------------------------------------------------------------------\n-- 5. BUYERS – bổ sung cột\n-- ---------------------------------------------------------------------------\n\nalter table public.buyers\n  add column if not exists email_domain text,\n  add column if not exists business_type text,\n  add column if not exists consent_at timestamptz,\n  add column if not exists consent_policy_version text,\n  add column if not exists is_blocked boolean not null default false;\n\ncreate index if not exists buyers_email_domain_idx on public.buyers (lower(email_domain));\ncreate index if not exists buyers_email_lower_idx on public.buyers (lower(email));\n\n-- Tự điền email_domain từ email cho các bản ghi cũ\nupdate public.buyers\nset email_domain = split_part(lower(email), '@', 2)\nwhere email is not null and email_domain is null and position('@' in email) > 0;\n\n-- ---------------------------------------------------------------------------\n-- 6. RFQs\n-- ---------------------------------------------------------------------------\n\ncreate table if not exists public.rfqs (\n  id                    uuid primary key default gen_random_uuid(),\n  code                  text not null,\n  buyer_id              uuid not null references public.buyers(id) on delete cascade,\n  category_id           uuid references public.categories(id) on delete set null,\n  product_text          text not null,\n  specs                 jsonb not null default '{}'::jsonb,\n  quantity              numeric(14,2),\n  unit                  text,\n  frequency             text, -- one_time / monthly / quarterly ...\n  destination_country   text,\n  incoterm              text,\n  needed_by             date,\n  target_price          numeric(14,2),\n  target_price_currency text default 'USD',\n  wants_samples         boolean not null default false,\n  wants_inspection      boolean not null default false,\n  wants_video_call      boolean not null default false,\n  preferred_supplier_ids uuid[] not null default '{}',\n  source_page           text,\n  utm                   jsonb not null default '{}'::jsonb,\n  referrer              text,\n  spam_score            integer not null default 0,\n  spam_flags            text[] not null default '{}',\n  status                text not null default 'new' check (status in\n                          ('new','qualified','matching','quoting','sampling',\n                           'won','lost','spam','closed')),\n  assigned_to           uuid references public.app_users(id) on delete set null,\n  first_response_at     timestamptz,\n  closed_reason         text,\n  access_token          text not null,\n  created_at            timestamptz not null default now(),\n  updated_at            timestamptz not null default now()\n);\n\ncreate unique index if not exists rfqs_code_key on public.rfqs (code);\ncreate unique index if not exists rfqs_access_token_key on public.rfqs (access_token);\ncreate index if not exists rfqs_status_idx on public.rfqs (status, created_at desc);\ncreate index if not exists rfqs_assigned_idx on public.rfqs (assigned_to, created_at desc);\ncreate index if not exists rfqs_buyer_idx on public.rfqs (buyer_id, created_at desc);\ncreate index if not exists rfqs_category_idx on public.rfqs (category_id) where category_id is not null;\ncreate index if not exists rfqs_created_idx on public.rfqs (created_at desc);\n\ndrop trigger if exists rfqs_touch on public.rfqs;\ncreate trigger rfqs_touch before update on public.rfqs\n  for each row execute function public.touch_updated_at();\n\n-- ---------------------------------------------------------------------------\n-- 6b. RFQ_ATTACHMENTS (file buyer đính kèm trong form RFQ công khai)\n-- ---------------------------------------------------------------------------\n\ncreate table if not exists public.rfq_attachments (\n  id           uuid primary key default gen_random_uuid(),\n  rfq_id       uuid not null references public.rfqs(id) on delete cascade,\n  bucket       text not null default 'rfq-attachments',\n  storage_path text not null,\n  file_name    text not null,\n  mime_type    text not null default 'application/octet-stream',\n  size_bytes   bigint not null default 0,\n  uploaded_by  text,\n  created_at   timestamptz not null default now()\n);\n\ncreate unique index if not exists rfq_attachments_path_key\n  on public.rfq_attachments (bucket, storage_path);\ncreate index if not exists rfq_attachments_rfq_idx on public.rfq_attachments (rfq_id);\n\n-- Bucket private cho file RFQ\ninsert into storage.buckets (id, name, public, file_size_limit)\nvalues ('rfq-attachments', 'rfq-attachments', false, 10 * 1024 * 1024)\non conflict (id) do nothing;\n\n-- ---------------------------------------------------------------------------\n-- 6c. RFQ_MATCHES (mỗi dòng = một seller được ghép vào một RFQ)\n-- ---------------------------------------------------------------------------\n\ncreate table if not exists public.rfq_matches (\n  id                 uuid primary key default gen_random_uuid(),\n  rfq_id             uuid not null references public.rfqs(id) on delete cascade,\n  supplier_id        uuid not null references public.suppliers(id) on delete cascade,\n  status             text not null default 'proposed' check (status in\n                       ('proposed','sent_to_supplier','quoted','declined',\n                        'no_response','presented_to_buyer','selected','not_selected')),\n  sent_to_supplier_at timestamptz,\n  quote_price        numeric(14,2),\n  quote_currency     text default 'USD',\n  quote_unit         text,\n  quote_incoterm     text,\n  quote_lead_time_days integer,\n  quote_valid_until  date,\n  quote_file_id      uuid references public.rfq_attachments(id) on delete set null,\n  sent_to_buyer_at   timestamptz,\n  internal_note      text,\n  created_at         timestamptz not null default now(),\n  updated_at         timestamptz not null default now(),\n  unique (rfq_id, supplier_id)\n);\n\ncreate index if not exists rfq_matches_rfq_idx on public.rfq_matches (rfq_id, status);\ncreate index if not exists rfq_matches_supplier_idx on public.rfq_matches (supplier_id, created_at desc);\n\ndrop trigger if exists rfq_matches_touch on public.rfq_matches;\ncreate trigger rfq_matches_touch before update on public.rfq_matches\n  for each row execute function public.touch_updated_at();\n\n-- ---------------------------------------------------------------------------\n-- 7. INTRODUCTIONS (cơ sở đòi hoa hồng, không vượt mặt)\n-- ---------------------------------------------------------------------------\n\ncreate table if not exists public.introductions (\n  id              uuid primary key default gen_random_uuid(),\n  buyer_id        uuid not null references public.buyers(id) on delete cascade,\n  supplier_id     uuid not null references public.suppliers(id) on delete cascade,\n  first_rfq_id    uuid not null references public.rfqs(id) on delete cascade,\n  introduced_at   timestamptz not null default now(),\n  protected_until timestamptz not null,\n  created_at      timestamptz not null default now()\n);\n\ncreate unique index if not exists introductions_buyer_supplier_key\n  on public.introductions (buyer_id, supplier_id);\ncreate index if not exists introductions_protected_until_idx\n  on public.introductions (protected_until);\n\n-- ---------------------------------------------------------------------------\n-- 8. AUDIT_LOG (thay đổi nhạy cảm bắt buộc ghi)\n-- ---------------------------------------------------------------------------\n\ncreate table if not exists public.audit_log (\n  id         bigserial primary key,\n  actor_id   uuid references public.app_users(id) on delete set null,\n  actor_email text,\n  entity     text not null,\n  entity_id  text not null,\n  action     text not null,\n  before     jsonb,\n  after      jsonb,\n  created_at timestamptz not null default now()\n);\n\ncreate index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);\ncreate index if not exists audit_log_actor_idx on public.audit_log (actor_id, created_at desc);\ncreate index if not exists audit_log_created_idx on public.audit_log (created_at desc);\n\n-- ---------------------------------------------------------------------------\n-- 9. PUBLIC VIEWS (whitelist – chỉ trả các field được phép công khai, chỉ supplier published)\n-- ---------------------------------------------------------------------------\n\ncreate or replace view public.v_public_suppliers as\nselect\n  s.id,\n  s.slug,\n  coalesce(s.display_name, s.trade_name, s.name)        as display_name,\n  s.supplier_type                                       as supplier_type,\n  s.province,\n  s.country,\n  s.founded_year,\n  s.employees,\n  s.summary_i18n,\n  s.moq_text,\n  s.capacity_per_month,\n  s.ports,\n  s.incoterms,\n  s.export_markets,\n  s.private_label,\n  s.verification_level,\n  s.verified_at,\n  s.next_reverify_at,\n  case when s.rating_count >= 3 then s.rating_avg end   as rating_avg,\n  case when s.rating_count >= 3 then s.rating_count end as rating_count,\n  case\n    when s.fob_publicly_visible and s.fob_updated_at is not null\n         and s.fob_updated_at > now() - interval '180 days'\n      then s.fob_min\n  end                                                   as fob_min,\n  case\n    when s.fob_publicly_visible and s.fob_updated_at is not null\n         and s.fob_updated_at > now() - interval '180 days'\n      then s.fob_max\n  end                                                   as fob_max,\n  case\n    when s.fob_publicly_visible and s.fob_updated_at is not null\n         and s.fob_updated_at > now() - interval '180 days'\n      then s.fob_unit\n  end                                                   as fob_unit,\n  case\n    when s.fob_publicly_visible and s.fob_updated_at is not null\n         and s.fob_updated_at > now() - interval '180 days'\n      then s.fob_currency\n  end                                                   as fob_currency,\n  s.fob_updated_at,\n  s.lead_time_days,\n  s.updated_at\nfrom public.suppliers s\nwhere s.status = 'published';\n\ncreate or replace view public.v_public_supplier_products as\nselect\n  sp.id,\n  sp.supplier_id,\n  sp.slug,\n  sp.name_i18n,\n  coalesce(sp.name_i18n->>'en', sp.name)                as name,\n  sp.specs,\n  sp.description,\n  sp.packaging,\n  sp.moq_qty,\n  sp.moq_unit,\n  sp.moq                                                as moq_text,\n  sp.monthly_capacity,\n  sp.lead_time_days,\n  sp.samples,\n  sp.images,\n  sp.export_port,\n  sp.incoterm,\n  sp.incoterm_place,\n  case\n    when exists (\n      select 1 from public.suppliers s\n      where s.id = sp.supplier_id\n        and s.status = 'published'\n        and s.fob_publicly_visible\n        and s.fob_updated_at is not null\n        and s.fob_updated_at > now() - interval '180 days'\n    )\n      then sp.ref_price\n  end                                                   as ref_price,\n  case\n    when exists (\n      select 1 from public.suppliers s\n      where s.id = sp.supplier_id\n        and s.status = 'published'\n        and s.fob_publicly_visible\n        and s.fob_updated_at is not null\n        and s.fob_updated_at > now() - interval '180 days'\n    )\n      then sp.currency\n  end                                                   as currency,\n  sp.updated_at\nfrom public.supplier_products sp\njoin public.suppliers s on s.id = sp.supplier_id\nwhere s.status = 'published';\n\n-- Grants: anonymous chỉ đọc được views whitelist\n-- (Sẽ bật khi RLS cho bảng công khai được kích hoạt ở GĐ 2; ở GĐ 1 trang\n-- công khai đọc bằng service role từ server components nên không cần mở cho anon)\n\n-- ---------------------------------------------------------------------------\n-- 10. SEED – Cashew category đầu tiên\n-- ---------------------------------------------------------------------------\n\ninsert into public.categories (slug, parent_id, name_i18n, intro_i18n, faq_i18n, seo_title_i18n, seo_desc_i18n, is_published, sort_order)\nvalues (\n  'cashew',\n  null,\n  '{\"en\": \"Cashew\"}'::jsonb,\n  '{\"en\": \"Verified Vietnamese cashew kernel suppliers, graded WW320, WW240, W180, LP, SP. Factory-audited by Vexim Trade.\"}'::jsonb,\n  '[]'::jsonb,\n  '{\"en\": \"Cashew Suppliers in Vietnam – Verified Manufacturers | Vexim Trade\"}'::jsonb,\n  '{\"en\": \"Compare verified Vietnamese cashew kernel suppliers by grade, MOQ, certification and lead time. Send a shortlist RFQ and receive quotes within 5 working days.\"}'::jsonb,\n  true,\n  10\n)\non conflict (slug) do update set\n  name_i18n = excluded.name_i18n,\n  intro_i18n = excluded.intro_i18n,\n  seo_title_i18n = excluded.seo_title_i18n,\n  seo_desc_i18n = excluded.seo_desc_i18n,\n  is_published = excluded.is_published,\n  sort_order = excluded.sort_order;\n\n-- TODO: sub-categories (ww320, ww240, w180, lp, sp...) sẽ được thêm khi spec ngành chốt.\n
-- END supabase/migrations/20261016_rfq_foundation.sql


-- BEGIN supabase/migrations/20261017_audit_checklist_evidence.sql
-- Attach audit evidence to one of the seven document-checklist items.
-- Old verification evidence remains unassigned (NULL) and is not moved/deleted.
-- Apply before deploying the inline-upload UI. Safe to rerun.

alter table public.media_assets add column if not exists checklist_key text;
alter table public.media_assets drop constraint if exists media_checklist_key_ck;
alter table public.media_assets add constraint media_checklist_key_ck check (
  checklist_key is null or
  (owner_type = 'verification' and verification_id is not null and checklist_key in (
    'business_license', 'tax_certificate', 'bank_letter', 'food_safety',
    'haccp_or_brc', 'product_certs', 'export_license'
  ))
);
create index if not exists media_verification_checklist_idx
  on public.media_assets (verification_id, checklist_key)
  where owner_type = 'verification' and checklist_key is not null;

notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_audit_checklist_evidence.sql


-- BEGIN supabase/migrations/20261017_certificate_publication_and_odm.sql
-- After 20261017_product_detail_price_visibility.sql; apply before deploying the certificate portal.
-- Existing certificates remain unreviewed/private: check_status alone is NOT publication approval.
alter table public.supplier_products add column if not exists odm boolean not null default false;
alter table public.certificates
  add column if not exists holder_name text,
  add column if not exists scope_text text,
  add column if not exists requested_product_ids uuid[] not null default '{}',
  add column if not exists approved_product_ids uuid[] not null default '{}',
  add column if not exists review_status text not null default 'unreviewed',
  add column if not exists review_note text,
  add column if not exists publicly_visible boolean not null default false;
alter table public.certificates drop constraint if exists certificates_review_status_check;
alter table public.certificates add constraint certificates_review_status_check
  check (review_status in ('unreviewed', 'pending', 'changes_requested', 'approved', 'rejected'));
-- File paths and review notes are private. Both tables are accessed only through server
-- handlers with service-role credentials; public pages get a scoped label projection.
alter table public.certificates enable row level security;
revoke all on public.certificates from anon, authenticated;
alter table public.media_assets enable row level security;
revoke all on public.media_assets from anon, authenticated;
-- Append only: preserve prior public-view column order while exposing self-stated product options.
create or replace view public.v_public_supplier_products as
select
  sp.id,
  sp.supplier_id,
  sp.slug,
  sp.name_i18n,
  coalesce(sp.name_i18n->>'en', sp.name)                as name,
  sp.specs,
  regexp_replace(
    regexp_replace(sp.description,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact via Vexim]', 'gi'),
    '(\+?[0-9][ ().-]?){9,15}[0-9]', '[contact via Vexim]', 'g') as description,
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
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.ref_price end as ref_price,
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.currency end as currency,
  sp.updated_at,
  case when sp.ready_for_buyer
    and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
    and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
    then regexp_replace(
    regexp_replace(sp.description_detail,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact via Vexim]', 'gi'),
    '(\+?[0-9][ ().-]?){9,15}[0-9]', '[contact via Vexim]', 'g') end as description_detail,
  sp.oem,
  sp.odm
from public.supplier_products sp
join public.suppliers s on s.id = sp.supplier_id
where s.status = 'published'
  and not coalesce(s.is_demo, false)
  and sp.ready_for_buyer
  and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
  and (not sp.supplier_originated or exists (
    select 1 from public.categories c where c.slug = sp.reviewed_category_slug
      and c.status = 'published' and c.is_published
  ));
notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_certificate_publication_and_odm.sql


-- BEGIN supabase/migrations/20261017_cms_supplier_images.sql
-- Deploy BEFORE the CMS/supplier image code. Safe to rerun against an existing
-- RFQ foundation schema; no category or supplier content is overwritten.

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

-- Backfill only rows created before status existed, keep editorial state of rows
-- that already have a status. public_page_ready is deliberately NOT persisted.
update public.categories
set status = case when is_published then 'published' else 'draft' end
where status is null;
alter table public.categories alter column status set default 'draft';
alter table public.categories alter column status set not null;

alter table public.suppliers
  add column if not exists profile_image text,
  add column if not exists cover_image text,
  add column if not exists is_demo boolean not null default false;

-- The app uses this private bucket through its service-role Storage client.
insert into storage.buckets (id, name, public)
values ('vexim-media', 'vexim-media', false)
on conflict (id) do nothing;


-- Supabase/PostgREST should refresh automatically after DDL; force refresh for
-- already running workers that report "column ... in the schema cache".
notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_cms_supplier_images.sql


-- BEGIN supabase/migrations/20261017_delivery_history_audit.sql
-- Apply after 20261017_verification_workflow.sql, before deploying the delivery audit pages.
-- Add evidence fields for one actual, completed shipment; never infer from RFQ won.

alter table public.verifications
  add column if not exists shipment_ref text,
  add column if not exists shipped_on date,
  add column if not exists shipment_destination text;

notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_delivery_history_audit.sql


-- BEGIN supabase/migrations/20261017_document_numeric_identifiers.sql
-- Internal numeric identifiers for the documents audit; no automatic verification.
-- Preserve leading zeroes and existing checklist notes. No backfill or publication.

alter table public.verifications
  add column if not exists tax_number text,
  add column if not exists bank_account_number text;

notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_document_numeric_identifiers.sql


-- BEGIN supabase/migrations/20261017_factory_delivery_inline_evidence.sql
-- Expand nullable checklist_key for factory visit and delivered-order evidence.
-- Existing L1 links and unassigned/legacy files remain untouched.
-- Run after 20261017_audit_checklist_evidence.sql, before deploying inline L2/L3 uploads.

alter table public.media_assets add column if not exists checklist_key text;
alter table public.media_assets drop constraint if exists media_checklist_key_ck;
alter table public.media_assets add constraint media_checklist_key_ck check (
  checklist_key is null or
  (owner_type = 'verification' and verification_id is not null and checklist_key in (
    'business_license', 'tax_certificate', 'bank_letter', 'food_safety',
    'haccp_or_brc', 'product_certs', 'export_license',
    'factory_address_confirmed', 'production_line_seen', 'warehouse_seen',
    'qc_lab_seen', 'documents_original', 'capacity_verified',
    'worker_interview', 'management_interview', 'photos_taken',
    'order_matched', 'shipping_proof', 'delivery_proof'
  ))
);

notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_factory_delivery_inline_evidence.sql


-- BEGIN supabase/migrations/20261017_product_featured_image.sql
-- Apply after the supplier-category/product-review migrations and before deploying featured-image selection.
-- Existing products keep their current first buyer-shareable image until staff picks a cover.
alter table public.supplier_products add column if not exists featured_media_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_products_featured_media_fk'
      and conrelid = 'public.supplier_products'::regclass) then
    alter table public.supplier_products add constraint supplier_products_featured_media_fk
      foreign key (featured_media_id) references public.media_assets(id) on delete set null;
  end if;
end $$;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_product_featured_image.sql


-- BEGIN supabase/migrations/20261017_product_reference_price_range.sql
-- Apply AFTER 20261017_certificate_publication_and_odm.sql and product_detail_price_visibility.sql.
-- Existing single prices remain unchanged (nullable upper bound, no backfill/auto-opt-in).

alter table public.supplier_products add column if not exists ref_price_max numeric(14,2);
alter table public.supplier_products drop constraint if exists supplier_products_price_range_ck;
alter table public.supplier_products add constraint supplier_products_price_range_ck check (
  ref_price_max is null or (ref_price is not null and ref_price > 0 and ref_price_max >= ref_price)
);
-- Append the new column to the existing public view; preserve its existing columns/order.
-- Every price projection requires product opt-in, supplier consent within 180 days,
-- buyer readiness, approval, an unexpired price, and a valid range.
create or replace view public.v_public_supplier_products as
select
  sp.id,
  sp.supplier_id,
  sp.slug,
  sp.name_i18n,
  coalesce(sp.name_i18n->>'en', sp.name)                as name,
  sp.specs,
  regexp_replace(
    regexp_replace(sp.description,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact via Vexim]', 'gi'),
    '(\+?[0-9][ ().-]?){9,15}[0-9]', '[contact via Vexim]', 'g') as description,
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
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.ref_price_max is null or sp.ref_price_max >= sp.ref_price)
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.ref_price end as ref_price,
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.ref_price_max is null or sp.ref_price_max >= sp.ref_price)
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.currency end as currency,
  sp.updated_at,
  case when sp.ready_for_buyer
    and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
    and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
    then regexp_replace(
    regexp_replace(sp.description_detail,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact via Vexim]', 'gi'),
    '(\+?[0-9][ ().-]?){9,15}[0-9]', '[contact via Vexim]', 'g') end as description_detail,
  sp.oem,
  sp.odm,
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and sp.ref_price_max >= sp.ref_price
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.ref_price_max end as ref_price_max
from public.supplier_products sp
join public.suppliers s on s.id = sp.supplier_id
where s.status = 'published'
  and not coalesce(s.is_demo, false)
  and sp.ready_for_buyer
  and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
  and (not sp.supplier_originated or exists (
    select 1 from public.categories c where c.slug = sp.reviewed_category_slug
      and c.status = 'published' and c.is_published
  ));
notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_product_reference_price_range.sql


-- BEGIN supabase/migrations/20261017_public_verification_summaries.sql
-- Apply after 20261017_verification_workflow.sql and 20261017_delivery_history_audit.sql.
-- Historical inspector-entered summaries remain private; no backfill or auto-publication.

alter table public.verifications
  add column if not exists public_summary_published_at timestamptz,
  add column if not exists public_summary_published_by uuid references public.app_users(id) on delete set null;
-- Publication is separate from approval of the review and cannot apply to drafts.
alter table public.verifications drop constraint if exists verification_summary_publish_ck;
alter table public.verifications add constraint verification_summary_publish_ck check (
  public_summary_published_at is null or
  (status = 'approved' and target_level in (2, 3) and nullif(btrim(public_summary_i18n->>'en'), '') is not null)
);

notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_public_verification_summaries.sql


-- BEGIN supabase/migrations/20261017_rfq_reply_notify.sql
-- RFQ email completion — run on existing Supabase installation BEFORE deploying code.
-- Idempotent. Requires public.rfqs, public.rfq_matches, public.email_messages.

-- Existing RFQ tables from the foundation migration may still have old statuses.
alter table public.rfqs add column if not exists lost_reason text;
alter table public.rfqs drop constraint if exists rfqs_status_check;
update public.rfqs set status = case status
  when 'qualified' then 'in_progress'
  when 'quoting' then 'matching'
  when 'closed' then 'lost'
  else status end
where status in ('qualified', 'quoting', 'closed');
update public.rfqs set lost_reason = 'legacy_unspecified'
where status = 'lost' and nullif(trim(lost_reason), '') is null;
alter table public.rfqs add constraint rfqs_status_check check (status in
  ('new','needs_review','in_progress','matching','quoted','sampling','won','lost','spam'));
alter table public.rfqs drop constraint if exists rfqs_lost_reason_check;
alter table public.rfqs add constraint rfqs_lost_reason_check check (
  status <> 'lost' or nullif(trim(lost_reason), '') is not null);

alter table public.email_messages
  add column if not exists rfq_id uuid references public.rfqs(id) on delete set null;
alter table public.email_messages
  add column if not exists rfq_match_id uuid references public.rfq_matches(id) on delete set null;
alter table public.email_messages add column if not exists rfc_message_id text;
alter table public.email_messages add column if not exists read_at timestamptz;
create index if not exists email_messages_rfq_idx
  on public.email_messages (rfq_id, created_at desc);
create unique index if not exists email_messages_buyer_status_once_idx
  on public.email_messages (rfq_id, stage) where kind = 'buyer_status_update';
alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind in
  ('auto','manual','inbound','rfq_outreach','rfq_followup','shortlist_buyer','buyer_status_update'));
alter table public.email_messages drop constraint if exists email_messages_status_check;
alter table public.email_messages add constraint email_messages_status_check check (status in
  ('draft','sent','failed','simulated','received'));


-- END supabase/migrations/20261017_rfq_reply_notify.sql


-- BEGIN supabase/migrations/20261017_sponsored_pilot.sql
-- STAGING-ONLY pilot infrastructure. Applying this migration does not enable a placement or billing.
-- Requires the existing supplier/product/category schema. No campaign is created by this file.
create table if not exists public.sponsored_pilot_campaigns (
  id uuid primary key default gen_random_uuid(),
  category_slug text not null,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paused')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  approved_by uuid references public.app_users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sponsored_pilot_window_ck check (ends_at > starts_at),
  constraint sponsored_pilot_approval_ck check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);
-- One explicit slot per category during the pilot, including future scheduled campaigns.
create unique index if not exists sponsored_pilot_one_approved_per_category
  on public.sponsored_pilot_campaigns (category_slug) where status = 'approved';
-- A supplier cannot be recorded as approving their own sponsored placement.
create or replace function public.check_sponsored_pilot_approver()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.status = 'approved' and not exists (
    select 1 from public.app_users u where u.id = new.approved_by
    and u.role = 'admin' and u.is_active
  ) then raise exception 'An active Vexim admin must approve the campaign'; end if;
  return new;
end;
$$;
drop trigger if exists sponsored_pilot_approver_ck on public.sponsored_pilot_campaigns;
create trigger sponsored_pilot_approver_ck before insert or update on public.sponsored_pilot_campaigns
  for each row execute function public.check_sponsored_pilot_approver();
revoke all on function public.check_sponsored_pilot_approver() from public, anon, authenticated;
alter table public.sponsored_pilot_campaigns enable row level security;
revoke all on public.sponsored_pilot_campaigns from public, anon, authenticated;
grant select, insert, update, delete on public.sponsored_pilot_campaigns to service_role;

create table if not exists public.sponsored_pilot_daily (
  campaign_id uuid not null references public.sponsored_pilot_campaigns(id) on delete cascade,
  day date not null,
  event_type text not null check (event_type in ('impression', 'click')),
  events bigint not null default 0 check (events >= 0),
  primary key (campaign_id, day, event_type)
);
alter table public.sponsored_pilot_daily enable row level security;
revoke all on public.sponsored_pilot_daily from public, anon, authenticated;
grant select, insert, update, delete on public.sponsored_pilot_daily to service_role;

-- Service-role only, atomic, rechecks campaign state/window at write time. No billing use.
create or replace function public.record_sponsored_pilot_event(p_campaign_id uuid, p_event_type text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_event_type not in ('impression', 'click') then raise exception 'Invalid sponsored event'; end if;
  if not exists (
    select 1 from public.sponsored_pilot_campaigns c where c.id = p_campaign_id
    and c.status = 'approved' and c.starts_at <= now() and c.ends_at > now()
  ) then return; end if;
  insert into public.sponsored_pilot_daily (campaign_id, day, event_type, events)
    values (p_campaign_id, (now() at time zone 'UTC')::date, p_event_type, 1)
  on conflict (campaign_id, day, event_type)
    do update set events = public.sponsored_pilot_daily.events + 1;
end;
$$;
revoke all on function public.record_sponsored_pilot_event(uuid, text) from public, anon, authenticated;
grant execute on function public.record_sponsored_pilot_event(uuid, text) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_sponsored_pilot.sql


-- BEGIN supabase/migrations/20261017_supplier_category_proposals.sql
-- Apply AFTER supplier product review migration and BEFORE deploying category proposal forms.
-- Supplier-proposed categories are private; staff links and product categories remain separate.
alter table public.suppliers
  add column if not exists requested_category_slugs text[] not null default '{}',
  add column if not exists requested_category_other text,
  add column if not exists categories_reviewed_at timestamptz;
alter table public.supplier_products
  add column if not exists supplier_category_proposal text,
  add column if not exists reviewed_category_slug text,
  add column if not exists supplier_originated boolean not null default false;
-- Pending supplier submissions from an earlier deployment remain gated after this migration.
update public.supplier_products set supplier_originated = true
  where supplier_review_status in ('draft', 'pending', 'changes_requested');
notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_supplier_category_proposals.sql


-- BEGIN supabase/migrations/20261017_supplier_dashboard.sql
-- Supplier portal dashboard. Run after supplier_self_registration and RFQ foundation migrations.
-- A clicked product is not an invitation: only an outreach with sent_to_supplier_at is supplier-visible.
alter table public.rfqs add column if not exists source_product_id uuid references public.supplier_products(id) on delete set null;
create index if not exists rfqs_source_product_idx on public.rfqs(source_product_id) where source_product_id is not null;
alter table public.rfq_matches add column if not exists response_due_at timestamptz;
alter table public.rfq_matches add column if not exists supplier_replied_at timestamptz;
create index if not exists rfq_matches_supplier_sent_idx on public.rfq_matches(supplier_id, sent_to_supplier_at desc)
  where sent_to_supplier_at is not null;

-- Read state belongs to one supplier, not to arbitrary CRM users. All access is through the server.
create table if not exists public.supplier_portal_notice_reads (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  notice_key text not null check (char_length(notice_key) between 1 and 100),
  read_at timestamptz not null default now(),
  primary key (supplier_id, notice_key)
);
alter table public.supplier_portal_notice_reads enable row level security;
revoke all on public.supplier_portal_notice_reads from anon, authenticated;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_supplier_dashboard.sql


-- BEGIN supabase/migrations/20261017_supplier_onboarding_gate.sql
-- Apply after supplier_self_registration and supplier_dashboard, before deploying the new flow.
-- Portal access is distinct from public listing status and individual verification outcomes.
alter table public.suppliers add column if not exists onboarding_status text not null default 'not_started';
alter table public.suppliers add column if not exists onboarding_note text;
alter table public.suppliers drop constraint if exists suppliers_onboarding_status_check;
alter table public.suppliers add constraint suppliers_onboarding_status_check
  check (onboarding_status in ('not_started','pending','approved','changes_requested'));
-- Old self-registered accounts already submitted a full application. Require explicit staff approval;
-- never grant portal access from a public listing or an approved document audit.
update public.suppliers s set onboarding_status = 'pending'
where s.onboarding_status = 'not_started' and exists (
  select 1 from public.app_users u where u.supplier_id = s.id and u.role = 'supplier'
) and s.tax_id is not null and s.products is not null;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_supplier_onboarding_gate.sql


-- BEGIN supabase/migrations/20261017_supplier_product_review.sql
-- Apply after supplier_onboarding_gate before deploying supplier-managed products.
-- Existing staff-managed products keep their previous readiness/publication behavior.
alter table public.supplier_products add column if not exists supplier_review_status text not null default 'approved';
alter table public.supplier_products add column if not exists supplier_review_note text;
alter table public.supplier_products drop constraint if exists supplier_products_supplier_review_status_check;
alter table public.supplier_products add constraint supplier_products_supplier_review_status_check
  check (supplier_review_status in ('draft','pending','approved','changes_requested'));
create index if not exists supplier_products_review_queue_idx
  on public.supplier_products(supplier_review_status, updated_at desc);
-- The application writes via service_role. Browser clients must not update moderation/publication flags directly.
notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_supplier_product_review.sql


-- BEGIN supabase/migrations/20261017_supplier_self_registration.sql
-- Run after 20261017_verification_workflow.sql and the audit-evidence migrations.
-- A supplier account is bound to exactly one supplier. Requests are NOT approvals.
-- App writes via the server-side service role; do not expose these tables to anon.
alter table public.app_users add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create unique index if not exists app_users_supplier_id_key
  on public.app_users(supplier_id) where supplier_id is not null;

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('admin','sale','sourcing','viewer','supplier'));

create table if not exists public.supplier_verification_requests (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  target_level smallint not null check (target_level in (2,3)),
  status text not null default 'requested' check (status in ('requested','contacted')),
  requested_at timestamptz not null default now(),
  contacted_at timestamptz,
  contacted_by uuid references public.app_users(id) on delete set null,
  primary key (supplier_id, target_level)
);
create index if not exists supplier_verification_requests_queue_idx
  on public.supplier_verification_requests(status, requested_at desc);
-- No direct browser/PostgREST access to private contact requests; the server uses service_role.
alter table public.supplier_verification_requests enable row level security;
revoke all on public.supplier_verification_requests from anon, authenticated;

-- Existing supplier rows, app users and approved audits are not modified.
notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_supplier_self_registration.sql


-- BEGIN supabase/migrations/20261017_supplier_traffic_daily.sql
-- Apply after the supplier portal migrations, before enabling the traffic dashboard.
-- Page-view totals only: no IP, user-agent, referrer, visitor ID or buyer data is stored.
create table if not exists public.supplier_traffic_daily (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  day date not null,
  page_kind text not null check (page_kind in ('profile', 'product')),
  resource_id uuid not null,
  views bigint not null default 0 check (views >= 0),
  primary key (supplier_id, day, page_kind, resource_id)
);
create index if not exists supplier_traffic_daily_day_idx on public.supplier_traffic_daily (day);
alter table public.supplier_traffic_daily enable row level security;
revoke all on public.supplier_traffic_daily from public, anon, authenticated;
grant select, insert, update, delete on public.supplier_traffic_daily to service_role;

-- Atomic increment; service_role only. The app checks public eligibility before calling it.
create or replace function public.record_supplier_page_view(p_supplier_id uuid, p_page_kind text, p_resource_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_page_kind not in ('profile', 'product') or p_supplier_id is null or p_resource_id is null then
    raise exception 'Invalid page view';
  end if;
  insert into public.supplier_traffic_daily (supplier_id, day, page_kind, resource_id, views)
    values (p_supplier_id, (now() at time zone 'UTC')::date, p_page_kind, p_resource_id, 1)
  on conflict (supplier_id, day, page_kind, resource_id)
    do update set views = public.supplier_traffic_daily.views + 1;
end;
$$;
revoke all on function public.record_supplier_page_view(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_supplier_page_view(uuid, text, uuid) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_supplier_traffic_daily.sql


-- BEGIN supabase/migrations/20261017_temporary_self_verification_approval.sql
-- Temporary exception: an admin who inspected a supplier may also approve
-- the same submitted verification. Only the four-eyes CHECK is removed;
-- existing rows, status rules, inspector_id and approved_by are untouched.
-- Apply to the production Supabase project BEFORE deploying the matching app code.

alter table public.verifications drop constraint if exists verifications_four_eyes;

notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_temporary_self_verification_approval.sql


-- BEGIN supabase/migrations/20261017_verification_workflow.sql
-- Verification L1/L2 fields used by CRM checklist and factory visit.
-- Run against the same Supabase project as the app BEFORE deploying the UI.
-- Safe to rerun; does not mark any supplier as verified.

alter table public.verifications
  add column if not exists checklist_notes jsonb not null default '{}'::jsonb,
  add column if not exists visit_lat double precision,
  add column if not exists visit_lng double precision,
  add column if not exists visit_address text,
  add column if not exists return_reason text;

-- The legacy schema default was an empty array; new checklists are keyed objects.
alter table public.verifications alter column checklist set default '{}'::jsonb;
update public.verifications set checklist = '{}'::jsonb
where checklist = '[]'::jsonb;

-- Files attached to an individual review must be linkable to that review.
-- Existing media_assets only allowed product/supplier and had no verification_id.
alter table public.media_assets add column if not exists verification_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'media_assets_verification_id_fkey'
    and conrelid = 'public.media_assets'::regclass) then
    alter table public.media_assets add constraint media_assets_verification_id_fkey
      foreign key (verification_id) references public.verifications(id) on delete cascade;
  end if;
end $$;
alter table public.media_assets drop constraint if exists media_assets_owner_type_check;
alter table public.media_assets add constraint media_assets_owner_type_check
  check (owner_type in ('product','supplier','verification'));
alter table public.media_assets drop constraint if exists media_owner_ck;
alter table public.media_assets add constraint media_owner_ck check (
  (owner_type = 'product' and product_id is not null and verification_id is null) or
  (owner_type = 'supplier' and supplier_id is not null and product_id is null and verification_id is null) or
  (owner_type = 'verification' and verification_id is not null and supplier_id is not null
    and product_id is null and audience = 'internal')
);
create index if not exists media_verification_idx
  on public.media_assets (verification_id, created_at desc)
  where verification_id is not null;


notify pgrst, 'reload schema';

-- END supabase/migrations/20261017_verification_workflow.sql


-- BEGIN supabase/migrations/20261018_category_product_attributes.sql
-- Run before deploying category-defined product attributes. No existing product is altered.

alter table public.categories add column if not exists product_fields jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';

-- END supabase/migrations/20261018_category_product_attributes.sql


-- BEGIN supabase/migrations/20261018_product_english_translation.sql
-- Bản dịch tiếng Anh tự động (AI) cho nội dung sản phẩm do nhà cung cấp đăng.
-- Nội dung gốc tiếng Việt giữ nguyên trong các cột name/description/spec/...;
-- bản tiếng Anh lưu ở các cột *_i18n dạng jsonb {"en": "..."} để trang buyer ưu tiên hiển thị.
-- translation_meta giữ hash của nội dung gốc tại thời điểm dịch, thời điểm dịch,
-- nguồn dịch (ai | staff) và model đã dùng, nhằm phát hiện bản dịch đã cũ khi NCC sửa nội dung.
alter table public.supplier_products add column if not exists name_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists description_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists description_detail_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists spec_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists packaging_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists certifications_i18n jsonb not null default '{}'::jsonb;
alter table public.supplier_products add column if not exists translation_meta jsonb;

notify pgrst, 'reload schema';

-- END supabase/migrations/20261018_product_english_translation.sql


-- BEGIN supabase/migrations/20261018_review_lead_role.sql
-- Apply after 20261017_supplier_self_registration.sql, before assigning the reviewer role.
-- No account is reassigned automatically. Run on the Supabase project used by the app.

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('admin','sale','sourcing','reviewer','viewer','supplier'));

-- Drop the old constraint first: even NOT VALID constraints reject updates to
-- legacy self-approved rows. This transaction installs the new one before commit.
alter table public.verifications drop constraint if exists verifications_four_eyes;

-- Retain the old self-approved rows without blocking edits to their public summaries.
-- Only rows self-approved BEFORE this migration receive the explicit legacy marker.
alter table public.verifications
  add column if not exists legacy_self_approved boolean not null default false;
update public.verifications set legacy_self_approved = true
  where status = 'approved' and inspector_id = approved_by and approved_by is not null
    and legacy_self_approved = false;

-- Restore separation for new approvals; NOT VALID keeps other historical rows intact.
-- New approvals also need a real inspector. Only pre-existing exceptions can stay self-approved.
alter table public.verifications add constraint verifications_four_eyes
  check (approved_by is null or (inspector_id is not null and
    (inspector_id <> approved_by or legacy_self_approved))) not valid;


notify pgrst, 'reload schema';

-- END supabase/migrations/20261018_review_lead_role.sql


-- BEGIN supabase/migrations/20261018_supplier_intro_source.sql
-- Phần giới thiệu do nhà cung cấp tự viết (câu chuyện, điểm khác biệt của công ty/sản phẩm),
-- lưu nguyên văn ngôn ngữ gốc tại intro_source. Bản tiếng Anh hiển thị cho buyer nằm ở
-- summary_i18n.en, do AI dịch từ intro_source; profile_translation_meta.summary_source_hash
-- cho biết khi nào cần dịch lại. Dữ liệu cũ: lấy phần giới thiệu tiếng Anh đã có làm bản gốc
-- để không mất nội dung nhà cung cấp đã viết trước đây.
alter table public.suppliers add column if not exists intro_source text;

update public.suppliers
set intro_source = summary_i18n ->> 'en'
where intro_source is null
  and coalesce(summary_i18n ->> 'en', '') <> '';

notify pgrst, 'reload schema';

-- END supabase/migrations/20261018_supplier_intro_source.sql


-- BEGIN supabase/migrations/20261018_supplier_profile_english_translation.sql
-- Bản tiếng Anh cho các nội dung hồ sơ nhà cung cấp hiển thị trên trang buyer:
-- MOQ dạng chữ (moq_text_i18n) và thị trường xuất khẩu (export_markets_i18n) do AI dịch
-- từ nội dung gốc nhà cung cấp nhập; profile_translation_meta giữ hash nội dung gốc
-- tại thời điểm dịch để phát hiện bản dịch đã cũ, kèm cờ summary_generated khi phần
-- giới thiệu tiếng Anh do AI soạn vì nhà cung cấp để trống.
alter table public.suppliers add column if not exists moq_text_i18n jsonb not null default '{}'::jsonb;
alter table public.suppliers add column if not exists export_markets_i18n jsonb not null default '{}'::jsonb;
alter table public.suppliers add column if not exists profile_translation_meta jsonb;

notify pgrst, 'reload schema';

-- END supabase/migrations/20261018_supplier_profile_english_translation.sql


-- BEGIN supabase/migrations/20261018_vexim_site_traffic.sql
-- Apply AFTER 20261017_supplier_traffic_daily.sql on the same Supabase project.
-- No IP, cookie, visitor identifier, referrer, query string, or RFQ token is stored.
-- This table holds only non-supplier public page counts; supplier profile/product
-- counts remain in supplier_traffic_daily and are UNIONed on read (no double count).
create table if not exists public.vexim_site_traffic_daily (
  day date not null,
  page_key text not null check (length(page_key) between 1 and 120),
  views bigint not null default 0 check (views >= 0),
  primary key (day, page_key)
);
alter table public.vexim_site_traffic_daily enable row level security;
revoke all on public.vexim_site_traffic_daily from public, anon, authenticated;
grant select, insert, update on public.vexim_site_traffic_daily to service_role;

create or replace function public.record_vexim_site_page_view(p_page_key text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_page_key not in ('home', 'rfq', 'blog', 'cashew', 'compare', 'for-suppliers', 'how-we-verify')
    and p_page_key !~ '^(category|article):[a-z0-9][a-z0-9-]{0,99}$' then
    raise exception 'Invalid public page key';
  end if;
  insert into public.vexim_site_traffic_daily (day, page_key, views)
    values ((now() at time zone 'UTC')::date, p_page_key, 1)
  on conflict (day, page_key) do update set views = public.vexim_site_traffic_daily.views + 1;
end;
$$;
revoke all on function public.record_vexim_site_page_view(text) from public, anon, authenticated;
grant execute on function public.record_vexim_site_page_view(text) to service_role;

create or replace function public.read_vexim_site_traffic(p_days integer)
returns table(day date, page_key text, views bigint)
language plpgsql security invoker set search_path = public as $$
begin
  if p_days not in (7, 30, 90) then raise exception 'Invalid date range'; end if;
  return query
  select v.day, v.page_key, v.views from public.vexim_site_traffic_daily v
    where v.day >= (now() at time zone 'UTC')::date - (p_days - 1)
  union all
  select s.day,
    case when s.page_kind = 'profile' then 'supplier_profile' else 'product_detail' end as page_key,
    sum(s.views)::bigint as views
  from public.supplier_traffic_daily s
    where s.day >= (now() at time zone 'UTC')::date - (p_days - 1)
  group by s.day, s.page_kind;
end;
$$;
revoke all on function public.read_vexim_site_traffic(integer) from public, anon, authenticated;
grant execute on function public.read_vexim_site_traffic(integer) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261018_vexim_site_traffic.sql


-- BEGIN supabase/migrations/20261020_supplier_self_verification_submissions.sql
-- Cổng NHÀ CUNG CẤP TỰ GỬI bằng chứng xác thực:
--   L2: 9 ảnh nhà máy (định vị, ban ngày, ảnh gốc, mã xác minh viết tay cho ảnh 🔖)
--   L3: chứng từ lịch sử xuất khẩu + link nguồn công khai
--
-- Chạy trong SQL Editor của ĐÚNG Supabase project, TRƯỚC khi deploy code mới.
-- Migration idempotent: chạy lại không phá dữ liệu. KHÔNG tự duyệt hồ sơ nào:
-- huy hiệu L2/L3 vẫn chỉ đến từ một đợt kiểm `verifications` do nhân viên Vexim
-- lập và được người CÓ QUYỀN DUYỆT KHÁC phê (constraint bốn mắt sẵn có).

-- ---------------------------------------------------------------------------
-- 1. Hồ sơ tự gửi (mỗi NCC tối đa một hồ sơ đang mở cho mỗi cấp)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_submissions (
  id                  uuid primary key default gen_random_uuid(),
  supplier_id         uuid not null references public.suppliers(id) on delete cascade,
  target_level        smallint not null check (target_level in (2,3)),
  status              text not null default 'draft'
                        check (status in ('draft','pending_review','returned','accepted')),
  created_by          uuid references public.app_users(id) on delete set null,
  -- Mã xác minh Vexim phát hành; NCC chép tay lên giấy và chụp cùng ảnh 🔖.
  verification_code   text check (verification_code is null or (
                        char_length(verification_code) between 8 and 24 and
                        verification_code ~ '^[A-Z0-9-]+$')),
  code_issued_at      timestamptz,
  -- Vị trí trình duyệt báo lúc chụp (đối chiếu GPS trong EXIF ảnh).
  device_lat          double precision,
  device_lng          double precision,
  device_accuracy_m   double precision,
  device_captured_at  timestamptz,
  -- L3: lô hàng NCC TỰ KHAI. Không phải dữ liệu Hải quan, không tự xác minh.
  shipment_ref        text,
  shipped_on          date,
  shipment_destination text,
  supplier_note       text check (supplier_note is null or char_length(supplier_note) <= 2000),
  -- Cờ đối chứng (EXIF/GPS/thời điểm/AI). Không phải kết luận đạt/không đạt.
  flags               jsonb not null default '[]'::jsonb,
  ai_review           jsonb,
  ai_scanned_at       timestamptz,
  submitted_at        timestamptz,
  reviewed_by         uuid references public.app_users(id) on delete set null,
  reviewed_at         timestamptz,
  review_note         text,
  -- Đợt kiểm của nhân viên Vexim tạo ra khi chấp thuận hồ sơ.
  verification_id     uuid references public.verifications(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists supplier_submissions_supplier_idx
  on public.supplier_submissions (supplier_id, target_level, updated_at desc);
create index if not exists supplier_submissions_queue_idx
  on public.supplier_submissions (status, submitted_at desc);
-- Mỗi NCC chỉ có MỘT hồ sơ chưa được chấp thuận cho mỗi cấp, tránh spam hàng đợi.
create unique index if not exists supplier_submissions_one_open_per_level
  on public.supplier_submissions (supplier_id, target_level)
  where status <> 'accepted';
alter table public.supplier_submissions enable row level security;
revoke all on public.supplier_submissions from anon, authenticated;

drop trigger if exists supplier_submissions_touch on public.supplier_submissions;
create trigger supplier_submissions_touch before update on public.supplier_submissions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Từng ảnh / chứng từ của hồ sơ, gắn đúng mục bắt buộc
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_submission_items (
  id                 uuid primary key default gen_random_uuid(),
  submission_id      uuid not null references public.supplier_submissions(id) on delete cascade,
  supplier_id        uuid not null references public.suppliers(id) on delete cascade,
  checklist_key      text not null,
  media_id           uuid references public.media_assets(id) on delete set null,
  storage_path       text,
  thumb_path         text,
  -- EXIF đọc từ ẢNH GỐC ở server (không tin giá trị client tự khai).
  exif_lat           double precision,
  exif_lng           double precision,
  exif_captured_at   timestamptz,
  exif_camera_make   text,
  exif_camera_model  text,
  exif_software      text,
  has_exif           boolean not null default false,
  mime               text,
  bytes              integer,
  width              integer,
  height             integer,
  -- GPS + thời điểm trình duyệt báo đúng lúc chụp ảnh này (client, cần đối chiếu).
  capture_lat        double precision,
  capture_lng        double precision,
  capture_accuracy_m double precision,
  captured_at        timestamptz,
  flags              jsonb not null default '[]'::jsonb,
  ai_verdict         text check (ai_verdict is null or ai_verdict in ('pass','fail','uncertain')),
  ai_reason          text,
  ai_detected_text   text,
  ai_code_visible    boolean,
  ai_code_read       text,
  uploaded_at        timestamptz not null default now()
);
create index if not exists supplier_submission_items_submission_idx
  on public.supplier_submission_items (submission_id, uploaded_at);
create index if not exists supplier_submission_items_supplier_idx
  on public.supplier_submission_items (supplier_id, checklist_key);
-- Chỉ nhận đúng key của hai checklist; key lạ bị DB từ chối.
alter table public.supplier_submission_items drop constraint if exists supplier_submission_items_key_ck;
alter table public.supplier_submission_items add constraint supplier_submission_items_key_ck check (
  checklist_key in (
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe',
    'pest_control',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health'
  )
);
alter table public.supplier_submission_items enable row level security;
revoke all on public.supplier_submission_items from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Link nguồn công khai (L3): chỉ domain trong allowlist mới được máy chủ quét
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_submission_links (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.supplier_submissions(id) on delete cascade,
  url            text not null check (char_length(url) between 8 and 800),
  label          text check (label is null or char_length(label) <= 200),
  allowed_source boolean not null default false,
  fetched_at     timestamptz,
  fetch_status   text not null default 'pending'
                   check (fetch_status in ('pending','fetched','blocked','failed','manual')),
  fetch_note     text,
  created_by     uuid references public.app_users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists supplier_submission_links_submission_idx
  on public.supplier_submission_links (submission_id, created_at);
alter table public.supplier_submission_links enable row level security;
revoke all on public.supplier_submission_links from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Bằng chứng của hồ sơ tự gửi lưu trong media_assets (audience='internal'),
--    cần mở rộng CHECK checklist_key cho 9 ảnh L2 và 6 chứng từ L3.
--    Tệp cũ không bị sửa.
--    LƯU Ý: bản migration này từng giả định ghi id hồ sơ tự gửi vào
--    media_assets.verification_id — SAI, vì cột đó có khoá ngoại tới
--    verifications(id). 20261031_supplier_submission_media_owner.sql thêm
--    owner_type='submission' + cột submission_id và định nghĩa lại hai CHECK
--    bên dưới. Luôn chạy migration đó sau file này.
-- ---------------------------------------------------------------------------
alter table public.media_assets drop constraint if exists media_checklist_key_ck;
alter table public.media_assets add constraint media_checklist_key_ck check (
  checklist_key is null or
  (owner_type = 'verification' and verification_id is not null and checklist_key in (
    'business_license', 'tax_certificate', 'bank_letter', 'food_safety',
    'haccp_or_brc', 'product_certs', 'export_license',
    'factory_address_confirmed', 'production_line_seen', 'warehouse_seen',
    'qc_lab_seen', 'documents_original', 'capacity_verified',
    'worker_interview', 'management_interview', 'photos_taken',
    'order_matched', 'shipping_proof', 'delivery_proof',
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe',
    'pest_control',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health'
  ))
);


notify pgrst, 'reload schema';

-- Kiểm tra nhanh sau khi chạy:
-- select table_name from information_schema.tables where table_schema='public'
--   and table_name in ('supplier_submissions','supplier_submission_items','supplier_submission_links');
-- Mong đợi 3 dòng.

-- END supabase/migrations/20261020_supplier_self_verification_submissions.sql


-- BEGIN supabase/migrations/20261021_category_parent_group_nuts.sql
-- ============================================================================
--  VEXIM TRADE – CÂY DANH MỤC 2 CẤP: BỔ SUNG DANH MỤC LỚN (NHÓM CHA)
--  Ngày: 21/10/2026
--
--  Bối cảnh
--    Trang công khai trước đây chỉ có một cấp: cashew được seed là danh mục gốc
--    (parent_id = null) nên buyer không thấy "Danh mục lớn" bao quanh nó.
--    Nay Vexim dùng cây 2 cấp:
--        Danh mục lớn (nhóm cha)  →  Nhóm nhỏ (danh mục con)  →  bộ lọc thông số
--
--    Migration này:
--      1. Tạo Danh mục lớn "nuts-kernels" (Hạt dinh dưỡng / Nuts & kernels) nếu chưa có.
--      2. Đưa cashew + macadamia vào nhóm cha đó — CHỈ khi chúng chưa có cha
--         (không ghi đè quyết định đã chốt trong CRM).
--      3. Khai báo "Trường dữ liệu cho từng sản phẩm" (product_fields) cho cashew
--         nếu đang trống, để bộ lọc thông số (grade) hoạt động và sửa được trong CRM.
--      4. Điền giá trị grade còn thiếu từ tên sản phẩm (W180/W240/W320/W450/SW/WS/LP/SP).
--
--    Toàn bộ idempotent: chạy lại nhiều lần không nhân đôi dữ liệu, không ghi đè
--    nội dung do nhân viên đã sửa trong CRM.
-- ============================================================================


-- 1. Danh mục lớn (nhóm cha) -------------------------------------------------

insert into public.categories (
  slug, parent_id, name_i18n, intro_i18n, h1_i18n, seo_title_i18n, seo_desc_i18n,
  homepage_kicker_i18n, active_on_homepage, seo_indexable, status, is_published, sort_order
)
values (
  'nuts-kernels',
  null,
  '{"en": "Nuts & kernels", "vi": "Hạt dinh dưỡng"}'::jsonb,
  '{"en": "Vietnamese cashew kernels, macadamia and processed nutritional nuts from factories Vexim has checked.", "vi": "Nhân điều, mắc ca và các loại hạt dinh dưỡng chế biến từ nhà máy đã được Vexim kiểm tra tại Việt Nam."}'::jsonb,
  '{"en": "Nutritional nuts & kernels from Vietnam", "vi": "Hạt dinh dưỡng & nhân hạt xuất khẩu Việt Nam"}'::jsonb,
  '{"en": "Nuts & Kernels Suppliers in Vietnam | Cashew, Macadamia | Vexim Trade"}'::jsonb,
  '{"en": "Compare verified Vietnamese nut and kernel suppliers by sub-category, grade, MOQ and certification. Request a quote from a supplier you choose, or send your requirements and Vexim will shortlist suppliers that match."}'::jsonb,
  '{"en": "Cashew, macadamia & processed nuts", "vi": "Điều, mắc ca & hạt chế biến"}'::jsonb,
  true,     -- bật thẻ trên trang chủ: các nhóm nhỏ nằm gọn bên trong thẻ này
  false,    -- bật lập chỉ mục sau khi nội dung ngành đã chốt
  'published',
  true,
  10
)
on conflict (slug) do nothing;

-- 2. Đưa các nhóm nhỏ vào nhóm cha (chỉ khi chưa có cha) ---------------------

update public.categories child
set parent_id = parent.id,
    updated_at = now()
from public.categories parent
where parent.slug = 'nuts-kernels'
  and child.slug in ('cashew', 'macadamia')
  and child.parent_id is null;

-- Nhóm nhỏ macadamia (nếu chưa có) — để danh mục lớn có nhiều hơn một nhóm nhỏ.
insert into public.categories (
  slug, parent_id, name_i18n, intro_i18n, status, is_published, sort_order
)
select
  'macadamia',
  parent.id,
  '{"en": "Macadamia", "vi": "Mắc ca"}'::jsonb,
  '{"en": "Vietnamese macadamia kernels and in-shell nuts from Central Highlands plantations.", "vi": "Nhân mắc ca và mắc ca nguyên vỏ từ vùng nguyên liệu Tây Nguyên."}'::jsonb,
  'published',
  true,
  12
from public.categories parent
where parent.slug = 'nuts-kernels'
on conflict (slug) do nothing;

-- 3. Bộ lọc thông số của nhóm nhỏ cashew -------------------------------------
--    Chỉ điền khi nhân viên chưa khai báo trường nào trong CRM.

update public.categories
set product_fields = '[
  {"key": "grade", "label": "Grade", "type": "select", "filterable": true,
   "options": ["W180", "W240", "W320", "W450", "SW", "WS", "LP", "SP"]}
]'::jsonb,
    updated_at = now()
where slug = 'cashew'
  and (product_fields is null or product_fields = '[]'::jsonb);

-- 4. Điền grade còn thiếu từ tên sản phẩm (không ghi đè giá trị đã có) -------

update public.supplier_products sp
set specs = coalesce(sp.specs, '{}'::jsonb) || jsonb_build_object('grade', match.code),
    updated_at = now()
from (
  select
    p.id,
    (regexp_match(upper(coalesce(nullif(p.name_i18n ->> 'en', ''), p.name)),
       '(W180|W240|W320|W450|SW|WS|LP|SP)'))[1] as code
  from public.supplier_products p
) match
where sp.id = match.id
  and match.code is not null
  and coalesce(sp.specs ->> 'grade', '') = '';


-- Sau khi chạy:
--   * /crm/categories: "Nuts & kernels" là Danh mục lớn, cashew + macadamia là nhóm nhỏ.
--   * /products/nuts-kernels: trang Danh mục lớn liệt kê các nhóm nhỏ và gộp sản phẩm.
--   * /products/cashew: có bộ lọc Grade lấy từ "Trường dữ liệu cho từng sản phẩm".

-- END supabase/migrations/20261021_category_parent_group_nuts.sql


-- BEGIN supabase/migrations/20261021_l1_certificate_ai_scan.sql
-- Chứng nhận HỢP NHẤT vào luồng L1 (21/10/2026) — AI quét tệp, tự công bố kèm nhãn, nhắc hết hạn:
--   * NCC (hoặc nhân viên) tải giấy chứng nhận lên ngay trong luồng Kiểm tra giấy tờ L1;
--     không còn biểu mẫu khai tay tên/đơn vị/phạmvi/sản phẩm của luồng chứng nhận cũ.
--   * AI đọc NỘI DUNG TỆP: tên giấy, đơn vị đứng tên, tổ chức cấp, số, ngày hết hạn.
--     holder_match: 'owner' = chính chủ (đứng tên đúng NCC), 'partner' = đứng tên đơn vị
--     đối tác (nhà máy/đại lý...), 'unclear' = không đọc được/không xác định.
--   * TỰ CÔNG BỐ (không cần nhân viên bấm duyệt): holder_match owner/partner + còn hạn +
--     ai_confidence <> 'low' => review_status='approved', publicly_visible=true. Nhãn hiển
--     thị trên trang NCC công khai kèm ngày hết hạn.
--   * staff_hidden là PHANH an toàn của nhân viên: ẩn khỏi trang công khai mà không đổi
--     kết quả xét duyệt; AI quét lại KHÔNG tự bỏ ẩn.
--   * expiry_notified lưu các mốc nhắc hết hạn đã gửi ({"d60": iso, "d30": iso, ...}) cho
--     cron /api/cron/certificate-expiry — idempotent, mỗi mốc gửi đúng 1 email. NCC tải bản
--     mới => valid_until đổi => các mốc được đặt lại từ đầu.
--
-- Chạy trong SQL Editor của ĐÚNG Supabase project, TRƯỚC khi deploy code mới.
-- Idempotent: chạy lại không phá dữ liệu. Dữ liệu chứng nhận cũ (kể cả approved_product_ids
-- của luồng theo sản phẩm) được GIỮ NGUYÊN để đối soát — code mới không đọc nữa.

alter table public.certificates
  add column if not exists holder_match text,
  add column if not exists ai_scanned_at timestamptz,
  add column if not exists ai_summary text,
  add column if not exists ai_confidence text,
  add column if not exists source text not null default 'manual',
  add column if not exists checklist_key text,
  -- Không khoá ngoại: chỉ là tham chiếu mềm tới đợt kiểm L1 sinh ra hồ sơ (giữ khi xoá đợt kiểm).
  add column if not exists verification_id uuid,
  add column if not exists staff_hidden boolean not null default false,
  add column if not exists expiry_notified jsonb not null default '{}'::jsonb;

alter table public.certificates drop constraint if exists certificates_holder_match_check;
alter table public.certificates add constraint certificates_holder_match_check
  check (holder_match is null or holder_match in ('owner','partner','unclear'));
alter table public.certificates drop constraint if exists certificates_ai_confidence_check;
alter table public.certificates add constraint certificates_ai_confidence_check
  check (ai_confidence is null or ai_confidence in ('low','medium','high'));
alter table public.certificates drop constraint if exists certificates_source_check;
alter table public.certificates add constraint certificates_source_check
  check (source in ('manual','l1-supplier','l1-staff'));

-- Cron nhắc hết hạn quét theo ngày hiệu lực.
create index if not exists certificates_valid_until_idx on public.certificates (valid_until);


-- END supabase/migrations/20261021_l1_certificate_ai_scan.sql


-- BEGIN supabase/migrations/20261021_seafood_category_buyer_first_copy.sql
-- ============================================================================
--  VEXIM TRADE – FAQ DANH MỤC THỦY SẢN THEO LUỒNG "BUYER LIÊN HỆ NCC TRƯỚC"
--  Ngày: 21/10/2026
--
--  Bối cảnh
--    Luồng mua hàng của Vexim đổi thứ tự: buyer đi xem hàng trên kệ trước.
--    Mỗi trang sản phẩm đã có sẵn nút gửi yêu cầu tới đúng nhà cung cấp đó
--    (/rfq?...&suppliers=<supplier_id>), nên buyer liên hệ thẳng với NCC.
--    Vexim chỉ vào cuộc khi buyer không tìm được sản phẩm như ý, hoặc mặt hàng
--    đó chưa có trên sàn.
--
--    Bộ FAQ cũ của danh mục thủy sản vẫn kể theo lối "gửi yêu cầu cho Vexim,
--    Vexim đi ghép nhiều NCC" nên sai thứ tự. Migration này thay bằng 6 câu
--    hỏi buyer thật sự đặt ra khi đi theo luồng mới.
--
--  An toàn khi chạy lại
--    Chỉ ghi đè khi FAQ hiện tại còn trống hoặc vẫn là bộ câu hỏi cũ
--    ("Can I get quotes from multiple seafood suppliers in Vietnam at once?").
--    Nếu nhân viên đã sửa FAQ trong CRM thì câu lệnh không làm gì cả.
-- ============================================================================


update public.categories
set
  faq_i18n = $json$[
    {
      "q": "Can I send my request to a specific supplier?",
      "a": "Yes. Open the product page and send your request from there. It goes to that supplier first, not to us. If they cannot meet it, we ask you before suggesting anyone else."
    },
    {
      "q": "The grade or the packing I need is not on the page. What then?",
      "a": "Send us the details through the request form. Seafood buyers often ask for a glaze level, an IQF or block frozen format, or a private label pack that the current listings do not show. We check producers outside these pages and reply within one business day. If nothing fits, we say so instead of offering a near match."
    },
    {
      "q": "I do not know which supplier to pick. Can you choose for me?",
      "a": "Yes. Say that in your request and we match suppliers on your specs, quantity and market, then send you their quotes to compare. Paid listings never affect who we recommend."
    },
    {
      "q": "Does it cost anything, and do I need an account?",
      "a": "No account and no fee. Browsing, writing to suppliers and sending a request are free for buyers. If your order needs paid work, such as a pre-shipment inspection or a factory visit, you get the price first and decide."
    },
    {
      "q": "Who do I pay, and who do I sign with?",
      "a": "The supplier. The contract and the payment are between you and them. We do not hold your money, and the payment terms are the ones written in their quotation."
    },
    {
      "q": "How do I check a supplier before I write to them?",
      "a": "Read the badge on their profile. It shows what we actually checked: business registration, quality certificates with the holder name and expiry date, factory evidence and past export shipments. Anything we have not checked is not shown as checked."
    }
  ]$json$::jsonb,
  updated_at = now()
where slug = 'seafood-processed-fisheries-products'
  and (
    faq_i18n is null
    or jsonb_typeof(faq_i18n) <> 'array'
    or jsonb_array_length(faq_i18n) = 0
    or faq_i18n::text like '%multiple seafood suppliers%'
  );


-- END supabase/migrations/20261021_seafood_category_buyer_first_copy.sql


-- BEGIN supabase/migrations/20261022_seafood_intro_body_buyer_first.sql
-- ============================================================================
--  VEXIM TRADE – INTRO VÀ BODY DANH MỤC THỦY SẢN THEO LUỒNG BUYER LIÊN HỆ NCC
--  Ngày: 22/10/2026
--
--  Bối cảnh
--    Migration 20261021 đã thay bộ FAQ thủy sản sang luồng buyer liên hệ nhà
--    cung cấp trước. Hai phần còn lại của danh mục vẫn kể theo lối cũ nên trang
--    tự mâu thuẫn: FAQ nói "gửi thẳng cho nhà cung cấp", còn intro và khối
--    About this category vẫn nói "so sánh nhiều nhà cung cấp, Vexim điều phối".
--
--    Migration này sửa hai phần đó, giữ nguyên faq_i18n đã chạy.
--
--  An toàn khi chạy lại
--    Mỗi câu lệnh có điều kiện riêng, chỉ ghi đè khi nội dung vẫn là bản cũ.
--    Nếu nhân viên đã sửa trong CRM thì câu lệnh tương ứng không làm gì.
--    Hai câu lệnh độc lập: chỉ muốn đổi body thì xoá câu lệnh số 1 và commit.
--
--  Ghi chú kỹ thuật
--    Dùng toán tử || để chỉ ghi đè khóa en và vi, giữ nguyên các ngôn ngữ khác
--    nếu sau này có thêm.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. intro_i18n: một câu "so sánh và yêu cầu báo giá" thành ba câu theo luồng mới
-- ---------------------------------------------------------------------------
update public.categories
set
  intro_i18n = coalesce(intro_i18n, '{}'::jsonb) || jsonb_build_object(
    'en', $en$Vietnamese seafood and processed fisheries suppliers, listed with the paperwork we have checked. Open a product, read the spec, and send your request straight to the supplier. If what you need is not on this page, tell us and we look at producers outside these pages.$en$,
    'vi', $vi$Nhà cung cấp thủy sản và thủy sản chế biến Việt Nam, kèm hồ sơ giấy tờ đã được kiểm tra. Mở một sản phẩm, đọc quy cách, rồi gửi yêu cầu thẳng cho nhà cung cấp đó. Nếu mặt hàng bạn cần chưa có trên trang, cho chúng tôi biết và chúng tôi tìm cả những nhà máy chưa lên sàn.$vi$
  ),
  updated_at = now()
where slug = 'seafood-processed-fisheries-products'
  and coalesce(intro_i18n->>'en', '') like '%Compare their products and request quotations%';

-- ---------------------------------------------------------------------------
-- 2. body_i18n: bốn đoạn văn phong máy thành bốn đoạn ngắn, bỏ lối Vexim đứng giữa
-- ---------------------------------------------------------------------------
update public.categories
set
  body_i18n = coalesce(body_i18n, '{}'::jsonb) || jsonb_build_object(
    'en', $en$<p>The category covers what Vietnamese coastal plants and aquaculture farms ship: frozen shrimp, pangasius fillets, squid, and processed items packed for retail or industrial use.</p><p>Most listings are graded by count per pound or by size class, and the packing decides as much as the grade. Glaze level, IQF against block frozen, and carton weight change what actually arrives, so ask for those in writing before you compare prices.</p><p>Paperwork depends on where the container is going. Health certificates, catch or farm documents and customs papers are set by the importing country, and the supplier confirms which ones they can issue. Nothing on this page is a promise that a document will be accepted at your border.</p><p>If you already know the spec, go straight to the supplier page. If you do not, send the details to us and we look outside these pages.</p>$en$,
    'vi', $vi$<p>Danh mục này gồm những gì các nhà máy ven biển và cơ sở nuôi trồng Việt Nam xuất đi: tôm đông lạnh, cá tra phi lê, mực, và hàng chế biến đóng gói cho bán lẻ hoặc cho công nghiệp.</p><p>Phần lớn hàng được phân cỡ theo số con trên pound hoặc theo cỡ, và cách đóng gói quyết định ngang với cỡ. Tỷ lệ áo băng, IQF hay đông block, và trọng lượng thùng hàng thay đổi thứ thực sự đến tay bạn, nên yêu cầu ghi rõ mấy mục đó trước khi so giá.</p><p>Giấy tờ phụ thuộc vào nơi container đến. Giấy chứng nhận y tế, giấy chứng nhận khai thác hoặc nuôi trồng và giấy hải quan do nước nhập khẩu quy định, nhà cung cấp xác nhận họ cấp được những loại nào. Không có gì trên trang này là cam kết rằng giấy tờ sẽ được chấp nhận ở cửa khẩu của bạn.</p><p>Nếu bạn đã rõ quy cách, đi thẳng tới trang nhà cung cấp. Nếu chưa, gửi thông tin cho chúng tôi và chúng tôi tìm cả những nhà máy chưa lên sàn.</p>$vi$
  ),
  updated_at = now()
where slug = 'seafood-processed-fisheries-products'
  and (
    coalesce(body_i18n->>'en', '') like '%compare multiple Vietnamese suppliers%'
    or coalesce(body_i18n->>'en', '') like '%coordinating communication%'
  );


-- END supabase/migrations/20261022_seafood_intro_body_buyer_first.sql


-- BEGIN supabase/migrations/20261023_seo_desc_drop_shortlist.sql
-- ============================================================================
--  VEXIM TRADE – BỎ TỪ "SHORTLIST" KHỎI MÔ TẢ TÌM KIẾM ĐÃ LƯU TRONG DATABASE
--  Ngày: 23/10/2026
--
--  Bối cảnh
--    Code đã thôi dùng từ "shortlist" trong mọi câu buyer đọc. Câu đã lưu sẵn
--    trong cột seo_desc_i18n thì code không sửa tới, mà Google lại đọc bản lưu
--    đó, nên nếu còn thì vẫn hiện trên trang kết quả.
--
--  Trạng thái
--    Ngày 23/10/2026 đã rà database bằng truy vấn ở dưới và không còn dòng nào
--    chứa từ đó. Migration này hiện là lưới an toàn, chạy cũng không đổi gì.
--
--    Truy vấn rà, dùng lại khi cần:
--
--      select slug, jsonb_typeof(seo_desc_i18n) as shape, seo_desc_i18n::text as raw
--      from public.categories
--      where seo_desc_i18n::text ilike '%shortlist%'
--      order by slug;
--
--  Vì sao dùng seo_desc_i18n::text thay vì seo_desc_i18n->>'en'
--    Cột này từng gặp hai dạng: object {"en": "...", "vi": "..."} và chuỗi jsonb
--    thuần. Với dạng chuỗi, toán tử ->> trả null nên điều kiện lọc không bao giờ
--    khớp và câu lệnh im lặng không làm gì. Ép ::text bắt được cả hai dạng.
--
--  An toàn khi chạy lại
--    Chỉ ghi đè khi mô tả hiện tại còn chứa cụm cũ. Nhân viên đã sửa trong CRM
--    thì câu lệnh không làm gì. Phần ghi cũng kiểm dạng cột trước khi ghép,
--    tránh trường hợp chuỗi || object tạo ra mảng hỏng.
-- ============================================================================


update public.categories
set
  seo_desc_i18n = case
    when jsonb_typeof(seo_desc_i18n) = 'object'
      then seo_desc_i18n || jsonb_build_object(
        'en', $en$Compare verified Vietnamese cashew kernel suppliers by grade, MOQ and lead time. Request a quote from the supplier you choose, or ask us to look for one.$en$
      )
    else jsonb_build_object(
      'en', $en$Compare verified Vietnamese cashew kernel suppliers by grade, MOQ and lead time. Request a quote from the supplier you choose, or ask us to look for one.$en$
    )
  end,
  updated_at = now()
where slug = 'cashew'
  and coalesce(seo_desc_i18n::text, '') ilike '%shortlist%';


-- END supabase/migrations/20261023_seo_desc_drop_shortlist.sql


-- BEGIN supabase/migrations/20261024_category_harvest_calendar.sql
-- ============================================================================
--  VEXIM TRADE – LỊCH MÙA VỤ CHO DANH MỤC
--  Ngày: 24/10/2026
--
--  Bối cảnh
--    Trang danh mục chưa nói được "tháng nào nên chốt đơn". Dữ liệu mùa vụ hiện
--    chỉ nằm trong một dòng chữ tự do của buying_facts nên không vẽ được biểu đồ,
--    không lọc được, và mỗi lần sửa phải viết lại cả câu.
--
--  Thiết kế
--    Một cột harvest jsonb chứa danh sách cửa sổ mùa vụ, không phải mảng 12
--    tháng. Lý do: gạo có ba vụ rời nhau (Đông Xuân, Hè Thu, Thu Đông) và thủy
--    sản cao điểm theo từng loài, mảng 12 tháng không biểu diễn được cả hai mà
--    vẫn phải sửa schema khi làm danh mục thứ hai.
--
--    Cấu trúc:
--      {
--        "windows": [
--          { "id": "main", "label": "Main crop",
--            "start_month": 2, "end_month": 5,
--            "regions": ["Binh Phuoc", "Dong Nai"],
--            "peak": true, "note": "..." }
--        ],
--        "note_i18n": { "en": "..." },
--        "reviewed_on": "2026-10-24"   -- null nghĩa là chưa rà soát
--      }
--
--    end_month nhỏ hơn start_month nghĩa là cửa sổ vắt qua năm mới, ví dụ cà phê
--    robusta từ tháng 11 đến tháng 1.
--
--  An toàn khi chạy lại
--    Cột thêm bằng if not exists. Phần điền dữ liệu chỉ chạy khi harvest còn
--    null, nên không đè lên nội dung nhân viên đã sửa trong CRM.
--
--  Ghi chú về nội dung hạt điều
--    reviewed_on để null có chủ đích. Con số vụ chính là kiến thức ngành phổ
--    biến nhưng chưa đối chiếu lại với VINACAS hay Bộ Nông nghiệp, nên biểu đồ
--    sẽ tự ghi "Review date not set" thay vì giả vờ đã duyệt.
-- ============================================================================


alter table public.categories
  add column if not exists harvest jsonb;

update public.categories
set
  harvest = $json${
    "windows": [
      {
        "id": "main",
        "label": "Main crop",
        "start_month": 2,
        "end_month": 5,
        "regions": ["Binh Phuoc", "Dong Nai", "Central Highlands"],
        "peak": true,
        "note": "Picking runs province by province, so the peak moves by a few weeks from year to year."
      }
    ],
    "note_i18n": {
      "en": "Plants process kernels all year because they also buy raw nuts from West Africa and Cambodia. These months are the domestic harvest, not the only window when you can order."
    },
    "reviewed_on": null
  }$json$::jsonb,
  updated_at = now()
where slug = 'cashew'
  and harvest is null;


-- END supabase/migrations/20261024_category_harvest_calendar.sql


-- BEGIN supabase/migrations/20261024_category_price_unit.sql
-- ============================================================================
--  VEXIM TRADE – ĐƠN VỊ GIÁ THEO QUY ƯỚC THỊ TRƯỜNG CỦA TỪNG NGÀNH
--  Ngày: 24/10/2026
--
--  Vì sao cần cột này
--    Cột supplier_products.unit là chữ tự do ("MT", "kg", "thùng", đôi khi
--    "USD/kg" nằm trong currency). Không thể cộng giá của nhiều nhà cung cấp nếu
--    mỗi người ghi một kiểu, và đoán sai đơn vị thì con số sai gấp 1000 lần.
--
--    Cột categories.price_unit chốt đơn vị HIỂN THỊ của danh mục. Hệ thống vẫn
--    quy đổi mọi giá về kg để tính, rồi hiển thị theo đơn vị ở đây.
--
--  Quy ước đã đối chiếu ngày 24/10/2026
--    - Nhân điều: báo giá FOB Việt Nam phổ biến tính USD/kg (SVC, Pacific
--      Production, Tridge quy về USD/kg). Bản tin thương mại quốc tế và VINACAS
--      lại tính USD/lb. Nên chọn kg làm đơn vị chính và hiện thêm lb.
--    - Gạo: USD/tấn, ví dụ gạo 5% tấm FOB 420-450 USD/t (VFA, World Bank).
--    - Cà phê robusta: USD/tấn (ICE London, giá FOB Việt Nam quanh 4,500 USD/t).
--    - Hồ tiêu đen: USD/tấn theo cỡ 500 g/l và 550 g/l (IPC).
--    - Quế, hồi, hoa quả khô, dừa: USD/tấn trong giao dịch công nghiệp.
--    - Tôm, cá: USD/kg theo cỡ con.
--
--  An toàn khi chạy lại
--    Cột thêm bằng if not exists, và chỉ điền khi price_unit còn null.
-- ============================================================================


alter table public.categories
  add column if not exists price_unit text;

-- Nhân điều: kg, hiển thị kèm pound vì bản tin quốc tế đọc theo lb.
update public.categories
set price_unit = 'kg', updated_at = now()
where slug = 'cashew' and price_unit is null;

update public.categories
set price_unit = 'mt', updated_at = now()
where slug in (
  'rice',
  'coffee',
  'pepper',
  'cassia-cinnamon',
  'star-anise',
  'coconut',
  'dried-fruits',
  'dried-spices'
) and price_unit is null;

update public.categories
set price_unit = 'kg', updated_at = now()
where slug = 'seafood-processed-fisheries-products' and price_unit is null;


-- END supabase/migrations/20261024_category_price_unit.sql


-- BEGIN supabase/migrations/20261025_category_unit_and_harvest_followup.sql
-- ============================================================================
--  VEXIM TRADE – VÁ ĐƠN VỊ GIÁ THEO SLUG THỰC TẾ + LỊCH MÙA VỤ CHO DANH MỤC HẠT ĐIỀU
--  Ngày: 25/10/2026
--
--  Vì sao cần migration này
--    Migration 20261024 đặt đơn vị giá theo danh sách slug mình đoán trước. Rà
--    database ngày 25/10/2026 thấy slug thực tế khác:
--
--      dried-fruits                          mt   đúng
--      seafood-processed-fisheries-products  kg   đúng
--      spices                                null sai, vì danh sách ghi "dried-spices"
--
--    Và không có dòng nào mang slug "cashew", nên cả phần đơn vị giá lẫn lịch
--    mùa vụ của hạt điều trong migration trước không áp vào đâu cả. Đây là lý do
--    biểu đồ mùa vụ chưa hiện ở đâu sau khi chạy migration.
--
--  Phần 1 – đơn vị giá
--    Vá slug "spices" về tấn. Ruột ngành gia vụ khô (hồ tiêu, quế, hồi) đều
--    giao dịch theo tấn.
--
--  Phần 2 – lịch mùa vụ hạt điều
--    Chỉ chạy khi đã có danh mục hạt điều, nhận diện theo tên chứ không theo
--    slug, vì slug có thể là "cashew", "cashew-kernels" hay "hat-dieu". Chưa có
--    danh mục nào như vậy thì câu lệnh không làm gì, chạy lại sau khi tạo danh
--    mục vẫn đúng.
--
--  An toàn khi chạy lại
--    Cả hai phần đều có điều kiện "còn null", nên không đè lên nội dung nhân
--    viên đã nhập trong CRM.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Đơn vị giá cho slug thực tế
-- ---------------------------------------------------------------------------
update public.categories
set price_unit = 'mt', updated_at = now()
where price_unit is null
  and (
    slug in ('spices', 'dried-spices', 'rice', 'coffee', 'pepper', 'cassia-cinnamon', 'star-anise', 'coconut', 'dried-fruits')
    or slug ~ '(rice|coffee|pepper|cassia|cinnamon|anise|spice|coconut|fruit|bean|tea|sugar)'
  );

update public.categories
set price_unit = 'kg', updated_at = now()
where price_unit is null
  and (
    slug in ('seafood-processed-fisheries-products', 'seafood', 'cashew', 'cashew-kernels')
    or slug ~ '(seafood|fisher|shrimp|prawn|fish|squid|tuna|pangasius|cashew|nut|kernel)'
  );

-- ---------------------------------------------------------------------------
-- 2. Lịch mùa vụ cho danh mục hạt điều
--
--    Nội dung: vụ chính tháng 2 đến tháng 5 ở Bình Phước, Đồng Nai, Tây Nguyên.
--    reviewed_on để null có chủ đích: con số này là kiến thức ngành phổ biến
--    nhưng chưa đối chiếu lại với VINACAS hay Bộ Nông nghiệp, nên biểu đồ sẽ tự
--    ghi "Review date not set" thay vì giả vờ đã duyệt. Xác nhận xong thì điền
--    ngày trong /crm/categories, tab Mùa vụ.
-- ---------------------------------------------------------------------------
update public.categories
set
  harvest = $json${
    "windows": [
      {
        "id": "main",
        "label": "Main crop",
        "start_month": 2,
        "end_month": 5,
        "regions": ["Binh Phuoc", "Dong Nai", "Central Highlands"],
        "peak": true,
        "note": "Picking runs province by province, so the peak moves by a few weeks from year to year."
      }
    ],
    "note_i18n": {
      "en": "Plants process kernels all year because they also buy raw nuts from West Africa and Cambodia. These months are the domestic harvest, not the only window when you can order."
    },
    "reviewed_on": null
  }$json$::jsonb,
  price_unit = coalesce(price_unit, 'kg'),
  updated_at = now()
where harvest is null
  and (
    slug ~ 'cashew'
    or coalesce(name_i18n->>'en', '') ilike '%cashew%'
    or coalesce(name_i18n->>'vi', '') ilike '%điều%'
  );


-- ============================================================================
--  Kiểm tra sau khi chạy
--
--    select slug, price_unit,
--           jsonb_array_length(coalesce(harvest->'windows', '[]'::jsonb)) as harvest_windows
--    from public.categories order by slug;
--
--  Kỳ vọng: spices ra 'mt'. Danh mục hạt điều, nếu đã tạo, ra 'kg' với 1 cửa sổ.
-- ============================================================================

-- END supabase/migrations/20261025_category_unit_and_harvest_followup.sql


-- BEGIN supabase/migrations/20261026_spices_harvest_calendar.sql
-- ============================================================================
--  VEXIM TRADE – LỊCH MÙA VỤ CHO DANH MỤC GIA VỊ KHÔ
--  Ngày: 25/10/2026
--
--  Bối cảnh
--    Database đang có ba danh mục: dried-fruits, seafood-processed-fisheries-
--    products, spices. Không có danh mục hạt điều, nên phần dữ liệu hạt điều
--    trong các migration trước nằm im. Migration này điền lịch mùa vụ cho danh
--    mục đang thật sự có người xem.
--
--  Vì sao gộp thành hai cửa sổ chứ không phải năm
--    Danh mục này gồm ba loại cây có lịch khác nhau: hồ tiêu, quế và hồi. Nếu vẽ
--    riêng từng cây thì biểu đồ có năm thanh chồng nhau, buyer nhìn không ra.
--    Ở cấp danh mục, ba cây này trùng nhau thành hai mùa: chính từ tháng 2 đến
--    tháng 5, phụ từ tháng 8 đến tháng 11. Chi tiết từng cây nằm trong ghi chú,
--    nơi nó hữu ích hơn là một thanh thứ năm.
--
--  Nguồn đã đối chiếu ngày 24/10/2026
--    - Hồ tiêu: VPSA cho biết vụ 2026 bắt đầu cuối tháng 2 và kéo tới hết tháng
--      4; vùng chính là Tây Nguyên (Đắk Lắk, Gia Lai, Đắk Nông), Bình Phước,
--      Bà Rịa - Vũng Tàu.
--    - Quế: hai vụ, chính tháng 3 đến tháng 5, phụ tháng 8 đến tháng 10; Yên Bái
--      chiếm khoảng 70 phần trăm diện tích.
--    - Hồi: vụ xuân tháng 3 đến tháng 4, vụ thu tháng 8 đến tháng 11; Lạng Sơn
--      chiếm phần lớn sản lượng.
--
--    reviewed_on ghi ngày 24/10/2026 vì đã đối chiếu các nguồn trên. Nếu bộ phận
--    thu mua của Vexim xác nhận khác, sửa lại một dòng trong /crm/categories,
--    tab Mùa vụ, không cần deploy.
--
--  An toàn khi chạy lại
--    Chỉ điền khi harvest còn null, nên không đè nội dung nhân viên đã nhập.
-- ============================================================================


update public.categories
set
  harvest = $json${
    "windows": [
      {
        "id": "main",
        "label": "Main crop",
        "start_month": 2,
        "end_month": 5,
        "regions": ["Dak Lak", "Gia Lai", "Dak Nong", "Binh Phuoc", "Ba Ria - Vung Tau", "Yen Bai"],
        "peak": true,
        "note": "Pepper runs from late February to the end of April. Cassia bark peaks from March to May."
      },
      {
        "id": "second",
        "label": "Second crop",
        "start_month": 8,
        "end_month": 11,
        "regions": ["Yen Bai", "Lao Cai", "Lang Son"],
        "peak": false,
        "note": "Second cassia bark season and the autumn star anise crop, which carries the stronger aroma."
      }
    ],
    "note_i18n": {
      "en": "Spices are dried and stored, so you can buy all year. These months are when the crop is picked, which is when prices move and when the freshest material reaches the mills."
    },
    "reviewed_on": "2026-10-24"
  }$json$::jsonb,
  price_unit = coalesce(price_unit, 'mt'),
  updated_at = now()
where slug in ('spices', 'dried-spices')
  and harvest is null;


-- ============================================================================
--  Kiểm tra sau khi chạy
--
--    select slug, price_unit,
--           jsonb_array_length(coalesce(harvest->'windows', '[]'::jsonb)) as harvest_windows
--    from public.categories order by slug;
--
--  Kỳ vọng: spices ra 'mt' với 2 cửa sổ.
-- ============================================================================

-- END supabase/migrations/20261026_spices_harvest_calendar.sql


-- BEGIN supabase/migrations/20261027_launch_categories.sql
-- ============================================================================
--  VEXIM TRADE – BỘ DANH MỤC RA MẮT ĐỢT 1
--  Ngày: 23/10/2026
--
--  Ba danh mục ra mắt, chốt với chủ dự án ngày 23/10/2026:
--    1. cashew-kernels          Hạt điều nhân        tạo mới
--    2. pepper                  Hồ tiêu              đổi tên từ "spices"
--    3. cinnamon-star-anise     Quế và hồi           tạo mới
--
--  Xử lý danh mục demo còn lại:
--    dried-fruits   giữ nguyên, không đụng vào
--    seafood-processed-fisheries-products   ẩn khỏi website, KHÔNG xoá
--
--  Vì sao ẩn chứ không xoá: sản phẩm và RFQ cũ trỏ tới slug này. Xoá dòng danh
--  mục là để dữ liệu mồ côi và làm hỏng đường dẫn. Ẩn chỉ đổi trạng thái, và bật
--  lại được bất cứ lúc nào trong CRM khi có ngành thủy sản thật.
--
--  Nguồn mùa vụ (đối chiếu 23/10/2026)
--
--    Hồ tiêu
--      Hiệp hội Hồ tiêu và Cây gia vị Việt Nam (VPSA): vụ 2026 bắt đầu cuối
--      tháng 2 và kết thúc cuối tháng 4. Vùng trồng chính Đắk Lắk, Gia Lai,
--      Đắk Nông, Đồng Nai, Bà Rịa - Vũng Tàu.
--
--    Hạt điều
--      Báo Bình Phước và Báo Đồng Nai: thu hoạch bắt đầu tháng 1 ở vùng Bình
--      Phước cũ, kết thúc tháng 4. Đồng Nai và Tây Nguyên muộn hơn hai đến bốn
--      tuần. Diện tích điều của Đồng Nai sau sáp nhập khoảng 176.000 ha, chiếm
--      gần 58% diện tích cả nước, sản lượng khoảng 186.000 tấn.
--
--      Lưu ý hành chính: Bình Phước đã sáp nhập vào Đồng Nai từ năm 2025. Vì vậy
--      vùng trồng ghi "Dong Nai" và ghi chú nói rõ Bình Phước cũ nằm trong đó,
--      thay vì liệt kê một tỉnh không còn tồn tại.
--
--    Quế và hồi
--      Sở Nông nghiệp và Môi trường Yên Bái, Lạng Sơn cùng tài liệu của các
--      doanh nghiệp xuất khẩu quế hồi: quế vỏ hai vụ, vụ chính tháng 3 đến 5,
--      vụ hai tháng 8 đến 10. Hoa hồi tháng 3 đến 4, thu quả tháng 8 đến 11, vụ
--      thu mang hương mạnh hơn và giá cao hơn.
--
--  Nguyên tắc đã áp dụng
--    - Không con số nào chưa đối chiếu. Chỗ nào chưa chắc thì không điền, không
--      để ngoặc vuông trên trang công khai.
--    - Nguồn dẫn là nguồn Việt (mục 9.1 của docs/market-overview-spec.md).
--    - Nội dung viết theo luồng buyer liên hệ nhà cung cấp trước; Vexim là đường
--      dự phòng khi trang không có thứ buyer cần.
--    - Không dùng chữ "shortlist", không gạch ngang dài, không sáo ngữ.
--
--  An toàn khi chạy lại
--    Mọi câu lệnh đều có điều kiện theo slug hiện tại, nên chạy lần hai không
--    nhân đôi dữ liệu. Phần nội dung ghi đè có chủ đích: đây là bản ra mắt, và
--    nội dung cũ của "spices" là bản tự sinh còn lỗi.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Đổi tên danh mục gia vụ khô thành hồ tiêu
--
--    Chỉ đổi khi chưa có dòng "pepper", để chạy lại không vi phạm ràng buộc
--    duy nhất trên slug. Slug cũ vào previous_slugs để /products/spices tự
--    chuyển hướng 301 sang /products/pepper.
-- ---------------------------------------------------------------------------
update public.categories
set
  slug = 'pepper',
  previous_slugs = case
    when 'spices' = any (coalesce(previous_slugs, '{}'::text[])) then coalesce(previous_slugs, '{}'::text[])
    else coalesce(previous_slugs, '{}'::text[]) || 'spices'::text
  end,
  updated_at = now()
where slug = 'spices'
  and not exists (select 1 from public.categories c2 where c2.slug = 'pepper');

-- Sản phẩm đang gắn slug cũ phải theo sang slug mới, nếu không chúng rơi khỏi
-- danh mục và biến mất khỏi lưới sản phẩm.
update public.supplier_products set category = 'pepper' where category = 'spices';
update public.supplier_products set reviewed_category_slug = 'pepper' where reviewed_category_slug = 'spices';

-- ---------------------------------------------------------------------------
-- 2. Nội dung hồ tiêu
-- ---------------------------------------------------------------------------
update public.categories
set
  name_i18n = '{"en": "Pepper", "vi": "Hồ tiêu"}'::jsonb,
  h1_i18n = '{"en": "Pepper suppliers in Vietnam"}'::jsonb,
  intro_i18n = '{"en": "Vietnamese black and white pepper, graded by bulk density from 500 to 580 grams per litre, from mills in the Central Highlands and the southeast. Compare grade, moisture and packing, then contact the supplier directly. Send your requirements to Vexim only for what is not on this page."}'::jsonb,
  body_i18n = '{"en": "<p>Vietnam supplies around half of the pepper traded internationally, most of it as whole black or white pepper, cleaned and graded before it leaves the mill. The crop comes from the Central Highlands and the southeast, where the dry season makes sun drying practical and keeps moisture consistent from lot to lot.</p><p>Grade is quoted by bulk density: 500, 550, 570 or 580 grams per litre. A higher number means heavier, more mature berries and fewer light ones. It is a starting point, not a full specification, so the contract still needs moisture, light berries, extraneous matter, piperine and, if your market asks for it, steam sterilisation.</p><p>Moisture is usually capped between 12 and 13.5 percent depending on grade and treatment. Machine cleaned lots run at lower admixture than FAQ material, and buyers shipping into the EU often ask for the stricter cleanliness specification rather than the cheaper FAQ grade.</p><p>White pepper is a separate product, not a grade of black pepper. It comes from riper berries with the outer skin removed, and it is quoted at a higher density with a milder heat. Say which one you want before anyone quotes you a price.</p>"}'::jsonb,
  faq_i18n = $json$[
    {"q": "What does 500 g/L or 550 g/L mean?", "a": "It is bulk density, the weight of pepper that fills one litre. Higher density usually means more mature berries and fewer light ones. It is one line of the specification, so ask for moisture, light berries, extraneous matter and piperine as well."},
    {"q": "Can I buy machine cleaned or ASTA grade?", "a": "Yes. Machine cleaned and ASTA grade carry tighter limits on admixture and light berries than FAQ material, and they cost more. Tell the supplier which one your buyer expects, because the two are not interchangeable."},
    {"q": "Do you also supply white pepper?", "a": "Yes. White pepper is quoted separately from black pepper, at a different density and price. Ask for both if your product line uses both."},
    {"q": "How much do I have to order?", "a": "The minimum order is set by each supplier, not by Vexim. A full container is the usual export lot, and some mills accept smaller trial orders. Ask the supplier you are talking to before you plan volumes."},
    {"q": "Which port does pepper ship from?", "a": "Most lots leave from Ho Chi Minh City, usually on FOB terms. CIF to your port can be arranged at quotation time. The port and the Incoterm are named in the quote, not assumed."},
    {"q": "Can I get a sample before committing to a container?", "a": "Yes, in most cases. Sample and courier costs are paid by the buyer, and the supplier confirms the amount before anything is sent."},
    {"q": "Who do I deal with once we agree?", "a": "The supplier. Vexim introduces you and then steps back, and the contract, payment and shipping run between you and the mill. We stay reachable if something needs clarifying."}
  ]$json$::jsonb,
  seo_title_i18n = '{"en": "Pepper Suppliers in Vietnam | Black and White Pepper | Vexim Trade"}'::jsonb,
  seo_desc_i18n = '{"en": "Vietnamese black and white pepper graded 500 to 580 g/L, from mills in the Central Highlands and the southeast. Compare grade, moisture and packing, then contact the supplier directly."}'::jsonb,
  spec_columns = $json$[
    {"key": "grade", "label": "Grade", "width": "w-28", "emphasis": true},
    {"key": "density", "label": "Bulk density", "width": "w-32"},
    {"key": "use", "label": "What it is usually bought for"}
  ]$json$::jsonb,
  spec_rows = $json$[
    {"key": "p500", "values": {"grade": "500 g/L", "density": "500 g/L minimum", "use": "FAQ and machine cleaned lots for grinding and blending"}},
    {"key": "p550", "values": {"grade": "550 g/L", "density": "550 g/L minimum", "use": "The grade most spice houses specify, and where Codex Class I starts"}},
    {"key": "p570", "values": {"grade": "570 g/L", "density": "570 g/L minimum", "use": "Heavier berries for premium retail and higher piperine"}},
    {"key": "p580", "values": {"grade": "580 g/L", "density": "580 g/L minimum", "use": "Top of the standard range, sold at a premium"}},
    {"key": "white", "values": {"grade": "White pepper", "density": "600 g/L typical", "use": "Milder heat, light coloured sauces and fillings"}}
  ]$json$::jsonb,
  buying_facts = $json$[
    {"key": "grade", "icon": "tag", "label": "Grades", "value": "Black pepper at 500, 550, 570 and 580 g/L. White pepper quoted separately."},
    {"key": "inco", "icon": "ship", "label": "Incoterms", "value": "FOB Ho Chi Minh City is the usual basis. CIF to your port on request."},
    {"key": "port", "icon": "anchor", "label": "Port", "value": "Most lots leave from Ho Chi Minh City. The port is named in each quote."},
    {"key": "season", "icon": "calendar", "label": "Season", "value": "Picked from late February to the end of April. Dried and stored, so it ships all year."}
  ]$json$::jsonb,
  product_fields = $json$[
    {"key": "grade", "label": "Grade", "type": "select", "options": ["500 g/L", "550 g/L", "570 g/L", "580 g/L", "White pepper"], "filterable": true}
  ]$json$::jsonb,
  filters = $json$[
    {"key": "grade", "label": "Grades", "options": [
      {"value": "500 g/L", "label": "500 g/L"},
      {"value": "550 g/L", "label": "550 g/L"},
      {"value": "570 g/L", "label": "570 g/L"},
      {"value": "580 g/L", "label": "580 g/L"},
      {"value": "White pepper", "label": "White pepper"}
    ]}
  ]$json$::jsonb,
  harvest = $json${
    "windows": [
      {
        "id": "main",
        "label": "Main crop",
        "start_month": 2,
        "end_month": 4,
        "regions": ["Dak Lak", "Gia Lai", "Dak Nong", "Dong Nai", "Ba Ria - Vung Tau"],
        "peak": true,
        "note": "Picking starts late in February and finishes at the end of April. Binh Phuoc, long the largest pepper province, is now part of Dong Nai."
      }
    ],
    "note_i18n": {
      "en": "Pepper is dried and stored, so it ships all year. These months are when the crop is picked, which is when farm-gate prices move. Seasons follow the Vietnam Pepper and Spice Association."
    },
    "reviewed_on": "2026-10-23"
  }$json$::jsonb,
  price_unit = 'mt',
  hero_alt_i18n = coalesce(hero_alt_i18n, '{"en": "Vietnamese black peppercorns, dried and graded"}'::jsonb),
  is_published = true,
  status = 'published',
  sort_order = 20,
  updated_at = now()
where slug = 'pepper';

-- ---------------------------------------------------------------------------
-- 3. Hạt điều nhân
-- ---------------------------------------------------------------------------
insert into public.categories (
  slug, parent_id, name_i18n, h1_i18n, intro_i18n, body_i18n, faq_i18n,
  seo_title_i18n, seo_desc_i18n, hero_image, hero_alt_i18n,
  spec_columns, spec_rows, buying_facts, product_fields, filters, harvest,
  price_unit, is_published, status, seo_indexable, sort_order, active_on_homepage,
  created_by
) values (
  'cashew-kernels', null,
  '{"en": "Cashew kernels", "vi": "Hạt điều nhân"}'::jsonb,
  '{"en": "Cashew kernel suppliers in Vietnam"}'::jsonb,
  '{"en": "Vietnamese cashew kernels graded to the AFI count system, from W180 whole kernels down to splits and pieces. Compare the grade, the packing and what has been checked on each profile, then deal with the processor directly. Send Vexim only the spec that is not on the page."}'::jsonb,
  '{"en": "<p>Vietnam processes more cashew than any other country, and supplies most of the kernels traded worldwide. The raw nuts mostly come in from West Africa and Cambodia, with the domestic crop a smaller share, so the factories run all year and the season below is about raw nut arrivals rather than factory downtime.</p><p>Kernels are graded by count per pound under the AFI system. W240 means roughly 240 whole kernels to a pound, and the lower the number the larger the kernel and the higher the price. Scorched wholes, white splits, large pieces and small pieces are separate grades with their own prices, and they are never interchangeable in a specification.</p><p>Raw cashew nuts and cashew kernels are different products under different HS codes, 080131 and 080132, and they trade at very different levels. If you compare one against the other you are comparing two markets.</p><p>Count, moisture, the tolerance for broken and split kernels, packing format and inspection method all belong in the contract. Ask for them in writing before you compare prices from two processors.</p>"}'::jsonb,
  $json$[
    {"q": "What do the W numbers mean?", "a": "They are kernel counts per pound. W240 is about 240 whole kernels to a pound, W320 about 320. Lower numbers mean larger kernels and higher prices. Splits and pieces are graded separately."},
    {"q": "Do you supply raw cashew nuts as well as kernels?", "a": "Raw cashew nuts are a separate product under HS 080131, traded by processors and importers rather than as a finished export lot. If you need raw nuts, say so and we will look outside the listings on this page."},
    {"q": "Can I buy roasted or salted kernels?", "a": "Some processors run roasting and flavouring lines for private label. It depends on the factory and the volume, so ask before you plan a retail pack."},
    {"q": "How much do I have to order?", "a": "The minimum order is set by each processor. A full container is the usual export lot, and some accept smaller trial orders. Confirm it with the supplier before you plan volumes."},
    {"q": "Where do kernels ship from?", "a": "Most containers leave from Cat Lai in Ho Chi Minh City, usually on FOB terms. CIF to your port is quoted on request. The port is named in the quote."},
    {"q": "How do I check a factory before ordering?", "a": "Look at what has been verified on their profile: business registration, certificate holder status and expiry, factory evidence, and delivery history from completed orders. Ask for the same documents directly if you want to run your own check."},
    {"q": "Can I get samples?", "a": "Yes in most cases. Sample and courier costs are paid by the buyer, and the supplier confirms the amount before anything is sent."}
  ]$json$::jsonb,
  '{"en": "Cashew Kernel Suppliers in Vietnam | W180 to W450 | Vexim Trade"}'::jsonb,
  '{"en": "Vietnamese cashew kernels graded to AFI counts, from W180 wholes to splits and pieces. Compare grade, packing and verification, then contact the processor directly."}'::jsonb,
  '/images/categories/cashew-hero.jpg',
  '{"en": "Vietnamese cashew kernels graded by count"}'::jsonb,
  $json$[
    {"key": "code", "label": "Grade", "width": "w-20", "emphasis": true},
    {"key": "count", "label": "Kernels per lb", "width": "w-32"},
    {"key": "use", "label": "What it is usually bought for"}
  ]$json$::jsonb,
  $json$[
    {"key": "w180", "values": {"code": "W180", "count": "170 to 180", "use": "Premium retail and gift packs"}},
    {"key": "w240", "values": {"code": "W240", "count": "220 to 240", "use": "Premium retail"}},
    {"key": "w320", "values": {"code": "W320", "count": "300 to 320", "use": "The most traded grade, a balance of size and price"}},
    {"key": "w450", "values": {"code": "W450", "count": "400 to 450", "use": "Snacks, bakery and confectionery"}},
    {"key": "sw", "values": {"code": "SW", "count": "Not graded by count", "use": "Scorched wholes for roasted and salted snacks"}},
    {"key": "ws", "values": {"code": "WS", "count": "Not graded by count", "use": "White splits for snacks, chocolate and cereals"}},
    {"key": "lp", "values": {"code": "LP", "count": "Not graded by count", "use": "Large pieces for bakery and ice cream"}},
    {"key": "sp", "values": {"code": "SP", "count": "Not graded by count", "use": "Small pieces for butter, paste and processing"}}
  ]$json$::jsonb,
  $json$[
    {"key": "grade", "icon": "tag", "label": "Grades", "value": "AFI counts from W180 to W450, plus scorched wholes, splits and pieces."},
    {"key": "inco", "icon": "ship", "label": "Incoterms", "value": "FOB Ho Chi Minh City is the usual basis. CIF to your port on request."},
    {"key": "port", "icon": "anchor", "label": "Port", "value": "Most containers leave from Cat Lai. The port is named in each quote."},
    {"key": "season", "icon": "calendar", "label": "Season", "value": "Domestic nuts arrive from January to May. Processors also import raw nuts, so kernels ship all year."}
  ]$json$::jsonb,
  $json$[
    {"key": "grade", "label": "Grade", "type": "select", "options": ["W180", "W240", "W320", "W450", "SW", "WS", "LP", "SP"], "filterable": true}
  ]$json$::jsonb,
  $json$[
    {"key": "grade", "label": "Grades", "options": [
      {"value": "W180", "label": "W180"},
      {"value": "W240", "label": "W240"},
      {"value": "W320", "label": "W320"},
      {"value": "W450", "label": "W450"},
      {"value": "SW", "label": "SW"},
      {"value": "WS", "label": "WS"},
      {"value": "LP", "label": "LP"},
      {"value": "SP", "label": "SP"}
    ]}
  ]$json$::jsonb,
  $json${
    "windows": [
      {
        "id": "main",
        "label": "Main crop",
        "start_month": 1,
        "end_month": 5,
        "regions": ["Dong Nai", "Dak Lak", "Gia Lai", "Lam Dong"],
        "peak": true,
        "note": "Picking starts in January in the area that was Binh Phuoc, now part of Dong Nai, and finishes in April. The rest of Dong Nai and the Central Highlands follow two to four weeks later."
      }
    ],
    "note_i18n": {
      "en": "Processors also buy raw nuts from West Africa and Cambodia, so kernels leave the factory in every month. These months are when the domestic crop arrives, which is when raw nut prices move."
    },
    "reviewed_on": "2026-10-23"
  }$json$::jsonb,
  'kg', true, 'published', false, 10, false, 'migration-20261027'
)
on conflict (slug) do update set
  name_i18n = excluded.name_i18n,
  h1_i18n = excluded.h1_i18n,
  intro_i18n = excluded.intro_i18n,
  body_i18n = excluded.body_i18n,
  faq_i18n = excluded.faq_i18n,
  seo_title_i18n = excluded.seo_title_i18n,
  seo_desc_i18n = excluded.seo_desc_i18n,
  hero_image = coalesce(public.categories.hero_image, excluded.hero_image),
  hero_alt_i18n = coalesce(public.categories.hero_alt_i18n, excluded.hero_alt_i18n),
  spec_columns = excluded.spec_columns,
  spec_rows = excluded.spec_rows,
  buying_facts = excluded.buying_facts,
  product_fields = excluded.product_fields,
  filters = excluded.filters,
  harvest = excluded.harvest,
  price_unit = excluded.price_unit,
  is_published = true,
  status = 'published',
  sort_order = excluded.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 4. Quế và hồi
--
--    Gộp một danh mục vì cùng một spice house mua cả hai và cùng một chuyến
--    thăm nhà máy phục vụ cả hai. Hai cửa sổ mùa vụ, chi tiết từng loại nằm
--    trong ghi chú của cửa sổ.
-- ---------------------------------------------------------------------------
insert into public.categories (
  slug, parent_id, name_i18n, h1_i18n, intro_i18n, body_i18n, faq_i18n,
  seo_title_i18n, seo_desc_i18n, hero_image, hero_alt_i18n,
  spec_columns, spec_rows, buying_facts, product_fields, filters, harvest,
  price_unit, is_published, status, seo_indexable, sort_order, active_on_homepage,
  created_by
) values (
  'cinnamon-star-anise', null,
  '{"en": "Cinnamon and star anise", "vi": "Quế và hồi"}'::jsonb,
  '{"en": "Cassia cinnamon and star anise suppliers in Vietnam"}'::jsonb,
  '{"en": "Whole cassia bark and star anise from the northern highlands, the two crops that fill the same spice-house order. Compare grade, oil content and packing, then contact the mill directly. Vexim steps in only when the spec you need is not listed here."}'::jsonb,
  '{"en": "<p>Cassia cinnamon and star anise grow in the northern highlands, mostly in Yen Bai, Lao Cai, Lang Son and Cao Bang. Vietnam is the largest supplier of both, and most of the material leaves whole for spice houses and essential oil extractors.</p><p>Cassia is not the same product as Ceylon cinnamon. It is thicker, darker and stronger, and it is what most industrial buyers mean when they buy cinnamon in volume. It is graded by tube diameter and wall thickness, with oil content quoted separately.</p><p>Star anise is graded by flower size, colour and moisture. The autumn crop carries the stronger aroma and commands the higher price, which is why the same grade can be quoted at two different levels in the same year.</p><p>Both products are dried and stable, so you can buy in any month. What changes is how fresh the material is and what the mill is asking, and that follows the picking calendar below.</p>"}'::jsonb,
  $json$[
    {"q": "Is Vietnamese cassia the same as Ceylon cinnamon?", "a": "No. Cassia is a different species, with thicker bark, a darker colour and a stronger, warmer flavour. It is what most industrial buyers mean by cinnamon, and it is priced differently from Ceylon."},
    {"q": "Do you sell whole bark or ground?", "a": "Whole bark, split cassia and powder are all quoted. Powder loses aroma faster and carries different microbiological requirements, so the grade and the treatment belong in the contract."},
    {"q": "How is cassia graded?", "a": "Mainly by tube diameter and wall thickness, with a separate figure for oil content. Buyers usually name the diameter they want and then compare oil content and cleanliness across suppliers."},
    {"q": "Why is autumn star anise more expensive?", "a": "The autumn crop carries a stronger aroma and a higher oil content than the spring flowers. Buyers that extract oil or sell premium retail pay more for it, so the two crops do not trade at the same level."},
    {"q": "Can I combine cinnamon and star anise in one order?", "a": "Yes. They are often bought together by the same spice house, and combining them into one shipment is normal. Each product keeps its own grade and price in the contract."},
    {"q": "How much do I have to order?", "a": "The minimum is set by each supplier, not by Vexim. Ask the mill you are talking to before you plan volumes."},
    {"q": "Where do shipments leave from?", "a": "Most lots move to Hai Phong or Cai Mep before loading, depending on the mill and the buyer. The port and the Incoterm are named in each quote."}
  ]$json$::jsonb,
  '{"en": "Cassia Cinnamon and Star Anise Suppliers in Vietnam | Vexim Trade"}'::jsonb,
  '{"en": "Whole cassia bark and star anise from Yen Bai, Lao Cai and Lang Son. Compare grade, oil content and packing, then contact the mill directly."}'::jsonb,
  '/images/categories/cinnamon.jpg',
  '{"en": "Vietnamese cassia cinnamon bark and star anise"}'::jsonb,
  $json$[
    {"key": "product", "label": "Product", "width": "w-32", "emphasis": true},
    {"key": "crop", "label": "Crop", "width": "w-32"},
    {"key": "use", "label": "What it is usually bought for"}
  ]$json$::jsonb,
  $json$[
    {"key": "cassia-whole", "values": {"product": "Cassia, whole bark", "crop": "Spring and autumn", "use": "Spice houses that cut and pack in the destination market"}},
    {"key": "cassia-split", "values": {"product": "Cassia, split", "crop": "Spring and autumn", "use": "Grinding and blending, lower freight per tonne"}},
    {"key": "cassia-powder", "values": {"product": "Cassia, powder", "crop": "Any", "use": "Food manufacturing and bakery mixes"}},
    {"key": "anise-spring", "values": {"product": "Star anise, spring", "crop": "Spring", "use": "Volume buyers where price matters more than aroma"}},
    {"key": "anise-autumn", "values": {"product": "Star anise, autumn", "crop": "Autumn", "use": "Oil extraction and premium retail, stronger aroma"}}
  ]$json$::jsonb,
  $json$[
    {"key": "grade", "icon": "tag", "label": "Grades", "value": "Cassia by tube diameter and wall thickness. Star anise by flower size, colour and moisture."},
    {"key": "inco", "icon": "ship", "label": "Incoterms", "value": "FOB named port is the usual basis. CIF to your port on request."},
    {"key": "port", "icon": "anchor", "label": "Port", "value": "Northern mills usually ship through Hai Phong. The port is named in each quote."},
    {"key": "season", "icon": "calendar", "label": "Season", "value": "Two crops a year, March to May and August to November. Dried and stored, so it ships all year."}
  ]$json$::jsonb,
  $json$[
    {"key": "product_type", "label": "Product", "type": "select", "options": ["Cassia whole", "Cassia split", "Cassia powder", "Star anise", "Star anise oil"], "filterable": true}
  ]$json$::jsonb,
  $json$[
    {"key": "product_type", "label": "Products", "options": [
      {"value": "Cassia whole", "label": "Cassia whole"},
      {"value": "Cassia split", "label": "Cassia split"},
      {"value": "Cassia powder", "label": "Cassia powder"},
      {"value": "Star anise", "label": "Star anise"},
      {"value": "Star anise oil", "label": "Star anise oil"}
    ]}
  ]$json$::jsonb,
  $json${
    "windows": [
      {
        "id": "spring",
        "label": "Spring crop",
        "start_month": 3,
        "end_month": 5,
        "regions": ["Yen Bai", "Lao Cai", "Lang Son"],
        "peak": true,
        "note": "Cassia bark is stripped from March to May, which is the main harvest of the year. Star anise flowers in spring and is picked much later."
      },
      {
        "id": "autumn",
        "label": "Autumn crop",
        "start_month": 8,
        "end_month": 11,
        "regions": ["Yen Bai", "Lang Son", "Cao Bang"],
        "peak": false,
        "note": "Second cassia bark season from August to October, and star anise from August to November. The autumn anise carries the stronger aroma."
      }
    ],
    "note_i18n": {
      "en": "Dried bark and anise keep, so orders run all year. Picking peaks twice, which is when the freshest material reaches the mills and when the price at the mill moves. Seasons follow the provincial agriculture departments in Yen Bai and Lang Son."
    },
    "reviewed_on": "2026-10-23"
  }$json$::jsonb,
  'mt', true, 'published', false, 30, false, 'migration-20261027'
)
on conflict (slug) do update set
  name_i18n = excluded.name_i18n,
  h1_i18n = excluded.h1_i18n,
  intro_i18n = excluded.intro_i18n,
  body_i18n = excluded.body_i18n,
  faq_i18n = excluded.faq_i18n,
  seo_title_i18n = excluded.seo_title_i18n,
  seo_desc_i18n = excluded.seo_desc_i18n,
  hero_image = coalesce(public.categories.hero_image, excluded.hero_image),
  hero_alt_i18n = coalesce(public.categories.hero_alt_i18n, excluded.hero_alt_i18n),
  spec_columns = excluded.spec_columns,
  spec_rows = excluded.spec_rows,
  buying_facts = excluded.buying_facts,
  product_fields = excluded.product_fields,
  filters = excluded.filters,
  harvest = excluded.harvest,
  price_unit = excluded.price_unit,
  is_published = true,
  status = 'published',
  sort_order = excluded.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 5. Ẩn danh mục thủy sản gộp
--
--    Không xoá: sản phẩm và RFQ cũ trỏ tới slug này, xoá là dữ liệu mồ côi.
--    Ẩn đi thì trang biến khỏi trang chủ, sitemap và danh sách danh mục, và bật
--    lại được trong CRM khi có ngành thủy sản thật.
-- ---------------------------------------------------------------------------
update public.categories
set
  is_published = false,
  status = 'draft',
  active_on_homepage = false,
  seo_indexable = false,
  updated_at = now()
where slug = 'seafood-processed-fisheries-products';


-- ============================================================================
--  Kiểm tra sau khi chạy
--
--    select slug, price_unit, status,
--           jsonb_array_length(coalesce(harvest->'windows', '[]'::jsonb)) as windows,
--           harvest->>'reviewed_on' as reviewed
--    from public.categories
--    order by sort_order, slug;
--
--  Kỳ vọng
--    cashew-kernels          kg  published  1 cửa sổ   2026-10-23
--    pepper                  mt  published  1 cửa sổ   2026-10-23
--    cinnamon-star-anise     mt  published  2 cửa sổ   2026-10-23
--    dried-fruits            mt  (không đổi)
--    seafood-processed-...   kg  draft      0 cửa sổ
--
--  Kiểm tra chuyển hướng:
--    select slug, previous_slugs from public.categories where slug = 'pepper';
--  Kỳ vọng previous_slugs chứa 'spices', và /products/spices trả 301.
-- ============================================================================

-- END supabase/migrations/20261027_launch_categories.sql


-- BEGIN supabase/migrations/20261028_sponsored_product_push.sql
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

-- END supabase/migrations/20261028_sponsored_product_push.sql


-- BEGIN supabase/migrations/20261029_sponsored_approver_role.sql
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

-- END supabase/migrations/20261029_sponsored_approver_role.sql


-- BEGIN supabase/migrations/20261030_product_display_name.sql
-- Tên hiển thị cho buyer, soạn từ dữ kiện có cấu trúc.
--
-- Tên gốc của nhà cung cấp (`name`) là chứng từ, giữ nguyên văn và không bị ghi
-- đè. Cột này chỉ chứa tên do nhân viên chốt theo thứ tự mặt hàng, quy cách,
-- tỉnh, rồi tối đa hai chỉ tiêu phụ. Để trống thì trang buyer lùi về tên gốc,
-- nên migration này không đổi sản phẩm nào đang chạy.
alter table supplier_products
  add column if not exists display_name text;

comment on column supplier_products.display_name is
  'Tên soạn sẵn cho buyer; rỗng thì dùng name/name_i18n. Không dùng để suy ra danh mục.';

alter table supplier_products
  drop constraint if exists supplier_products_display_name_length;
alter table supplier_products
  add constraint supplier_products_display_name_length
  check (display_name is null or char_length(btrim(display_name)) between 0 and 120);

-- END supabase/migrations/20261030_product_display_name.sql


-- BEGIN supabase/migrations/20261031_supplier_submission_media_owner.sql
-- ============================================================================
--  SỬA LỖI: bằng chứng của HỒ SƠ TỰ GỬI (L2/L3) không lưu được vào media_assets
--
--  Trước migration này, code ghi `media_assets.owner_type = 'verification'` và
--  nhét **id hồ sơ tự gửi** vào cột `verification_id`:
--
--      insert ... violates foreign key constraint
--      "media_assets_verification_id_fkey"
--
--  vì `verification_id` tham chiếu `verifications(id)` còn id được ghi là của
--  `supplier_submissions(id)` — hai không gian id khác nhau. (Store JSON chạy
--  local không kiểm tra khoá ngoại nên lỗi chỉ lộ ra trên Supabase.)
--
--  Cách sửa: thêm hẳn một chủ sở hữu riêng cho bằng chứng tự gửi
--    owner_type = 'submission' + submission_id -> supplier_submissions(id)
--  để `verification_id` chỉ còn trỏ tới đợt kiểm thật do nhân viên Vexim lập.
--  Không đổi nghĩa dữ liệu cũ: mọi bản ghi đang có đều giữ nguyên
--  (submission_id = null).
--
--  Idempotent: chạy lại nhiều lần không phá dữ liệu. Chạy TRƯỚC khi deploy code.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Cột mới: hồ sơ tự gửi sở hữu tệp
-- ---------------------------------------------------------------------------
alter table public.media_assets add column if not exists submission_id uuid;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'media_assets_submission_id_fkey'
      and conrelid = 'public.media_assets'::regclass
  ) then
    alter table public.media_assets add constraint media_assets_submission_id_fkey
      foreign key (submission_id) references public.supplier_submissions(id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. owner_type nhận thêm 'submission'
-- ---------------------------------------------------------------------------
alter table public.media_assets drop constraint if exists media_assets_owner_type_check;
alter table public.media_assets add constraint media_assets_owner_type_check
  check (owner_type in ('product', 'supplier', 'verification', 'submission'));

-- ---------------------------------------------------------------------------
-- 3. Ràng buộc chủ sở hữu: mỗi loại dùng đúng một cột id, không trộn
--    (giữ nguyên điều kiện cũ cho product/supplier/verification)
-- ---------------------------------------------------------------------------
alter table public.media_assets drop constraint if exists media_owner_ck;
alter table public.media_assets add constraint media_owner_ck check (
  (owner_type = 'product' and product_id is not null
    and verification_id is null and submission_id is null) or
  (owner_type = 'supplier' and supplier_id is not null and product_id is null
    and verification_id is null and submission_id is null) or
  (owner_type = 'verification' and verification_id is not null and supplier_id is not null
    and product_id is null and submission_id is null and audience = 'internal') or
  (owner_type = 'submission' and submission_id is not null and supplier_id is not null
    and product_id is null and verification_id is null and audience = 'internal')
);

-- ---------------------------------------------------------------------------
-- 4. checklist_key: bằng chứng tự gửi cũng có mục bảng kiểm riêng (9 ảnh L2,
--    6 chứng từ L3) nên phải thuộc diện được phép có checklist_key.
--    Danh sách mục giữ nguyên như 20261020 + 20261017_factory_delivery_inline_evidence.
-- ---------------------------------------------------------------------------
alter table public.media_assets drop constraint if exists media_checklist_key_ck;
alter table public.media_assets add constraint media_checklist_key_ck check (
  checklist_key is null or
  (owner_type in ('verification', 'submission') and checklist_key in (
    'business_license', 'tax_certificate', 'bank_letter', 'food_safety',
    'haccp_or_brc', 'product_certs', 'export_license',
    'factory_address_confirmed', 'production_line_seen', 'warehouse_seen',
    'qc_lab_seen', 'documents_original', 'capacity_verified',
    'worker_interview', 'management_interview', 'photos_taken',
    'order_matched', 'shipping_proof', 'delivery_proof',
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe',
    'pest_control',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health'
  ))
);

-- ---------------------------------------------------------------------------
-- 5. Index tra cứu bằng chứng theo hồ sơ
-- ---------------------------------------------------------------------------
create index if not exists media_submission_idx
  on public.media_assets (submission_id, sort_order, created_at)
  where submission_id is not null;


notify pgrst, 'reload schema';

-- Kiểm tra nhanh sau khi chạy:
--  select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'media_assets'
--     and column_name in ('verification_id','submission_id');
--  Mong đợi 2 dòng (uuid, uuid).
--  select conname from pg_constraint
--   where conrelid = 'public.media_assets'::regclass and conname like 'media_%';
--  Mong đợi thấy: media_assets_owner_type_check, media_owner_ck,
--  media_checklist_key_ck, media_assets_verification_id_fkey,
--  media_assets_submission_id_fkey.

-- END supabase/migrations/20261031_supplier_submission_media_owner.sql


-- BEGIN supabase/migrations/20261032_supplier_attribute_pool.sql
-- Thông số do nhà cung cấp tự thêm cho một nhóm hàng.
--
-- Vexim không phải bên hiểu thông số bằng chính nhà máy, nên NCC được tự thêm thông số
-- còn thiếu khi khai sản phẩm. Những mục này lưu ở cấp danh mục để nhà cung cấp khác
-- trong cùng nhóm hàng dùng lại mà Vexim không phải nhập tay.
--
-- Tách khỏi product_fields (cấu hình CMS): thông số tự thêm KHÔNG tham gia bộ lọc buyer
-- và KHÔNG tự hiện trên trang buyer. Khi Vexim muốn công bố, chuyển mục tương ứng sang
-- product_fields trong CRM.
alter table public.categories
  add column if not exists supplier_product_fields jsonb not null default '[]'::jsonb;

comment on column public.categories.supplier_product_fields is
  'Thông số NCC tự thêm cho nhóm hàng (gợi ý dùng lại cho NCC khác, không phải cấu hình CMS, không lên bộ lọc buyer).';

-- END supabase/migrations/20261032_supplier_attribute_pool.sql


-- BEGIN supabase/migrations/20261033_uploaded_documents_single_reviewer.sql
-- Duyệt được đợt kiểm giấy tờ do NCC tự tải lên (không có người kiểm tách biệt).
--
-- Bối cảnh: hồ sơ L1 do nhà cung cấp tự tải lên được tạo với inspector_id = null.
-- Ràng buộc bốn mắt cũ đòi inspector_id not null, nên các đợt này không bao giờ
-- duyệt được: nhân viên bấm Duyệt chỉ nhận thông báo "Bản kiểm thiếu người kiểm".
--
-- Cách sửa: thêm cờ self_approved. Một đợt KHÔNG có người kiểm chỉ được duyệt
-- khi cờ này được ghi rõ ràng (kèm xác nhận của người duyệt và một dòng audit
-- log), tức là hồ sơ nói thật "một người vừa đối chiếu vừa duyệt". Mọi đợt ĐÃ
-- có người kiểm vẫn bắt buộc người duyệt khác người kiểm như trước.
--
-- Chạy trên Supabase project của app, trước hoặc cùng lúc với lần deploy này.

alter table public.verifications
  add column if not exists self_approved boolean not null default false;

-- Bỏ ràng buộc cũ trước: nếu không, chính lệnh update này bị chặn.
alter table public.verifications drop constraint if exists verifications_four_eyes;

alter table public.verifications add constraint verifications_four_eyes
  check (
    approved_by is null
    or (inspector_id is not null and (inspector_id <> approved_by or legacy_self_approved))
    or (inspector_id is null and self_approved)
  ) not valid;


notify pgrst, 'reload schema';

-- END supabase/migrations/20261033_uploaded_documents_single_reviewer.sql


-- BEGIN supabase/migrations/20261034_admin_self_approval.sql
-- Allow an active admin to approve a verification they inspected themselves.
-- The application requires an explicit re-check confirmation and writes an audit
-- log. Reviewer self-approval remains blocked in both the application and DB.
-- Apply after 20261033_uploaded_documents_single_reviewer.sql.

alter table public.verifications
  add column if not exists legacy_self_approved boolean not null default false,
  add column if not exists self_approved boolean not null default false;

-- The row-level CHECK recognizes an explicit single-person decision. The trigger
-- below narrows the same-inspector exception to an active admin; supplier-uploaded
-- reviews (inspector_id IS NULL) retain the behaviour introduced in 20261033.
alter table public.verifications drop constraint if exists verifications_four_eyes;
alter table public.verifications add constraint verifications_four_eyes
  check (
    approved_by is null
    or (inspector_id is not null and (
      inspector_id <> approved_by or legacy_self_approved or self_approved
    ))
    or (inspector_id is null and self_approved)
  ) not valid;

create or replace function public.check_verification_self_approval()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.approved_by is not null
     and new.inspector_id = new.approved_by
     and not new.legacy_self_approved
     and not exists (
       select 1 from public.app_users u
       where u.id = new.approved_by
         and u.role = 'admin'
         and u.is_active
     ) then
    raise exception 'Only an active admin can self-approve a verification';
  end if;
  return new;
end;
$$;

drop trigger if exists verifications_self_approval_guard on public.verifications;
create trigger verifications_self_approval_guard
  before insert or update of status, inspector_id, approved_by, self_approved, legacy_self_approved
  on public.verifications
  for each row execute function public.check_verification_self_approval();

revoke all on function public.check_verification_self_approval() from public, anon, authenticated;

comment on column public.verifications.self_approved is
  'Explicit single-person decision: supplier-uploaded review with no inspector, or active admin re-checking and approving their own inspection. Always audit logged.';


notify pgrst, 'reload schema';

-- END supabase/migrations/20261034_admin_self_approval.sql


-- BEGIN supabase/migrations/20261035_single_person_verification.sql
-- Single-person verification for staff who hold BOTH inspect and approve
-- permissions (admin and sourcing). This removes the mandatory second-reviewer
-- bottleneck without allowing AI or supplier accounts to approve themselves.
-- Apply after 20261033; this migration is self-contained and supersedes the
-- admin-only exception in 20261034 when both are present.

alter table public.verifications
  add column if not exists legacy_self_approved boolean not null default false,
  add column if not exists self_approved boolean not null default false;

alter table public.verifications drop constraint if exists verifications_four_eyes;
alter table public.verifications add constraint verifications_four_eyes
  check (
    approved_by is null
    or (inspector_id is not null and (
      inspector_id <> approved_by or legacy_self_approved or self_approved
    ))
    or (inspector_id is null and self_approved)
  ) not valid;

-- Keep the DB role check aligned with the application permission matrix.
-- Reviewer can still approve somebody else's inspection, but cannot use the
-- same-person path because that role does not hold verifications.inspect.
create or replace function public.check_verification_self_approval()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.approved_by is not null
     and new.inspector_id = new.approved_by
     and not new.legacy_self_approved
     and not exists (
       select 1 from public.app_users u
       where u.id = new.approved_by
         and u.role in ('admin', 'sourcing')
         and u.is_active
     ) then
    raise exception 'Only active staff with inspect and approve permissions can complete their own verification';
  end if;
  return new;
end;
$$;

drop trigger if exists verifications_self_approval_guard on public.verifications;
create trigger verifications_self_approval_guard
  before insert or update of status, inspector_id, approved_by, self_approved, legacy_self_approved
  on public.verifications
  for each row execute function public.check_verification_self_approval();

revoke all on function public.check_verification_self_approval() from public, anon, authenticated;

comment on column public.verifications.self_approved is
  'Explicit single-person decision: supplier-uploaded review with no inspector, or authorized admin/sourcing staff completing their own inspection after an evidence re-check. AI never approves. Always audit logged.';


notify pgrst, 'reload schema';

-- END supabase/migrations/20261035_single_person_verification.sql


-- BEGIN supabase/migrations/20261036_supplier_translation_schema_repair.sql
-- Hotfix cho lỗi PostgREST PGRST204 khi lưu bản dịch hồ sơ NCC.
-- Chạy toàn bộ file này trên đúng Supabase project mà ứng dụng đang dùng.
-- Idempotent: không xóa hoặc ghi đè bản dịch hiện có.

alter table public.suppliers
  add column if not exists intro_source text,
  add column if not exists moq_text_i18n jsonb not null default '{}'::jsonb,
  add column if not exists export_markets_i18n jsonb not null default '{}'::jsonb,
  add column if not exists profile_translation_meta jsonb;

-- Hồ sơ cũ có thể chỉ lưu giới thiệu trong summary_i18n.en.
-- Giữ nguyên văn làm nguồn để service dịch; không sửa nội dung do NCC đã nhập.
-- Không backfill vào hồ sơ có bản tiếng Anh đã được nhân sự chốt.
update public.suppliers
set intro_source = summary_i18n ->> 'en'
where intro_source is null
  and coalesce(summary_i18n ->> 'en', '') <> ''
  and coalesce(profile_translation_meta ->> 'origin', '') <> 'staff';

notify pgrst, 'reload schema';

-- END supabase/migrations/20261036_supplier_translation_schema_repair.sql


-- BEGIN supabase/migrations/20261037_product_raw_material_profile.sql
-- Supplier-stated sourcing details for each product in CRM, supplier portal and buyer comparisons.
-- Nullable columns keep existing products valid. These fields are not verification results.
alter table public.supplier_products
  add column if not exists raw_material_region text,
  add column if not exists input_material_origin text;

comment on column public.supplier_products.raw_material_region is
  'Product-specific raw material region; may contain a province suggestion or a custom region.';
comment on column public.supplier_products.input_material_origin is
  'Product-specific origin of input raw materials; not an independent origin verification.';

notify pgrst, 'reload schema';

-- END supabase/migrations/20261037_product_raw_material_profile.sql


-- BEGIN supabase/migrations/20261038_supplier_product_self_management.sql
-- Cổng NCC: tạm ẩn sản phẩm đã duyệt và xóa an toàn bản nháp chưa có lịch sử.
-- Chạy sau các migration sản phẩm/duyệt, trước khi deploy mã mới. Không thay đổi
-- trạng thái hay xóa dữ liệu hiện có khi áp dụng migration này.

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

notify pgrst, 'reload schema';

-- END supabase/migrations/20261038_supplier_product_self_management.sql


-- BEGIN supabase/migrations/20261039_l3_other_export_evidence.sql
-- Chấp nhận thêm chứng từ xuất khẩu khác trong hồ sơ L3 và đợt kiểm nhân viên.
-- Chạy sau 20261031_supplier_submission_media_owner.sql và trước khi deploy code.
-- Không sửa loại, kết quả hay trạng thái của bằng chứng/hồ sơ hiện có.

alter table public.supplier_submission_items drop constraint if exists supplier_submission_items_key_ck;
alter table public.supplier_submission_items add constraint supplier_submission_items_key_ck check (
  checklist_key in (
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe',
    'pest_control',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'
  )
);

alter table public.media_assets drop constraint if exists media_checklist_key_ck;
alter table public.media_assets add constraint media_checklist_key_ck check (
  checklist_key is null or
  (owner_type in ('verification', 'submission') and checklist_key in (
    'business_license', 'tax_certificate', 'bank_letter', 'food_safety',
    'haccp_or_brc', 'product_certs', 'export_license',
    'factory_address_confirmed', 'production_line_seen', 'warehouse_seen',
    'qc_lab_seen', 'documents_original', 'capacity_verified',
    'worker_interview', 'management_interview', 'photos_taken',
    'order_matched', 'shipping_proof', 'delivery_proof',
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe',
    'pest_control',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'
  ))
);

-- Serialize L3 file mutations with submission and keep the pending queue meaningful.
-- The shared parent-row lock prevents a delete/upload racing a manual submission.
create or replace function public.guard_l3_submission_item_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  parent_id uuid;
  parent_level smallint;
  parent_status text;
begin
  if tg_op = 'INSERT' then parent_id := new.submission_id;
  else parent_id := old.submission_id;
  end if;

  select target_level, status into parent_level, parent_status
    from public.supplier_submissions where id = parent_id for update;
  -- A parent already deleted by a cascade need not be locked or checked.
  if not found or parent_level <> 3 then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if parent_status not in ('draft', 'returned') then
    raise exception using errcode = 'P0001', message = 'L3_SUBMISSION_LOCKED';
  end if;
  if tg_op = 'INSERT' and new.media_id is not null and (
    select count(*) from public.supplier_submission_items
    where submission_id = parent_id and checklist_key = new.checklist_key and media_id is not null
  ) >= 3 then
    raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_LIMIT';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_l3_submission_item_mutation() from public;
drop trigger if exists guard_l3_submission_items on public.supplier_submission_items;
create trigger guard_l3_submission_items before insert or delete on public.supplier_submission_items
  for each row execute function public.guard_l3_submission_item_mutation();

create or replace function public.guard_l3_pending_evidence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.target_level = 3 and new.status = 'pending_review' and old.status <> 'pending_review'
    and not exists (
      select 1 from public.supplier_submission_items i
      where i.submission_id = new.id and i.media_id is not null
        and nullif(btrim(i.storage_path), '') is not null
        and i.checklist_key in ('bill_of_lading', 'customs_declaration', 'commercial_invoice',
          'packing_list', 'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence')
    ) then
    raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_l3_pending_evidence() from public;
drop trigger if exists guard_l3_pending_evidence on public.supplier_submissions;
create trigger guard_l3_pending_evidence before update of status on public.supplier_submissions
  for each row execute function public.guard_l3_pending_evidence();


notify pgrst, 'reload schema';

-- END supabase/migrations/20261039_l3_other_export_evidence.sql


-- BEGIN supabase/migrations/20261040_l2_partner_contract.sql
-- L2 thương mại: phạm vi là hợp đồng với nhà máy đối tác, KHÔNG phải kiểm nhà máy sở hữu.
-- Chạy sau 20261031_supplier_submission_media_owner.sql và 20261039_l3_other_export_evidence.sql.
-- Không sửa hồ sơ, kết luận hoặc loại hình cũ. NULL ở L2 giữ nghĩa luồng nhà máy cũ.

alter table public.supplier_submissions add column if not exists l2_scope text;
alter table public.verifications add column if not exists l2_scope text;
alter table public.supplier_submissions drop constraint if exists supplier_submissions_l2_scope_ck;
alter table public.supplier_submissions add constraint supplier_submissions_l2_scope_ck check (
  l2_scope is null or (target_level = 2 and l2_scope in ('factory', 'partner_contract'))
);
alter table public.verifications drop constraint if exists verifications_l2_scope_ck;
alter table public.verifications add constraint verifications_l2_scope_ck check (
  l2_scope is null or (target_level = 2 and l2_scope in ('factory', 'partner_contract'))
);

-- Retain an existing factory draft, including one on a trader's account. A new
-- partner case is separate; neither case is rewritten or silently transferred.
drop index if exists public.supplier_submissions_one_open_per_level;
create unique index if not exists supplier_submissions_one_open_per_scope
  on public.supplier_submissions (supplier_id, target_level, coalesce(l2_scope, 'factory'))
  where status <> 'accepted';

alter table public.supplier_submission_items drop constraint if exists supplier_submission_items_key_ck;
alter table public.supplier_submission_items add constraint supplier_submission_items_key_ck check (
  checklist_key in (
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe', 'pest_control',
    'partner_factory_contract', 'partner_factory_photos',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'
  )
);
alter table public.media_assets drop constraint if exists media_checklist_key_ck;
alter table public.media_assets add constraint media_checklist_key_ck check (
  checklist_key is null or
  (owner_type in ('verification', 'submission') and checklist_key in (
    'business_license', 'tax_certificate', 'bank_letter', 'food_safety',
    'haccp_or_brc', 'product_certs', 'export_license',
    'factory_address_confirmed', 'production_line_seen', 'warehouse_seen',
    'qc_lab_seen', 'documents_original', 'capacity_verified', 'worker_interview', 'management_interview', 'photos_taken',
    'order_matched', 'shipping_proof', 'delivery_proof',
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe', 'pest_control',
    'partner_factory_contract', 'partner_factory_photos',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'
  ))
);

-- New cases follow the registered type; a legacy NULL scope still means factory.
-- Existing records are left untouched and may be inspected as history.
create or replace function public.guard_new_l2_scope_type()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare current_type text; expected_scope text;
begin
  if new.target_level <> 2 then return new; end if;
  select supplier_type into current_type from public.suppliers where id = new.supplier_id for share;
  expected_scope := case when current_type = 'trading' then 'partner_contract'
                         when current_type in ('manufacturer', 'cooperative') then 'factory' else null end;
  if expected_scope is null or coalesce(new.l2_scope, 'factory') <> expected_scope then
    raise exception using errcode = 'P0001', message = 'L2_SCOPE_TYPE_MISMATCH';
  end if;
  if tg_table_name = 'verifications' and new.l2_scope = 'partner_contract' and new.status = 'approved' then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_APPROVAL_REQUIRES_REVIEW';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_new_l2_scope_type() from public;
drop trigger if exists guard_new_submission_l2_scope on public.supplier_submissions;
create trigger guard_new_submission_l2_scope before insert on public.supplier_submissions
  for each row execute function public.guard_new_l2_scope_type();
drop trigger if exists guard_new_review_l2_scope on public.verifications;
create trigger guard_new_review_l2_scope before insert on public.verifications
  for each row execute function public.guard_new_l2_scope_type();

-- Neither type changes nor a later staff edit can change the legal entity,
-- level or meaning of an existing submission/review.
create or replace function public.guard_verification_scope_identity()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.supplier_id is distinct from old.supplier_id or
     new.target_level is distinct from old.target_level or
     new.l2_scope is distinct from old.l2_scope then
    raise exception using errcode = 'P0001', message = 'VERIFICATION_SCOPE_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_verification_scope_identity() from public;
drop trigger if exists guard_submission_scope_identity on public.supplier_submissions;
create trigger guard_submission_scope_identity before update of supplier_id, target_level, l2_scope on public.supplier_submissions
  for each row execute function public.guard_verification_scope_identity();
drop trigger if exists guard_review_scope_identity on public.verifications;
create trigger guard_review_scope_identity before update of supplier_id, target_level, l2_scope on public.verifications
  for each row execute function public.guard_verification_scope_identity();

-- Share the parent row lock with pending transition; enforce scope-specific keys,
-- a maximum of three files and no edits while a manual case is in the queue.
create or replace function public.guard_l3_submission_item_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  parent_id uuid;
  parent_supplier uuid;
  parent_level smallint;
  parent_scope text;
  parent_status text;
  manual_case boolean;
begin
  if tg_op = 'INSERT' then parent_id := new.submission_id; else parent_id := old.submission_id; end if;
  select target_level, l2_scope, status, supplier_id into parent_level, parent_scope, parent_status, parent_supplier
    from public.supplier_submissions where id = parent_id for update;
  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'INSERT' then
    if (parent_level = 2 and parent_scope = 'partner_contract' and new.supplier_id is distinct from parent_supplier)
       or (parent_level = 2 and parent_scope = 'partner_contract' and new.checklist_key not in ('partner_factory_contract', 'partner_factory_photos'))
       or (coalesce(parent_scope, '') <> 'partner_contract' and new.checklist_key in ('partner_factory_contract', 'partner_factory_photos')) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_KEY_MISMATCH';
    end if;
  end if;
  manual_case := parent_level = 3 or (parent_level = 2 and coalesce(parent_scope, 'factory') = 'partner_contract');
  if not manual_case then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if parent_status not in ('draft', 'returned') then
    raise exception using errcode = 'P0001', message = 'L3_SUBMISSION_LOCKED';
  end if;
  if tg_op = 'INSERT' and new.media_id is not null and (
    select count(*) from public.supplier_submission_items
    where submission_id = parent_id and checklist_key = new.checklist_key and media_id is not null
  ) >= 3 then
    raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_LIMIT';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_l3_submission_item_mutation() from public;
drop trigger if exists guard_l3_submission_items on public.supplier_submission_items;
create trigger guard_l3_submission_items before insert or delete on public.supplier_submission_items
  for each row execute function public.guard_l3_submission_item_mutation();

create or replace function public.guard_partner_submission_item_update()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare p_level smallint; p_scope text; p_status text; destination_scope text;
begin
  select target_level, l2_scope, status into p_level, p_scope, p_status
    from public.supplier_submissions where id = old.submission_id for update;
  if new.submission_id is distinct from old.submission_id then
    select l2_scope into destination_scope from public.supplier_submissions where id = new.submission_id for update;
    if destination_scope = 'partner_contract' or p_level = 3 or (p_level = 2 and p_scope = 'partner_contract') or exists (select 1 from public.supplier_submissions where id = new.submission_id and target_level = 3) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_KEY_MISMATCH';
    end if;
  end if;
  if found and (p_level = 3 or (p_level = 2 and p_scope = 'partner_contract')) then
    if p_status not in ('draft', 'returned') then
      raise exception using errcode = 'P0001', message = 'L3_SUBMISSION_LOCKED';
    end if;
    if new.submission_id is distinct from old.submission_id or new.supplier_id is distinct from old.supplier_id or
       new.checklist_key is distinct from old.checklist_key or (p_level = 2 and new.checklist_key not in ('partner_factory_contract', 'partner_factory_photos')) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_KEY_MISMATCH';
    end if;
    if old.media_id is null and new.media_id is not null and (
      select count(*) from public.supplier_submission_items
      where submission_id = old.submission_id and checklist_key = old.checklist_key and media_id is not null
    ) >= 3 then
      raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_LIMIT';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_partner_submission_item_update() from public;
drop trigger if exists guard_partner_submission_item_update on public.supplier_submission_items;
create trigger guard_partner_submission_item_update before update of submission_id, supplier_id, checklist_key, media_id, storage_path on public.supplier_submission_items
  for each row execute function public.guard_partner_submission_item_update();

create or replace function public.guard_l3_pending_evidence()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare current_type text; expected_scope text;
begin
  if new.status = 'pending_review' and old.status <> 'pending_review' then
    if new.target_level = 2 then
      select supplier_type into current_type from public.suppliers where id = new.supplier_id for share;
      expected_scope := case when current_type = 'trading' then 'partner_contract'
                             when current_type in ('manufacturer', 'cooperative') then 'factory' else null end;
      if expected_scope is null or coalesce(new.l2_scope, 'factory') <> expected_scope then
        raise exception using errcode = 'P0001', message = 'L2_SCOPE_TYPE_MISMATCH';
      end if;
    end if;
    if new.target_level = 3 and not exists (
      select 1 from public.supplier_submission_items i
      where i.submission_id = new.id and i.media_id is not null and nullif(btrim(i.storage_path), '') is not null
        and i.checklist_key in ('bill_of_lading', 'customs_declaration', 'commercial_invoice',
          'packing_list', 'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence')
    ) then
      raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_REQUIRED';
    end if;
    if new.target_level = 2 and new.l2_scope = 'partner_contract' and not exists (
      select 1 from public.supplier_submission_items i
      join public.media_assets m on m.id = i.media_id
      where i.submission_id = new.id and i.supplier_id = new.supplier_id
        and i.checklist_key = 'partner_factory_contract' and nullif(btrim(i.storage_path), '') is not null
        and m.owner_type = 'submission' and m.submission_id = new.id and m.supplier_id = new.supplier_id
        and m.storage_path = i.storage_path and m.checklist_key = i.checklist_key
        and m.audience = 'internal' and m.kind in ('image', 'document')
    ) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_CONTRACT_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_l3_pending_evidence() from public;
drop trigger if exists guard_l3_pending_evidence on public.supplier_submissions;
create trigger guard_l3_pending_evidence before update of status on public.supplier_submissions
  for each row execute function public.guard_l3_pending_evidence();

-- Manual submission files share the same parent lock as the queue transition.
-- Reject moving them between submissions/entities and allow cleanup of an
-- unattached upload that lost a race with submit.
create or replace function public.guard_manual_submission_media()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare old_parent uuid; new_parent uuid; p_level smallint; p_scope text; p_status text; p_supplier uuid; manual_case boolean := false;
begin
  if tg_op <> 'INSERT' then old_parent := old.submission_id; end if;
  if tg_op <> 'DELETE' then new_parent := new.submission_id; end if;
  if old_parent is not null then
    select target_level, l2_scope, status, supplier_id into p_level, p_scope, p_status, p_supplier
      from public.supplier_submissions where id = old_parent for update;
    manual_case := found and (p_level = 3 or (p_level = 2 and coalesce(p_scope, 'factory') = 'partner_contract'));
    if manual_case and tg_op = 'UPDATE' and new_parent is distinct from old_parent then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
    end if;
  end if;
  if new_parent is not null and (old_parent is null or new_parent is distinct from old_parent) then
    select target_level, l2_scope, status, supplier_id into p_level, p_scope, p_status, p_supplier
      from public.supplier_submissions where id = new_parent for update;
    manual_case := found and (p_level = 3 or (p_level = 2 and coalesce(p_scope, 'factory') = 'partner_contract'));
    if manual_case and tg_op = 'UPDATE' then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
    end if;
  end if;
  if not manual_case then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  if p_status not in ('draft', 'returned') then
    if tg_op = 'DELETE' and not exists (select 1 from public.supplier_submission_items where media_id = old.id) then return old; end if;
    raise exception using errcode = 'P0001', message = 'L3_SUBMISSION_LOCKED';
  end if;
  if tg_op <> 'DELETE' and (new.owner_type <> 'submission' or new.submission_id is distinct from coalesce(old_parent, new_parent)
      or new.supplier_id is distinct from p_supplier or new.audience is distinct from 'internal' or new.kind is null or new.kind not in ('image', 'document', 'certificate') or new.checklist_key is null
      or (p_scope = 'partner_contract' and (new.checklist_key not in ('partner_factory_contract', 'partner_factory_photos')
          or (new.checklist_key = 'partner_factory_photos' and new.kind <> 'image') or (new.checklist_key = 'partner_factory_contract' and new.kind not in ('image', 'document'))))
      or (p_level = 3 and new.checklist_key not in ('bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
          'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'))) then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_manual_submission_media() from public;
drop trigger if exists guard_manual_submission_media on public.media_assets;
create trigger guard_manual_submission_media before insert or update or delete on public.media_assets
  for each row execute function public.guard_manual_submission_media();

-- Lock partner evidence to its review and keep it private. Taking the same
-- review lock serializes edits/deletes against approval.
create or replace function public.guard_partner_review_media()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare review_id uuid; review_scope text; review_status text; review_supplier uuid;
begin
  -- Never move an existing file into or out of a partner review; create a new
  -- internal evidence record instead. Check the destination as well as source.
  if tg_op = 'UPDATE' and new.verification_id is distinct from old.verification_id and new.verification_id is not null then
    select l2_scope into review_scope from public.verifications where id = new.verification_id for update;
    if found and review_scope = 'partner_contract' then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
    end if;
  end if;
  if tg_op = 'INSERT' then review_id := new.verification_id; else review_id := old.verification_id; end if;
  if review_id is null then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  select l2_scope, status, supplier_id into review_scope, review_status, review_supplier
    from public.verifications where id = review_id for update;
  if not found or review_scope is distinct from 'partner_contract' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if review_status not in ('scheduled', 'in_progress', 'returned') then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_REVIEW_LOCKED';
  end if;
  if tg_op <> 'DELETE' and (new.verification_id is distinct from review_id or new.supplier_id is distinct from review_supplier
      or new.owner_type <> 'verification' or new.audience <> 'internal') then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_partner_review_media() from public;
drop trigger if exists guard_partner_review_media on public.media_assets;
create trigger guard_partner_review_media before insert or update or delete on public.media_assets
  for each row execute function public.guard_partner_review_media();

-- The human reviewer must mark the contract checked and confirm the parties
-- and restricted scope. This is not a factory ownership or site-visit claim.
create or replace function public.guard_partner_review_approval()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare current_type text;
begin
  if new.target_level = 2 and new.status = 'approved' and old.status <> 'approved' then
    select supplier_type into current_type from public.suppliers where id = new.supplier_id for share;
    if (new.l2_scope = 'partner_contract' and current_type is distinct from 'trading') or
       (coalesce(new.l2_scope, 'factory') = 'factory' and (current_type is null or current_type not in ('manufacturer', 'cooperative'))) then
      raise exception using errcode = 'P0001', message = 'L2_SCOPE_TYPE_MISMATCH';
    end if;
  end if;
  if new.target_level = 2 and new.l2_scope = 'partner_contract' and new.status = 'approved' and old.status <> 'approved' then
    if not exists (
      select 1 from public.media_assets m where m.verification_id = new.id and m.owner_type = 'verification'
        and m.supplier_id = new.supplier_id and m.checklist_key = 'partner_factory_contract'
        and m.kind in ('image', 'document') and m.audience = 'internal' and m.status = 'checked'
        and nullif(btrim(m.storage_path), '') is not null
    ) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_CONTRACT_CHECK_REQUIRED';
    end if;
    if new.checklist->>'partner_identity_confirmed' is distinct from 'true' or
       new.checklist->>'partner_scope_confirmed' is distinct from 'true' then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_SCOPE_CONFIRM_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_partner_review_approval() from public;
drop trigger if exists guard_partner_review_approval on public.verifications;
create trigger guard_partner_review_approval before update of status on public.verifications
  for each row execute function public.guard_partner_review_approval();


notify pgrst, 'reload schema';

-- END supabase/migrations/20261040_l2_partner_contract.sql


-- BEGIN supabase/migrations/20261041_l2_factory_submission_guards.sql
-- Keep factory submissions complete and immutable while a person reviews them.
-- Apply after 20261040_l2_partner_contract.sql. No existing status is changed.
-- AI findings (including historical `hard` flags) never block submission.

-- Item mutations share the submission row lock with the transition to pending.
-- AI may still update its advisory fields on an already-submitted item.
create or replace function public.guard_l2_factory_item_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  parent_id uuid;
  p_level smallint;
  p_scope text;
  p_status text;
  p_supplier uuid;
  destination_factory boolean := false;
begin
  if tg_op = 'INSERT' then parent_id := new.submission_id; else parent_id := old.submission_id; end if;
  select target_level, l2_scope, status, supplier_id into p_level, p_scope, p_status, p_supplier
    from public.supplier_submissions where id = parent_id for update;
  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'UPDATE' and new.submission_id is distinct from old.submission_id then
    select exists(select 1 from public.supplier_submissions s where s.id = new.submission_id
      and s.target_level = 2 and coalesce(s.l2_scope, 'factory') = 'factory') into destination_factory;
    if (p_level = 2 and coalesce(p_scope, 'factory') = 'factory') or destination_factory then
      raise exception using errcode = 'P0001', message = 'L2_FACTORY_ITEM_INVALID';
    end if;
  end if;
  if p_level <> 2 or coalesce(p_scope, 'factory') <> 'factory' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if p_status not in ('draft', 'returned') then
    raise exception using errcode = 'P0001', message = 'L2_FACTORY_LOCKED';
  end if;
  if tg_op <> 'DELETE' and (new.supplier_id is distinct from p_supplier or new.checklist_key not in (
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe', 'pest_control'
  )) then
    raise exception using errcode = 'P0001', message = 'L2_FACTORY_ITEM_INVALID';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_l2_factory_item_mutation() from public;
drop trigger if exists guard_l2_factory_item_insert_delete on public.supplier_submission_items;
create trigger guard_l2_factory_item_insert_delete before insert or delete on public.supplier_submission_items
  for each row execute function public.guard_l2_factory_item_mutation();
drop trigger if exists guard_l2_factory_item_identity on public.supplier_submission_items;
create trigger guard_l2_factory_item_identity before update of submission_id, supplier_id, checklist_key, media_id, storage_path, thumb_path, mime
  on public.supplier_submission_items for each row execute function public.guard_l2_factory_item_mutation();

-- Check structural requirements in the same transaction that locks the row.
-- Missing/incorrect codes reported by AI are suggestions for staff, not gates.
create or replace function public.guard_l2_factory_pending_evidence()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.target_level = 2 and coalesce(new.l2_scope, 'factory') = 'factory'
    and new.status = 'pending_review' and old.status <> 'pending_review' then
    if nullif(btrim(new.verification_code), '') is null or new.code_issued_at is null
      or new.code_issued_at < now() - interval '72 hours' then
      raise exception using errcode = 'P0001', message = 'L2_FACTORY_CODE_REQUIRED';
    end if;
    if (select count(distinct i.checklist_key) from public.supplier_submission_items i
      where i.submission_id = new.id and i.supplier_id = new.supplier_id
        and i.media_id is not null and nullif(btrim(i.storage_path), '') is not null
        and i.checklist_key in ('factory_gate', 'raw_material_warehouse', 'production_line_running',
          'packing_area', 'finished_goods_warehouse', 'open_carton_lot_label',
          'hygiene_station', 'worker_ppe', 'pest_control')) < 9 then
      raise exception using errcode = 'P0001', message = 'L2_FACTORY_PHOTOS_REQUIRED';
    end if;
    if exists (
      select 1 from public.supplier_submission_items i
      cross join lateral jsonb_array_elements(case when jsonb_typeof(i.flags) = 'array' then i.flags else '[]'::jsonb end) flag
      where i.submission_id = new.id and i.media_id is not null
        and i.checklist_key in ('factory_gate', 'production_line_running', 'finished_goods_warehouse')
        and flag->>'severity' = 'hard' and flag->>'source' is distinct from 'ai'
        and flag->>'flag' in ('code_missing', 'code_mismatch')
    ) then
      raise exception using errcode = 'P0001', message = 'L2_FACTORY_CODE_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_l2_factory_pending_evidence() from public;
drop trigger if exists guard_l2_factory_pending_evidence on public.supplier_submissions;
create trigger guard_l2_factory_pending_evidence before update of status on public.supplier_submissions
  for each row execute function public.guard_l2_factory_pending_evidence();


notify pgrst, 'reload schema';

-- END supabase/migrations/20261041_l2_factory_submission_guards.sql


-- BEGIN supabase/migrations/20261042_sponsored_placement_guards.sql
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

-- END supabase/migrations/20261042_sponsored_placement_guards.sql


-- BEGIN supabase/migrations/20261043_sponsored_requests.sql
-- Yêu cầu báo giá, độc lập với gói/quyết định duyệt/thanh toán.
-- Chỉ ứng dụng phía server dùng service_role; không cấp quyền cho browser.
create table if not exists public.sponsored_requests (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  product_id uuid references public.supplier_products(id) on delete set null,
  requested_by uuid references public.app_users(id) on delete set null,
  -- Lưu tên tại thời điểm gửi để nhân viên vẫn hiểu yêu cầu khi bản gốc bị xoá.
  supplier_name text not null check (length(trim(supplier_name)) between 1 and 300),
  product_name text not null check (length(trim(product_name)) between 1 and 300),
  category_slug text not null check (length(trim(category_slug)) between 1 and 200),
  category_name text not null check (length(trim(category_name)) between 1 and 300),
  requester_email text not null check (length(trim(requester_email)) between 1 and 320),
  note text check (note is null or length(note) <= 500),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chỉ một yêu cầu chưa kết thúc cho mỗi sản phẩm, kể cả khi gửi đồng thời.
create unique index if not exists sponsored_requests_one_open_idx
  on public.sponsored_requests (supplier_id, product_id)
  where status in ('new', 'contacted') and supplier_id is not null and product_id is not null;
create index if not exists sponsored_requests_supplier_idx
  on public.sponsored_requests (supplier_id, created_at desc);
create index if not exists sponsored_requests_status_idx
  on public.sponsored_requests (status, created_at desc);

create or replace function public.guard_sponsored_request()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'new' or new.updated_by is not null or
       new.supplier_id is null or new.product_id is null or new.requested_by is null or
       not exists (select 1 from public.app_users u where u.id = new.requested_by
         and u.role = 'supplier' and u.is_active and u.supplier_id = new.supplier_id) or
       not exists (select 1 from public.supplier_products p where p.id = new.product_id
         and p.supplier_id = new.supplier_id) then
      raise exception 'Invalid sponsored request owner';
    end if;
  elsif new.status is distinct from old.status then
    if not (old.status = 'new' and new.status in ('contacted', 'closed') or
            old.status = 'contacted' and new.status = 'closed') or
       not exists (select 1 from public.app_users u where u.id = new.updated_by
         and u.is_active and u.role in ('admin', 'reviewer', 'sale')) then
      raise exception 'Invalid sponsored request transition';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function public.guard_sponsored_request() from public, anon, authenticated;
grant execute on function public.guard_sponsored_request() to service_role;
drop trigger if exists sponsored_requests_guard on public.sponsored_requests;
create trigger sponsored_requests_guard before insert or update on public.sponsored_requests
  for each row execute function public.guard_sponsored_request();

alter table public.sponsored_requests enable row level security;
revoke all on public.sponsored_requests from public, anon, authenticated;
grant select, insert, update on public.sponsored_requests to service_role;
comment on table public.sponsored_requests is 'Yêu cầu báo giá; không tạo hoặc duyệt gói quảng cáo.';

-- END supabase/migrations/20261043_sponsored_requests.sql


-- BEGIN supabase/migrations/20261046_sponsored_consented_metrics.sql
-- Separate the new consent-gated series from historical, potentially ungated
-- counters. Do not delete or silently reclassify historical measurements.
create table if not exists public.sponsored_push_consented_daily (
  push_id uuid not null references public.sponsored_pushes(id) on delete cascade,
  day date not null,
  event_type text not null check (event_type in ('impression', 'click')),
  events bigint not null default 0 check (events >= 0),
  primary key (push_id, day, event_type)
);
alter table public.sponsored_push_consented_daily enable row level security;
revoke all on public.sponsored_push_consented_daily from public, anon, authenticated;
grant select, insert, update on public.sponsored_push_consented_daily to service_role;

-- Called only by the server endpoint AFTER it checks the consent cookie.
create or replace function public.record_consented_sponsored_push_event(p_push_id uuid, p_event_type text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_event_type not in ('impression', 'click') then
    raise exception 'Invalid sponsored push event';
  end if;
  if not exists (
    select 1 from public.sponsored_pushes s where s.id = p_push_id
      and s.status = 'approved' and s.starts_at <= now() and s.ends_at > now()
  ) then return; end if;
  insert into public.sponsored_push_consented_daily (push_id, day, event_type, events)
    values (p_push_id, (now() at time zone 'UTC')::date, p_event_type, 1)
  on conflict (push_id, day, event_type)
    do update set events = public.sponsored_push_consented_daily.events + 1;
end;
$$;
revoke all on function public.record_consented_sponsored_push_event(uuid, text) from public, anon, authenticated;
grant execute on function public.record_consented_sponsored_push_event(uuid, text) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261046_sponsored_consented_metrics.sql


-- BEGIN supabase/migrations/20261047_sponsored_offer_settings.sql
-- Configuration only. Does not open checkout, create orders or alter existing pushes.
-- Apply to staging first. Only the server service role may access this table.
create table if not exists public.sponsored_offer_settings (
  id boolean primary key default true check (id),
  price_vnd bigint check (price_vnd between 1 and 1000000000),
  hold_minutes integer not null default 20 check (hold_minutes between 1 and 1440),
  packages_per_slot integer not null default 4 check (packages_per_slot between 1 and 20),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id)
);
insert into public.sponsored_offer_settings (id) values (true) on conflict (id) do nothing;
alter table public.sponsored_offer_settings enable row level security;
revoke all on public.sponsored_offer_settings from public, anon, authenticated;
grant select, update on public.sponsored_offer_settings to service_role;

create or replace function public.guard_sponsored_offer_settings()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.app_users where id = new.updated_by and role = 'admin' and is_active) then
    raise exception 'Active admin required to update sponsored offer settings';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists sponsored_offer_settings_guard on public.sponsored_offer_settings;
create trigger sponsored_offer_settings_guard before update on public.sponsored_offer_settings
  for each row execute function public.guard_sponsored_offer_settings();
revoke all on function public.guard_sponsored_offer_settings() from public, anon, authenticated;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261047_sponsored_offer_settings.sql


-- BEGIN supabase/migrations/20261048_sponsored_retire_manual.sql
-- Retire manual creation/approval without modifying or deleting existing rows.
-- New paid activation must be introduced by a future reviewed migration; until
-- then all inserts and every transition into approved are denied, including
-- calls made with service_role. Existing approved packages continue unchanged.
create or replace function public.guard_retired_sponsored_manual_flow()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    raise exception 'Manual sponsored package creation is disabled';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    raise exception 'Manual sponsored package activation is disabled';
  end if;
  return new;
end;
$$;
drop trigger if exists sponsored_manual_flow_retired on public.sponsored_pushes;
create trigger sponsored_manual_flow_retired before insert or update on public.sponsored_pushes
  for each row execute function public.guard_retired_sponsored_manual_flow();
revoke all on function public.guard_retired_sponsored_manual_flow() from public, anon, authenticated;

-- Record a violation stop and the state change in the same transaction. This
-- records no customer payment/refund and does not alter the paid time window.
create table if not exists public.sponsored_violation_stops (
  id uuid primary key default gen_random_uuid(),
  push_id uuid not null references public.sponsored_pushes(id),
  actor_id uuid not null references public.app_users(id),
  reason text not null check (length(trim(reason)) between 5 and 400),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.sponsored_violation_stops enable row level security;
revoke all on public.sponsored_violation_stops from public, anon, authenticated;
grant select, insert on public.sponsored_violation_stops to service_role;

create or replace function public.stop_sponsored_for_violation(p_push_id uuid, p_actor_id uuid, p_reason text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare stopped_id uuid;
begin
  if not exists (select 1 from public.app_users where id = p_actor_id and role = 'admin' and is_active) then
    raise exception 'Active admin required';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 400 then
    raise exception 'A violation reason of 5-400 characters is required';
  end if;
  update public.sponsored_pushes set status = 'paused'
    where id = p_push_id and status = 'approved' and ends_at > clock_timestamp()
    returning id into stopped_id;
  if stopped_id is null then return false; end if;
  insert into public.sponsored_violation_stops(push_id, actor_id, reason)
    values (stopped_id, p_actor_id, trim(p_reason));
  return true;
end;
$$;
revoke all on function public.stop_sponsored_for_violation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.stop_sponsored_for_violation(uuid, uuid, text) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261048_sponsored_retire_manual.sql


-- BEGIN supabase/migrations/20261049_review_lead_and_sourcing_hold.sql
-- Apply before deploying the application changes. Keep historical sourcing accounts
-- and verification decisions; deactivate the former rather than deleting them.

with locked as (
  update public.app_users set is_active = false
  where role = 'sourcing' and is_active = true
  returning id, email
)
insert into public.audit_log (actor_id, actor_email, entity, entity_id, action, before, after)
select null, null, 'user', id::text, 'user.sourcing_role_suspended',
       jsonb_build_object('role', 'sourcing', 'is_active', true),
       jsonb_build_object('role', 'sourcing', 'is_active', false, 'reason', 'role_temporarily_disabled')
from locked;

create or replace function public.guard_disabled_sourcing_role()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.role = 'sourcing' then
    if tg_op = 'INSERT' then
      raise exception 'Sourcing role is temporarily disabled';
    elsif old.role <> 'sourcing' or new.is_active then
      raise exception 'Sourcing role is temporarily disabled';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists app_users_sourcing_role_guard on public.app_users;
create trigger app_users_sourcing_role_guard before insert or update of role, is_active on public.app_users
for each row execute function public.guard_disabled_sourcing_role();
revoke all on function public.guard_disabled_sourcing_role() from public, anon, authenticated;

-- Add explicit confirmation without changing existing historical decisions.
alter table public.verifications
  add column if not exists evidence_confirmed_at timestamptz,
  add column if not exists evidence_confirmed_by uuid references public.app_users(id) on delete set null;

create or replace function public.check_verification_self_approval()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'approved' then
    raise exception 'A verification must be submitted before it can be approved';
  end if;
  if new.approved_by is not null
     and new.inspector_id = new.approved_by
     and not new.legacy_self_approved
     and not exists (select 1 from public.app_users u where u.id = new.approved_by
                     and u.role in ('admin', 'reviewer') and u.is_active) then
    raise exception 'Only active admin or review lead can complete their own verification';
  end if;
  return new;
end;
$$;

-- Confirmation and its audit entry commit with the approval: if audit insertion
-- fails the whole update rolls back, rather than silently losing the record.
create or replace function public.log_confirmed_verification_approval()
returns trigger language plpgsql security invoker set search_path = public as $$
declare approver_email text;
begin
  if old.status = 'approved' and new.status = 'approved' and
     (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
      or new.evidence_confirmed_by is distinct from old.evidence_confirmed_by
      or new.evidence_confirmed_at is distinct from old.evidence_confirmed_at) then
    raise exception 'Verification has already been approved';
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if old.status <> 'submitted' then
      raise exception 'Only submitted verifications can be approved';
    end if;
    if new.approved_by is null or new.evidence_confirmed_by is distinct from new.approved_by
       or new.evidence_confirmed_at is null then
      raise exception 'Evidence comparison confirmation is required before approval';
    end if;
    select email into approver_email from public.app_users
    where id = new.approved_by and is_active and role in ('admin', 'reviewer');
    if not found then raise exception 'Approval requires active admin or review lead'; end if;
    insert into public.audit_log (actor_id, actor_email, entity, entity_id, action, before, after)
    values (new.approved_by, approver_email, 'supplier', new.supplier_id::text,
      'verification.evidence_confirmation.l' || new.target_level::text,
      jsonb_build_object('id', old.id, 'status', old.status),
      jsonb_build_object('id', new.id, 'status', new.status,
        'confirmed_by', new.evidence_confirmed_by, 'confirmed_at', new.evidence_confirmed_at,
        'inspector_id', new.inspector_id, 'self_approved', new.self_approved));
  end if;
  return new;
end;
$$;
drop trigger if exists verification_confirmed_approval_log on public.verifications;
create trigger verification_confirmed_approval_log after update of status on public.verifications
for each row execute function public.log_confirmed_verification_approval();
revoke all on function public.log_confirmed_verification_approval() from public, anon, authenticated;


notify pgrst, 'reload schema';

-- END supabase/migrations/20261049_review_lead_and_sourcing_hold.sql


-- BEGIN supabase/migrations/20261050_l1_auto_publish_new_supplier.sql
-- Deploy in coordination with application code, after 20261049. Only profiles
-- created by the new self-registration code opt in. Historical records default
-- false: a previously hidden or archived profile must not be silently reopened.

alter table public.suppliers add column if not exists auto_publish_after_l1 boolean not null default false;

-- Turning off a public profile always retires auto-publication permanently.
-- A new auto-eligible profile cannot be manually published before L1 approval.
create or replace function public.guard_supplier_first_l1_publication()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if old.auto_publish_after_l1 and new.status = 'published' and old.status is distinct from 'published'
     and not exists (select 1 from public.verifications v where v.supplier_id = new.id and v.target_level = 1 and v.status = 'approved') then
    raise exception 'Approve L1 before publishing this new supplier';
  end if;
  if new.status in ('published', 'suspended', 'archived', 'verified', 'paused') then
    new.auto_publish_after_l1 := false;
  end if;
  return new;
end;
$$;
drop trigger if exists supplier_first_l1_publication_guard on public.suppliers;
create trigger supplier_first_l1_publication_guard before update of status on public.suppliers
for each row execute function public.guard_supplier_first_l1_publication();
revoke all on function public.guard_supplier_first_l1_publication() from public, anon, authenticated;

-- The supplier row and confirmation audit are updated in the same transaction
-- as approval. Concurrent suspension wins: never unhide a held supplier.
create or replace function public.publish_new_supplier_after_l1()
returns trigger language plpgsql security invoker set search_path = public as $$
declare s public.suppliers%rowtype; actor_email text;
begin
  if new.target_level <> 1 or new.status <> 'approved' or old.status = 'approved' then return new; end if;
  select * into s from public.suppliers where id = new.supplier_id for update;
  if not found then raise exception 'Supplier not found for L1 approval'; end if;
  if not s.auto_publish_after_l1 then return new; end if;
  if s.status not in ('draft', 'submitted', 'in_verification') then return new; end if;
  if s.onboarding_status <> 'approved' then
    raise exception 'L1_AUTO_PUBLICATION_PORTAL_NOT_APPROVED';
  end if;
  if not exists (select 1 from public.app_users u where u.supplier_id = s.id and u.role = 'supplier' and u.is_active)
     or coalesce(trim(s.name),'') = '' or coalesce(trim(s.products),'') = ''
     or coalesce(trim(s.phone),'') = '' or coalesce(trim(s.tax_id),'') = '' or s.supplier_type is null then
    raise exception 'L1_AUTO_PUBLICATION_PROFILE_INCOMPLETE';
  end if;
  -- A demo or test profile must not be published through this shortcut.
  if coalesce(s.is_demo, false) or coalesce(s.slug, '') ~* '(^|[-_])test([-_]|$)|do-not-contact'
     or (coalesce(s.name, '') || ' ' || coalesce(s.summary_i18n::text, '')) ~* 'test only|test supplier|do not contact' then
    raise exception 'L1_AUTO_PUBLICATION_TEST_PROFILE';
  end if;
  update public.suppliers set status = 'published', auto_publish_after_l1 = false where id = s.id;
  select email into actor_email from public.app_users where id = new.approved_by;
  insert into public.audit_log (actor_id, actor_email, entity, entity_id, action, before, after)
    values (new.approved_by, actor_email, 'supplier', s.id::text, 'supplier.auto_published_after_l1',
      jsonb_build_object('status', s.status), jsonb_build_object('status', 'published', 'verification_id', new.id));
  return new;
end;
$$;
drop trigger if exists supplier_auto_publish_after_l1 on public.verifications;
create trigger supplier_auto_publish_after_l1 after update of status on public.verifications
for each row execute function public.publish_new_supplier_after_l1();
revoke all on function public.publish_new_supplier_after_l1() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- END supabase/migrations/20261050_l1_auto_publish_new_supplier.sql


-- BEGIN supabase/migrations/20261051_product_grade_rows.sql
-- Multi-grade pricing table support (specs.grade_rows) + cashew W210 standard grade.

update public.categories
set
  product_fields = jsonb_build_array(
    jsonb_build_object(
      'key', 'grade',
      'label', 'Grade',
      'type', 'select',
      'options', jsonb_build_array('W180', 'W210', 'W240', 'W320', 'W450', 'SW', 'WS', 'LP', 'SP')
    )
  ),
  filters = jsonb_build_object(
    'grades', jsonb_build_array('W180', 'W210', 'W240', 'W320', 'W450', 'SW', 'WS', 'LP', 'SP')
  )
where slug in ('cashew-kernels', 'cashew');

create or replace view public.v_public_supplier_products as
select
  sp.id,
  sp.supplier_id,
  sp.slug,
  sp.name_i18n,
  coalesce(sp.name_i18n->>'en', sp.name)                as name,
  case
    when jsonb_typeof(sp.specs->'grade_rows') = 'array' then
      jsonb_set(
        sp.specs,
        '{grade_rows}',
        coalesce((
          select jsonb_agg(
            case
              when sp.price_publicly_visible and sp.ready_for_buyer
                   and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
                   and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
                   and s.fob_publicly_visible and s.fob_updated_at is not null
                   and s.fob_updated_at <= now()
                   and s.fob_updated_at > now() - interval '180 days'
                   and sp.ref_price > 0
                   and (sp.ref_price_max is null or sp.ref_price_max >= sp.ref_price)
                   and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
                then elem
              else elem || '{"price_min": null, "price_max": null}'::jsonb
            end
          )
          from jsonb_array_elements(sp.specs->'grade_rows') as elem
        ), '[]'::jsonb)
      )
    else sp.specs
  end                                                   as specs,
  regexp_replace(
    regexp_replace(sp.description,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact via Vexim]', 'gi'),
    '(\+?[0-9][ ().-]?){9,15}[0-9]', '[contact via Vexim]', 'g') as description,
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
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.ref_price_max is null or sp.ref_price_max >= sp.ref_price)
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.ref_price end as ref_price,
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and (sp.ref_price_max is null or sp.ref_price_max >= sp.ref_price)
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.currency end as currency,
  sp.updated_at,
  case when sp.ready_for_buyer
    and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
    and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
    then regexp_replace(
    regexp_replace(sp.description_detail,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact via Vexim]', 'gi'),
    '(\+?[0-9][ ().-]?){9,15}[0-9]', '[contact via Vexim]', 'g') end as description_detail,
  sp.oem,
  sp.odm,
  case when sp.price_publicly_visible and sp.ready_for_buyer
            and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
            and (not sp.supplier_originated or sp.reviewed_category_slug is not null)
            and s.fob_publicly_visible and s.fob_updated_at is not null
            and s.fob_updated_at <= now()
            and s.fob_updated_at > now() - interval '180 days'
            and sp.ref_price > 0
            and sp.ref_price_max >= sp.ref_price
            and (sp.price_valid_until is null or sp.price_valid_until >= current_date)
       then sp.ref_price_max end as ref_price_max
from public.supplier_products sp
join public.suppliers s on s.id = sp.supplier_id
where s.status = 'published'
  and not coalesce(s.is_demo, false)
  and sp.ready_for_buyer
  and (sp.supplier_review_status is null or sp.supplier_review_status = 'approved')
  and (not sp.supplier_originated or exists (
    select 1 from public.categories c where c.slug = sp.reviewed_category_slug
      and c.status = 'published' and c.is_published
  ));

notify pgrst, 'reload schema';

-- END supabase/migrations/20261051_product_grade_rows.sql


-- BEGIN supabase/migrations/20261052_structured_units_and_moq.sql
-- Structured units & MOQ standardization:
-- 1. Per-category allowed MOQ units list (categories.moq_units).
-- 2. Automatic backfill of unambiguous legacy MOQs ("1 tấn" -> 1 MT, "100kg" -> 100 kg,
--    "1 cont 20ft..." -> 1 × 20ft container, "1 x 40ft..." -> 1 × 40ft container).
-- 3. Admin inspection view public.v_products_unit_manual_review for ambiguous rows
--    (e.g. "280 Túi" / "500 thùng" missing bag/carton weight, or legacy non-weight price units).


alter table public.categories
  add column if not exists moq_units jsonb;

-- Backfill unambiguous top-level MOQs on supplier_products:
-- (a) Containers 20ft / 40ft
with parsed_containers as (
  select
    sp.id,
    ((regexp_match(btrim(sp.moq), '^(\d+)\s*(?:×|x|\*)?\s*(?:cont(?:ainer)?s?\s*)?(20|40)\s*(?:ft|''|hc|hq|rf)?(?:\s*(?:fcl|containers?|cont))?(?:\s*\([^)]*\))?$', 'i'))[1])::numeric as qty,
    ((regexp_match(btrim(sp.moq), '^(\d+)\s*(?:×|x|\*)?\s*(?:cont(?:ainer)?s?\s*)?(20|40)\s*(?:ft|''|hc|hq|rf)?(?:\s*(?:fcl|containers?|cont))?(?:\s*\([^)]*\))?$', 'i'))[2]) as cont_size
  from public.supplier_products sp
  where (sp.moq_unit is null or sp.moq_qty is null)
    and sp.moq is not null
    and btrim(sp.moq) ~* '^(\d+)\s*(?:×|x|\*)?\s*(?:cont(?:ainer)?s?\s*)?(20|40)\s*(?:ft|''|hc|hq|rf)?(?:\s*(?:fcl|containers?|cont))?(?:\s*\([^)]*\))?$'
)
update public.supplier_products sp
set
  moq_qty = pc.qty,
  moq_unit = case when pc.cont_size = '40' then 'cont_40ft' else 'cont_20ft' end,
  moq = trim(trailing '.' from trim(trailing '0' from pc.qty::text)) || ' × ' || pc.cont_size || 'ft ' ||
        case when pc.qty = 1 then 'container' else 'containers' end
from parsed_containers pc
where sp.id = pc.id
  and pc.qty > 0
  and pc.qty <= 500;

-- (b) Metric tons ("1 tấn", "5 tan", "20 MT", "1 metric ton", "2.5 tonnes", "1,5 tấn")
with parsed_mt as (
  select
    sp.id,
    replace(
      (regexp_match(btrim(sp.moq), '^(\d+(?:[.,]\d{1,3})?)\s*(mt|tấn|tan|metric\s+tons?|tonnes?|tons?)$', 'i'))[1],
      ',',
      '.'
    )::numeric as qty
  from public.supplier_products sp
  where (sp.moq_unit is null or sp.moq_qty is null)
    and sp.moq is not null
    and btrim(sp.moq) ~* '^(\d+(?:[.,]\d{1,3})?)\s*(mt|tấn|tan|metric\s+tons?|tonnes?|tons?)$'
)
update public.supplier_products sp
set
  moq_qty = pm.qty,
  moq_unit = 'mt',
  moq = trim(trailing '.' from trim(trailing '0' from pm.qty::text)) || ' MT'
from parsed_mt pm
where sp.id = pm.id
  and pm.qty > 0
  and pm.qty <= 1000000;

-- (c) Kilograms ("27kg", "100kg", "500 kg", "25 kgs")
with parsed_kg as (
  select
    sp.id,
    replace(
      (regexp_match(btrim(sp.moq), '^(\d+(?:[.,]\d{1,3})?)\s*(kgs?|kilograms?)$', 'i'))[1],
      ',',
      '.'
    )::numeric as qty
  from public.supplier_products sp
  where (sp.moq_unit is null or sp.moq_qty is null)
    and sp.moq is not null
    and btrim(sp.moq) ~* '^(\d+(?:[.,]\d{1,3})?)\s*(kgs?|kilograms?)$'
)
update public.supplier_products sp
set
  moq_qty = pk.qty,
  moq_unit = 'kg',
  moq = trim(trailing '.' from trim(trailing '0' from pk.qty::text)) || ' kg'
from parsed_kg pk
where sp.id = pk.id
  and pk.qty > 0
  and pk.qty <= 1000000;

-- Admin helper view: lists products whose MOQ or price unit still requires manual input
-- (for example "280 Túi" / "500 thùng" missing bag/carton weight, or legacy unit "Bag" / "thùng").
create or replace view public.v_products_unit_manual_review as
select
  sp.id as product_id,
  s.name as supplier_name,
  sp.name as product_name,
  coalesce(sp.reviewed_category_slug, sp.supplier_category_proposal, sp.category) as category_slug,
  sp.moq as raw_moq,
  sp.moq_qty,
  sp.moq_unit,
  sp.ref_price,
  sp.ref_price_max,
  sp.unit as raw_price_unit,
  sp.currency,
  sp.ready_for_buyer,
  sp.supplier_review_status,
  case
    when sp.moq is not null
         and btrim(sp.moq) <> ''
         and lower(btrim(sp.moq)) not in ('on request', 'theo yêu cầu', 'theo yeu cau', 'thỏa thuận', 'thoa thuan', '-')
         and (sp.moq_qty is null or sp.moq_unit is null)
      then case
        when btrim(sp.moq) ~* '^\d+\s*(bao|túi|tui|bags?|pouches?|sacks?)$'
          then 'Thiếu trọng lượng mỗi bao (kg)'
        when btrim(sp.moq) ~* '^\d+\s*(thùng|thung|cartons?|boxes?|hộp|hop)$'
          then 'Thiếu trọng lượng mỗi thùng (kg)'
        else 'MOQ tự do chưa nằm trong đơn vị chuẩn'
      end
    when sp.ref_price is not null
         and sp.ref_price > 0
         and lower(coalesce(btrim(sp.unit), '')) not in ('kg', 'kgs', 'kilogram', 'kilograms', 'lb', 'lbs', 'pound', 'pounds', 'mt', 't', 'ton', 'tons', 'tonne', 'tonnes', 'tấn', 'tan')
      then 'Đơn vị giá cũ không tự quy đổi sang USD/kg hoặc USD/MT'
    else null
  end as review_reason
from public.supplier_products sp
left join public.suppliers s on s.id = sp.supplier_id
where
  (
    sp.moq is not null
    and btrim(sp.moq) <> ''
    and lower(btrim(sp.moq)) not in ('on request', 'theo yêu cầu', 'theo yeu cau', 'thỏa thuận', 'thoa thuan', '-')
    and (sp.moq_qty is null or sp.moq_unit is null)
  )
  or (
    sp.ref_price is not null
    and sp.ref_price > 0
    and jsonb_typeof(sp.specs->'grade_rows') is distinct from 'array'
    and lower(coalesce(btrim(sp.unit), '')) not in ('kg', 'kgs', 'kilogram', 'kilograms', 'lb', 'lbs', 'pound', 'pounds', 'mt', 't', 'ton', 'tons', 'tonne', 'tonnes', 'tấn', 'tan')
  );

notify pgrst, 'reload schema';

-- END supabase/migrations/20261052_structured_units_and_moq.sql


-- BEGIN supabase/migrations/20261053_quantity_price_foundation.sql
-- Additive foundation only: existing products and public views keep their current
-- behavior until the new editor, approval actions and public projection are wired.
-- Do not infer prices or confirmation dates from ambiguous legacy records.

create table if not exists public.quantity_price_settings (
  singleton boolean primary key default true check (singleton),
  max_tiers integer not null default 4 check (max_tiers between 1 and 100),
  max_price_ratio numeric(10,4) not null default 1.5 check (max_price_ratio >= 1),
  max_last_moq_ratio numeric(12,4) not null default 100 check (max_last_moq_ratio >= 1),
  reminder_days integer not null default 30 check (reminder_days > 0),
  stale_days integer not null default 90 check (stale_days > 0),
  offer_max_discount_percent numeric(5,2) not null default 30 check (offer_max_discount_percent > 0 and offer_max_discount_percent <= 100),
  offer_max_days integer not null default 60 check (offer_max_days > 0),
  offer_cooldown_days integer not null default 30 check (offer_cooldown_days >= 0),
  offer_price_lock_days integer not null default 30 check (offer_price_lock_days >= 0),
  updated_at timestamptz not null default now()
);
insert into public.quantity_price_settings (singleton) values (true) on conflict (singleton) do nothing;

create table if not exists public.category_grade_price_bounds (
  category_id uuid not null references public.categories(id) on delete cascade,
  grade text not null check (length(btrim(grade)) > 0),
  min_usd_per_kg numeric(14,4) not null check (min_usd_per_kg > 0),
  max_usd_per_kg numeric(14,4) not null,
  updated_at timestamptz not null default now(),
  primary key (category_id, grade),
  check (max_usd_per_kg >= min_usd_per_kg)
);

-- Exactly one approved and one pending revision per product can coexist. The
-- old approved revision remains readable until a transactional approval swaps it.
create table if not exists public.product_quantity_price_revisions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  status text not null check (status in ('draft', 'pending', 'approved', 'rejected', 'superseded')),
  grade text not null check (length(btrim(grade)) > 0),
  incoterm text not null check (incoterm in ('FOB', 'CIF', 'CFR', 'EXW', 'FCA', 'DAP', 'DDP')),
  tiers jsonb not null check (jsonb_typeof(tiers) = 'array' and jsonb_array_length(tiers) > 0),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  check (status <> 'approved' or confirmed_at is not null)
);
create unique index if not exists product_quantity_price_revision_active_key
  on public.product_quantity_price_revisions (product_id, status)
  where status in ('draft', 'pending', 'approved');
create index if not exists product_quantity_price_revision_review_queue_idx
  on public.product_quantity_price_revisions (created_at) where status = 'pending';

-- English title approvals are independent of price approval. Do not expose the
-- pending name through legacy name_i18n or a public SQL view during transition.
create table if not exists public.product_english_name_revisions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  status text not null check (status in ('draft', 'pending', 'approved', 'rejected', 'superseded')),
  source_name text not null check (length(btrim(source_name)) > 0),
  english_name text not null check (length(btrim(english_name)) > 0),
  origin text not null check (origin in ('supplier', 'ai', 'staff')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
create unique index if not exists product_english_name_revision_active_key
  on public.product_english_name_revisions (product_id, status)
  where status in ('draft', 'pending', 'approved');
create index if not exists product_english_name_revision_review_queue_idx
  on public.product_english_name_revisions (created_at) where status = 'pending';

-- All access is through authorized server actions using service_role. No public
-- view of these tables exists, in particular pending prices and names stay private.
alter table public.quantity_price_settings enable row level security;
alter table public.category_grade_price_bounds enable row level security;
alter table public.product_quantity_price_revisions enable row level security;
alter table public.product_english_name_revisions enable row level security;
revoke all on public.quantity_price_settings, public.category_grade_price_bounds,
  public.product_quantity_price_revisions, public.product_english_name_revisions from public, anon, authenticated;
grant all on public.quantity_price_settings, public.category_grade_price_bounds,
  public.product_quantity_price_revisions, public.product_english_name_revisions to service_role;

notify pgrst, 'reload schema';

-- END supabase/migrations/20261053_quantity_price_foundation.sql


-- BEGIN supabase/migrations/20261054_quantity_price_review_transactions.sql
-- Atomic independent review decisions for the new pricing/name model. Existing
-- public data is not changed here; application cutover happens separately.

create or replace function public.decide_quantity_price_revision(
  p_product_id uuid, p_revision_id uuid, p_actor_id uuid, p_approve boolean
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate public.product_quantity_price_revisions%rowtype;
begin
  if p_actor_id is null or p_approve is null then return 'invalid'; end if;
  -- All writers of this workflow must lock the product first, in this order.
  perform 1 from public.supplier_products where id = p_product_id for update;
  if not found then return 'missing_product'; end if;
  select * into candidate from public.product_quantity_price_revisions
    where id = p_revision_id and product_id = p_product_id for update;
  if not found or candidate.status <> 'pending' then return 'changed'; end if;
  if p_approve then
    update public.product_quantity_price_revisions set status = 'superseded'
      where product_id = p_product_id and status = 'approved';
    -- The supplier confirmed the proposed price when it was submitted, not at
    -- the later time staff approved it. Never refresh its age during review.
    update public.product_quantity_price_revisions
      set status = 'approved', reviewed_at = now(), reviewed_by = p_actor_id,
          confirmed_at = coalesce(candidate.confirmed_at, candidate.created_at)
      where id = p_revision_id;
  else
    update public.product_quantity_price_revisions
      set status = 'rejected', reviewed_at = now(), reviewed_by = p_actor_id
      where id = p_revision_id;
  end if;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

create or replace function public.decide_product_english_name_revision(
  p_product_id uuid, p_revision_id uuid, p_actor_id uuid, p_approve boolean
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate public.product_english_name_revisions%rowtype;
begin
  if p_actor_id is null or p_approve is null then return 'invalid'; end if;
  perform 1 from public.supplier_products where id = p_product_id for update;
  if not found then return 'missing_product'; end if;
  select * into candidate from public.product_english_name_revisions
    where id = p_revision_id and product_id = p_product_id for update;
  if not found or candidate.status <> 'pending' then return 'changed'; end if;
  if p_approve then
    update public.product_english_name_revisions set status = 'superseded'
      where product_id = p_product_id and status = 'approved';
    update public.product_english_name_revisions
      set status = 'approved', reviewed_at = now(), reviewed_by = p_actor_id
      where id = p_revision_id;
  else
    update public.product_english_name_revisions
      set status = 'rejected', reviewed_at = now(), reviewed_by = p_actor_id
      where id = p_revision_id;
  end if;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

revoke all on function public.decide_quantity_price_revision(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.decide_product_english_name_revision(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.decide_quantity_price_revision(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.decide_product_english_name_revision(uuid, uuid, uuid, boolean) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261054_quantity_price_review_transactions.sql


-- BEGIN supabase/migrations/20261055_quantity_price_revision_submit.sql
-- Staged supplier revisions: old approved snapshots remain unchanged. All callers
-- must validate policy/grade/name, consent and account authorization before RPC.
-- Service-role only; never grant directly to browser clients.

create or replace function public.submit_quantity_price_revision(
  p_product_id uuid, p_supplier_id uuid, p_expected_pending_id uuid, p_expected_product_updated_at timestamptz,
  p_grade text, p_incoterm text, p_tiers jsonb, p_warnings jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing uuid;
  created uuid;
  product_updated_at timestamptz;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_product_updated_at is null or p_grade is null or btrim(p_grade) = '' or
     p_incoterm is null or p_tiers is null or p_warnings is null or
     jsonb_typeof(p_tiers) <> 'array' or jsonb_typeof(p_warnings) <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select updated_at into product_updated_at from public.supplier_products
    where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  if product_updated_at is distinct from p_expected_product_updated_at then return jsonb_build_object('status', 'product_changed'); end if;
  select id into existing from public.product_quantity_price_revisions
    where product_id = p_product_id and status = 'pending' for update;
  if existing is distinct from p_expected_pending_id then
    return jsonb_build_object('status', 'changed');
  end if;
  if existing is not null then
    update public.product_quantity_price_revisions set status = 'superseded' where id = existing;
  end if;
  insert into public.product_quantity_price_revisions
    (product_id, status, grade, incoterm, tiers, warnings, confirmed_at)
    values (p_product_id, 'pending', p_grade, p_incoterm, p_tiers, p_warnings, now())
    returning id into created;
  return jsonb_build_object('status', 'pending', 'revision_id', created);
end;
$$;

create or replace function public.submit_product_english_name_revision(
  p_product_id uuid, p_supplier_id uuid, p_expected_pending_id uuid, p_expected_product_updated_at timestamptz,
  p_source_name text, p_english_name text, p_origin text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing uuid;
  created uuid;
  product_updated_at timestamptz;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_product_updated_at is null or p_source_name is null or btrim(p_source_name) = '' or
     p_english_name is null or btrim(p_english_name) = '' or p_origin is null or p_origin not in ('supplier', 'ai') then
    return jsonb_build_object('status', 'invalid');
  end if;
  select updated_at into product_updated_at from public.supplier_products
    where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  if product_updated_at is distinct from p_expected_product_updated_at then return jsonb_build_object('status', 'product_changed'); end if;
  select id into existing from public.product_english_name_revisions
    where product_id = p_product_id and status = 'pending' for update;
  if existing is distinct from p_expected_pending_id then
    return jsonb_build_object('status', 'changed');
  end if;
  if existing is not null then
    update public.product_english_name_revisions set status = 'superseded' where id = existing;
  end if;
  insert into public.product_english_name_revisions
    (product_id, status, source_name, english_name, origin)
    values (p_product_id, 'pending', p_source_name, p_english_name, p_origin)
    returning id into created;
  return jsonb_build_object('status', 'pending', 'revision_id', created);
end;
$$;

revoke all on function public.submit_quantity_price_revision(uuid, uuid, uuid, timestamptz, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.submit_product_english_name_revision(uuid, uuid, uuid, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_quantity_price_revision(uuid, uuid, uuid, timestamptz, text, text, jsonb, jsonb) to service_role;
grant execute on function public.submit_product_english_name_revision(uuid, uuid, uuid, timestamptz, text, text, text) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261055_quantity_price_revision_submit.sql


-- BEGIN supabase/migrations/20261056_quantity_price_review_consistency.sql
-- Guard approval against product changes after submission or between the CRM read
-- and decision. Existing pending rows without a captured product version must be
-- rejected/resubmitted; never guess which version was actually reviewed.

alter table public.product_quantity_price_revisions add column if not exists product_updated_at timestamptz;
alter table public.product_english_name_revisions add column if not exists product_updated_at timestamptz;

create or replace function public.submit_quantity_price_revision(
  p_product_id uuid, p_supplier_id uuid, p_expected_pending_id uuid, p_expected_product_updated_at timestamptz,
  p_grade text, p_incoterm text, p_tiers jsonb, p_warnings jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing uuid;
  created uuid;
  product_updated_at timestamptz;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_product_updated_at is null or p_grade is null or btrim(p_grade) = '' or
     p_incoterm is null or p_tiers is null or p_warnings is null or
     jsonb_typeof(p_tiers) <> 'array' or jsonb_typeof(p_warnings) <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select updated_at into product_updated_at from public.supplier_products
    where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  if product_updated_at is distinct from p_expected_product_updated_at then return jsonb_build_object('status', 'product_changed'); end if;
  select id into existing from public.product_quantity_price_revisions
    where product_id = p_product_id and status = 'pending' for update;
  if existing is distinct from p_expected_pending_id then
    return jsonb_build_object('status', 'changed');
  end if;
  if existing is not null then
    update public.product_quantity_price_revisions set status = 'superseded' where id = existing;
  end if;
  insert into public.product_quantity_price_revisions
    (product_id, status, grade, incoterm, tiers, warnings, confirmed_at, product_updated_at)
    values (p_product_id, 'pending', p_grade, p_incoterm, p_tiers, p_warnings, now(), product_updated_at)
    returning id into created;
  return jsonb_build_object('status', 'pending', 'revision_id', created);
end;
$$;

create or replace function public.submit_product_english_name_revision(
  p_product_id uuid, p_supplier_id uuid, p_expected_pending_id uuid, p_expected_product_updated_at timestamptz,
  p_source_name text, p_english_name text, p_origin text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing uuid;
  created uuid;
  product_updated_at timestamptz;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_product_updated_at is null or p_source_name is null or btrim(p_source_name) = '' or
     p_english_name is null or btrim(p_english_name) = '' or p_origin is null or p_origin not in ('supplier', 'ai') then
    return jsonb_build_object('status', 'invalid');
  end if;
  select updated_at into product_updated_at from public.supplier_products
    where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  if product_updated_at is distinct from p_expected_product_updated_at then return jsonb_build_object('status', 'product_changed'); end if;
  select id into existing from public.product_english_name_revisions
    where product_id = p_product_id and status = 'pending' for update;
  if existing is distinct from p_expected_pending_id then
    return jsonb_build_object('status', 'changed');
  end if;
  if existing is not null then
    update public.product_english_name_revisions set status = 'superseded' where id = existing;
  end if;
  insert into public.product_english_name_revisions
    (product_id, status, source_name, english_name, origin, product_updated_at)
    values (p_product_id, 'pending', p_source_name, p_english_name, p_origin, product_updated_at)
    returning id into created;
  return jsonb_build_object('status', 'pending', 'revision_id', created);
end;
$$;

-- Remove older unguarded service-role entrypoints.
drop function if exists public.decide_quantity_price_revision(uuid, uuid, uuid, boolean);
drop function if exists public.decide_product_english_name_revision(uuid, uuid, uuid, boolean);

create or replace function public.decide_quantity_price_revision(
  p_product_id uuid, p_revision_id uuid, p_actor_id uuid, p_approve boolean, p_expected_product_updated_at timestamptz
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate public.product_quantity_price_revisions%rowtype;
  product_updated_at timestamptz;
begin
  if p_actor_id is null or p_approve is null or p_expected_product_updated_at is null then return 'invalid'; end if;
  -- All writers of this workflow must lock the product first, in this order.
  select updated_at into product_updated_at from public.supplier_products where id = p_product_id for update;
  if not found then return 'missing_product'; end if;
  select * into candidate from public.product_quantity_price_revisions
    where id = p_revision_id and product_id = p_product_id for update;
  if not found or candidate.status <> 'pending' then return 'changed'; end if;
  if p_approve and (product_updated_at is distinct from p_expected_product_updated_at or candidate.product_updated_at is distinct from product_updated_at) then return 'product_changed'; end if;
  if p_approve then
    update public.product_quantity_price_revisions set status = 'superseded'
      where product_id = p_product_id and status = 'approved';
    -- The supplier confirmed the proposed price when it was submitted, not at
    -- the later time staff approved it. Never refresh its age during review.
    update public.product_quantity_price_revisions
      set status = 'approved', reviewed_at = now(), reviewed_by = p_actor_id,
          confirmed_at = coalesce(candidate.confirmed_at, candidate.created_at)
      where id = p_revision_id;
  else
    update public.product_quantity_price_revisions
      set status = 'rejected', reviewed_at = now(), reviewed_by = p_actor_id
      where id = p_revision_id;
  end if;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

create or replace function public.decide_product_english_name_revision(
  p_product_id uuid, p_revision_id uuid, p_actor_id uuid, p_approve boolean, p_expected_product_updated_at timestamptz
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate public.product_english_name_revisions%rowtype;
  product_updated_at timestamptz;
  product_name text;
begin
  if p_actor_id is null or p_approve is null or p_expected_product_updated_at is null then return 'invalid'; end if;
  select updated_at, name into product_updated_at, product_name from public.supplier_products where id = p_product_id for update;
  if not found then return 'missing_product'; end if;
  select * into candidate from public.product_english_name_revisions
    where id = p_revision_id and product_id = p_product_id for update;
  if not found or candidate.status <> 'pending' then return 'changed'; end if;
  if p_approve and (product_updated_at is distinct from p_expected_product_updated_at or candidate.product_updated_at is distinct from product_updated_at or candidate.source_name is distinct from product_name) then return 'product_changed'; end if;
  if p_approve then
    update public.product_english_name_revisions set status = 'superseded'
      where product_id = p_product_id and status = 'approved';
    update public.product_english_name_revisions
      set status = 'approved', reviewed_at = now(), reviewed_by = p_actor_id
      where id = p_revision_id;
  else
    update public.product_english_name_revisions
      set status = 'rejected', reviewed_at = now(), reviewed_by = p_actor_id
      where id = p_revision_id;
  end if;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

revoke all on function public.decide_quantity_price_revision(uuid, uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.decide_product_english_name_revision(uuid, uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.decide_quantity_price_revision(uuid, uuid, uuid, boolean, timestamptz) to service_role;
grant execute on function public.decide_product_english_name_revision(uuid, uuid, uuid, boolean, timestamptz) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261056_quantity_price_review_consistency.sql


-- BEGIN supabase/migrations/20261057_quantity_review_product_context.sql
-- Keep material product changes guarded, but do not invalidate a submitted price
-- merely because product review status or generated translations were updated.
-- Old pending records without a context keep the stricter 20261056 rule.

alter table public.product_quantity_price_revisions add column if not exists product_context jsonb;
alter table public.product_english_name_revisions add column if not exists product_context jsonb;

create or replace function public.quantity_product_review_context(p jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select (p - array['updated_at', 'supplier_review_status', 'supplier_review_note', 'ready_for_buyer',
    'category', 'supplier_category_proposal', 'reviewed_category_slug', 'images', 'featured_media_id',
    'name_i18n', 'description_i18n', 'spec_i18n', 'description_detail_i18n',
    'packaging_i18n', 'certifications_i18n', 'translation_meta', 'specs']) ||
    jsonb_build_object('review_category', coalesce(p->>'reviewed_category_slug', p->>'supplier_category_proposal', p->>'category'),
      'specs', coalesce(p->'specs', '{}'::jsonb) - 'price_review_summary');
$$;
revoke all on function public.quantity_product_review_context(jsonb) from public, anon, authenticated;
grant execute on function public.quantity_product_review_context(jsonb) to service_role;

create or replace function public.submit_quantity_price_revision(
  p_product_id uuid, p_supplier_id uuid, p_expected_pending_id uuid, p_expected_product_updated_at timestamptz,
  p_grade text, p_incoterm text, p_tiers jsonb, p_warnings jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing uuid;
  created uuid;
  product_updated_at timestamptz;
  product_snapshot jsonb;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_product_updated_at is null or p_grade is null or btrim(p_grade) = '' or
     p_incoterm is null or p_tiers is null or p_warnings is null or
     jsonb_typeof(p_tiers) <> 'array' or jsonb_typeof(p_warnings) <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select updated_at, public.quantity_product_review_context(to_jsonb(p)) into product_updated_at, product_snapshot
    from public.supplier_products p where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  if product_updated_at is distinct from p_expected_product_updated_at then return jsonb_build_object('status', 'product_changed'); end if;
  select id into existing from public.product_quantity_price_revisions
    where product_id = p_product_id and status = 'pending' for update;
  if existing is distinct from p_expected_pending_id then
    return jsonb_build_object('status', 'changed');
  end if;
  if existing is not null then
    update public.product_quantity_price_revisions set status = 'superseded' where id = existing;
  end if;
  insert into public.product_quantity_price_revisions
    (product_id, status, grade, incoterm, tiers, warnings, confirmed_at, product_updated_at, product_context)
    values (p_product_id, 'pending', p_grade, p_incoterm, p_tiers, p_warnings, now(), product_updated_at, product_snapshot)
    returning id into created;
  return jsonb_build_object('status', 'pending', 'revision_id', created);
end;
$$;

create or replace function public.submit_product_english_name_revision(
  p_product_id uuid, p_supplier_id uuid, p_expected_pending_id uuid, p_expected_product_updated_at timestamptz,
  p_source_name text, p_english_name text, p_origin text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing uuid;
  created uuid;
  product_updated_at timestamptz;
  product_snapshot jsonb;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_product_updated_at is null or p_source_name is null or btrim(p_source_name) = '' or
     p_english_name is null or btrim(p_english_name) = '' or p_origin is null or p_origin not in ('supplier', 'ai') then
    return jsonb_build_object('status', 'invalid');
  end if;
  select updated_at, public.quantity_product_review_context(to_jsonb(p)) into product_updated_at, product_snapshot
    from public.supplier_products p where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  if product_updated_at is distinct from p_expected_product_updated_at then return jsonb_build_object('status', 'product_changed'); end if;
  select id into existing from public.product_english_name_revisions
    where product_id = p_product_id and status = 'pending' for update;
  if existing is distinct from p_expected_pending_id then
    return jsonb_build_object('status', 'changed');
  end if;
  if existing is not null then
    update public.product_english_name_revisions set status = 'superseded' where id = existing;
  end if;
  insert into public.product_english_name_revisions
    (product_id, status, source_name, english_name, origin, product_updated_at, product_context)
    values (p_product_id, 'pending', p_source_name, p_english_name, p_origin, product_updated_at, product_snapshot)
    returning id into created;
  return jsonb_build_object('status', 'pending', 'revision_id', created);
end;
$$;

-- Remove older unguarded service-role entrypoints.
drop function if exists public.decide_quantity_price_revision(uuid, uuid, uuid, boolean);
drop function if exists public.decide_product_english_name_revision(uuid, uuid, uuid, boolean);

create or replace function public.decide_quantity_price_revision(
  p_product_id uuid, p_revision_id uuid, p_actor_id uuid, p_approve boolean, p_expected_product_updated_at timestamptz
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate public.product_quantity_price_revisions%rowtype;
  product_updated_at timestamptz;
  product_snapshot jsonb;
begin
  if p_actor_id is null or p_approve is null or p_expected_product_updated_at is null then return 'invalid'; end if;
  -- All writers of this workflow must lock the product first, in this order.
  select updated_at, public.quantity_product_review_context(to_jsonb(p)) into product_updated_at, product_snapshot from public.supplier_products p where id = p_product_id for update;
  if not found then return 'missing_product'; end if;
  select * into candidate from public.product_quantity_price_revisions
    where id = p_revision_id and product_id = p_product_id for update;
  if not found or candidate.status <> 'pending' then return 'changed'; end if;
  if p_approve and (product_updated_at is distinct from p_expected_product_updated_at or (case when candidate.product_context is null then candidate.product_updated_at is distinct from product_updated_at else candidate.product_context is distinct from product_snapshot end)) then return 'product_changed'; end if;
  if p_approve then
    update public.product_quantity_price_revisions set status = 'superseded'
      where product_id = p_product_id and status = 'approved';
    -- The supplier confirmed the proposed price when it was submitted, not at
    -- the later time staff approved it. Never refresh its age during review.
    update public.product_quantity_price_revisions
      set status = 'approved', reviewed_at = now(), reviewed_by = p_actor_id,
          confirmed_at = coalesce(candidate.confirmed_at, candidate.created_at)
      where id = p_revision_id;
  else
    update public.product_quantity_price_revisions
      set status = 'rejected', reviewed_at = now(), reviewed_by = p_actor_id
      where id = p_revision_id;
  end if;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

create or replace function public.decide_product_english_name_revision(
  p_product_id uuid, p_revision_id uuid, p_actor_id uuid, p_approve boolean, p_expected_product_updated_at timestamptz
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate public.product_english_name_revisions%rowtype;
  product_updated_at timestamptz;
  product_name text;
  product_snapshot jsonb;
begin
  if p_actor_id is null or p_approve is null or p_expected_product_updated_at is null then return 'invalid'; end if;
  select updated_at, name, public.quantity_product_review_context(to_jsonb(p)) into product_updated_at, product_name, product_snapshot from public.supplier_products p where id = p_product_id for update;
  if not found then return 'missing_product'; end if;
  select * into candidate from public.product_english_name_revisions
    where id = p_revision_id and product_id = p_product_id for update;
  if not found or candidate.status <> 'pending' then return 'changed'; end if;
  if p_approve and (product_updated_at is distinct from p_expected_product_updated_at or (case when candidate.product_context is null then candidate.product_updated_at is distinct from product_updated_at else candidate.product_context is distinct from product_snapshot end) or candidate.source_name is distinct from product_name) then return 'product_changed'; end if;
  if p_approve then
    update public.product_english_name_revisions set status = 'superseded'
      where product_id = p_product_id and status = 'approved';
    update public.product_english_name_revisions
      set status = 'approved', reviewed_at = now(), reviewed_by = p_actor_id
      where id = p_revision_id;
  else
    update public.product_english_name_revisions
      set status = 'rejected', reviewed_at = now(), reviewed_by = p_actor_id
      where id = p_revision_id;
  end if;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

revoke all on function public.decide_quantity_price_revision(uuid, uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.decide_product_english_name_revision(uuid, uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.decide_quantity_price_revision(uuid, uuid, uuid, boolean, timestamptz) to service_role;
grant execute on function public.decide_product_english_name_revision(uuid, uuid, uuid, boolean, timestamptz) to service_role;


notify pgrst, 'reload schema';

-- END supabase/migrations/20261057_quantity_review_product_context.sql


-- BEGIN supabase/migrations/20261058_quantity_new_product_transaction.sql
-- Atomic creation: never save a new product without the quantity table entered
-- in the same form. The caller is the authorized, validating server action.

create table if not exists public.quantity_product_creation_requests (
  request_id uuid primary key,
  supplier_id uuid not null,
  product_id uuid references public.supplier_products(id) on delete set null,
  payload_hash text not null
);
alter table public.quantity_product_creation_requests enable row level security;
revoke all on public.quantity_product_creation_requests from public, anon, authenticated;
grant all on public.quantity_product_creation_requests to service_role;

create or replace function public.create_supplier_product_with_quantity(
  p_request_id uuid, p_supplier_id uuid, p_product jsonb, p_grade text, p_incoterm text,
  p_tiers jsonb, p_warnings jsonb, p_english_name text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  allowed text[] := array['supplier_id','name','slug','name_i18n','category','description','description_detail','spec','specs',
    'unit','moq','moq_qty','moq_unit','monthly_capacity','raw_material_region','input_material_origin','lead_time_days',
    'packaging','oem','odm','samples','certifications','export_port','ref_price','ref_price_max','price_publicly_visible',
    'currency','price_valid_until','incoterm','incoterm_place','payment_terms','ready_for_buyer','supplier_review_status',
    'supplier_review_note','supplier_originated','supplier_category_proposal','reviewed_category_slug','images'];
  columns_sql text;
  values_sql text;
  saved public.supplier_products%rowtype;
  snapshot jsonb;
  request_row public.quantity_product_creation_requests%rowtype;
  digest text;
begin
  if p_request_id is null or p_supplier_id is null or jsonb_typeof(p_product) is distinct from 'object' or
     p_product->>'supplier_id' is distinct from p_supplier_id::text or
     p_product->>'supplier_review_status' is distinct from 'draft' or
     p_product->>'ready_for_buyer' is distinct from 'false' or
     p_product->>'supplier_originated' is distinct from 'true' or
     coalesce(p_product->>'name','') = '' or coalesce(p_grade,'') = '' or
     p_incoterm not in ('FOB','CIF','CFR','EXW','FCA','DAP','DDP') or
     jsonb_typeof(p_tiers) is distinct from 'array' or jsonb_array_length(p_tiers) = 0 or
     jsonb_typeof(p_warnings) is distinct from 'array' or
     exists (select 1 from jsonb_object_keys(p_product) as x(k) where not (k = any(allowed))) then
    raise exception 'Invalid new product payload';
  end if;
  digest := md5(jsonb_build_array(p_supplier_id,p_product,p_grade,p_incoterm,p_tiers,p_warnings,p_english_name)::text);
  -- Serialize retries for one request without serializing unrelated creations.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into request_row from public.quantity_product_creation_requests where request_id = p_request_id;
  if found then
    if request_row.supplier_id is distinct from p_supplier_id or request_row.payload_hash is distinct from digest then
      raise exception 'Creation request already used with different data';
    end if;
    select * into saved from public.supplier_products where id = request_row.product_id and supplier_id = p_supplier_id;
    if not found then raise exception 'Created product no longer exists'; end if;
    return to_jsonb(saved);
  end if;
  -- Only pre-approved column names are interpolated. Missing columns use their
  -- database defaults; values are typed by PostgreSQL rather than interpolated.
  select string_agg(format('%I', k), ',' order by k), string_agg(format('(r).%I', k), ',' order by k)
    into columns_sql, values_sql from jsonb_object_keys(p_product) as x(k);
  execute format('insert into public.supplier_products (%s) select %s from (select jsonb_populate_record(null::public.supplier_products, $1) as r) q returning *', columns_sql, values_sql)
    using p_product into saved;
  snapshot := public.quantity_product_review_context(to_jsonb(saved));
  insert into public.product_quantity_price_revisions
    (product_id,status,grade,incoterm,tiers,warnings,confirmed_at,product_updated_at,product_context)
    values (saved.id,'pending',p_grade,p_incoterm,p_tiers,p_warnings,now(),saved.updated_at,snapshot);
  if p_english_name is not null and btrim(p_english_name) <> '' then
    insert into public.product_english_name_revisions
      (product_id,status,source_name,english_name,origin,product_updated_at,product_context)
      values (saved.id,'pending',saved.name,btrim(p_english_name),'supplier',saved.updated_at,snapshot);
  end if;
  insert into public.quantity_product_creation_requests(request_id,supplier_id,product_id,payload_hash)
    values (p_request_id,p_supplier_id,saved.id,digest);
  return to_jsonb(saved);
end;
$$;
revoke all on function public.create_supplier_product_with_quantity(uuid,uuid,jsonb,text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.create_supplier_product_with_quantity(uuid,uuid,jsonb,text,text,jsonb,jsonb,text) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261058_quantity_new_product_transaction.sql


-- BEGIN supabase/migrations/20261059_quantity_product_submit_guard.sql
-- On first submission, a product created with the quantity flow must still have
-- a current table. Lock the product and revision together so a concurrent edit
-- cannot put the product into review with an obsolete quote.

create or replace function public.submit_supplier_product_with_quantity_guard(
  p_product_id uuid, p_supplier_id uuid, p_expected_updated_at timestamptz,
  p_expected_review text, p_expected_ready boolean, p_proposal text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  price public.product_quantity_price_revisions%rowtype;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_updated_at is null or p_expected_ready is null then
    return jsonb_build_object('status','invalid');
  end if;
  select * into item from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_owned'); end if;
  if item.updated_at is distinct from p_expected_updated_at or item.supplier_review_status is distinct from p_expected_review or
     item.ready_for_buyer is distinct from p_expected_ready or item.supplier_review_status not in ('draft','changes_requested','paused') then
    return jsonb_build_object('status','changed');
  end if;
  if exists (select 1 from public.quantity_product_creation_requests where product_id = item.id) then
    select * into price from public.product_quantity_price_revisions
      where product_id = item.id and status in ('pending','approved')
      order by case status when 'pending' then 0 else 1 end limit 1 for update;
    if not found then return jsonb_build_object('status','price_missing'); end if;
    if price.product_context is null or price.product_context is distinct from public.quantity_product_review_context(to_jsonb(item)) then
      return jsonb_build_object('status','price_changed');
    end if;
  end if;
  update public.supplier_products set supplier_review_status = 'pending', supplier_review_note = null,
    ready_for_buyer = false, supplier_category_proposal = case when item.supplier_review_status = 'paused' then p_proposal else item.supplier_category_proposal end,
    updated_at = now() where id = item.id returning * into item;
  return jsonb_build_object('status','submitted','product',to_jsonb(item));
end;
$$;
revoke all on function public.submit_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text) from public, anon, authenticated;
grant execute on function public.submit_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261059_quantity_product_submit_guard.sql


-- BEGIN supabase/migrations/20261060_quantity_product_publication_guard.sql
-- Publication of a product created with the new model requires a reviewed price
-- for the same material details and category. Legacy listings keep their current
-- behavior and data until the public catalog cutover is complete.

create or replace function public.decide_supplier_product_with_quantity_guard(
  p_product_id uuid, p_supplier_id uuid, p_expected_updated_at timestamptz,
  p_expected_review text, p_expected_ready boolean, p_decision text,
  p_category text, p_note text, p_buyer_enabled boolean
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  price public.product_quantity_price_revisions%rowtype;
  current_category text;
begin
  if p_product_id is null or p_supplier_id is null or p_expected_updated_at is null or p_expected_ready is null or
     p_decision not in ('approved','changes_requested') or (p_decision = 'changes_requested' and coalesce(btrim(p_note),'') = '') then
    return jsonb_build_object('status','invalid');
  end if;
  select * into item from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if item.updated_at is distinct from p_expected_updated_at or item.supplier_review_status is distinct from p_expected_review or
     item.ready_for_buyer is distinct from p_expected_ready or
     not (item.supplier_review_status = 'pending' or (p_decision = 'approved' and item.supplier_review_status = 'approved' and not item.ready_for_buyer)) then
    return jsonb_build_object('status','changed');
  end if;
  if p_decision = 'approved' and exists (select 1 from public.quantity_product_creation_requests where product_id = item.id) then
    if p_buyer_enabled is not true then return jsonb_build_object('status','buyer_not_enabled'); end if;
    current_category := coalesce(item.reviewed_category_slug, item.supplier_category_proposal, item.category);
    if p_category is distinct from current_category then return jsonb_build_object('status','category_changed'); end if;
    select * into price from public.product_quantity_price_revisions
      where product_id = item.id and status = 'approved' for update;
    if not found then return jsonb_build_object('status','price_not_approved'); end if;
    if price.product_context is null or price.product_context is distinct from public.quantity_product_review_context(to_jsonb(item)) then
      return jsonb_build_object('status','price_changed');
    end if;
  end if;
  update public.supplier_products set supplier_review_status = p_decision,
    supplier_review_note = case when p_decision = 'approved' then null else p_note end,
    ready_for_buyer = p_decision = 'approved',
    reviewed_category_slug = case when p_decision = 'approved' then p_category else item.reviewed_category_slug end,
    category = case when p_category is not null then p_category else item.category end,
    specs = case when p_decision = 'approved' then coalesce(item.specs, '{}'::jsonb) - 'price_review_summary' else item.specs end,
    updated_at = now() where id = item.id returning * into item;
  return jsonb_build_object('status','saved','product',to_jsonb(item));
end;
$$;
revoke all on function public.decide_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.decide_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text,text,text,boolean) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261060_quantity_product_publication_guard.sql


-- BEGIN supabase/migrations/20261061_supplier_image_limit.sql
-- Supplier product uploads: enforce the eight-image limit atomically without
-- deleting or modifying legacy images. Apply after the previous migrations.

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
       where owner_type = 'product' and product_id = p_product_id and kind = 'image') >= 8 then
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

-- END supabase/migrations/20261061_supplier_image_limit.sql


-- BEGIN supabase/migrations/20261062_private_product_form_drafts.sql
-- KHÔNG CHẠY LÚC NÀY: migration đang phát triển, chưa sẵn sàng triển khai.
-- Không xóa, thay thế hay chuyển đổi sản phẩm hiện có khi chạy migration này.
-- ON DELETE CASCADE chỉ xóa bản nháp con nếu sản phẩm/NCC cha bị xóa bằng
-- thao tác khác; nó không tự xóa sản phẩm hoặc NCC.
-- Storage foundation for incomplete product forms. No existing product is
-- migrated or published. The application must authorize the supplier or staff
-- actor before invoking these service-role-only functions.

create table if not exists public.product_form_drafts (
  product_id uuid primary key references public.supplier_products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  request_id uuid unique,
  creation_hash text,
  revision integer not null default 1 check (revision > 0),
  -- The eventual submit transaction must compare this snapshot with the
  -- product before applying any draft to an existing approved record.
  base_product_updated_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_form_drafts enable row level security;
revoke all on public.product_form_drafts from public, anon, authenticated;
grant all on public.product_form_drafts to service_role;

-- Creates a private shell so images can be attached before the form is complete.
-- Retries with the same request and payload return the existing shell; a changed
-- payload must be saved using the separate revision-checked update function.
create or replace function public.create_product_form_draft(
  p_supplier_id uuid, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  draft public.product_form_drafts%rowtype;
  product public.supplier_products%rowtype;
  digest text;
begin
  if p_supplier_id is null or p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object'
     or octet_length(p_payload::text) > 65536 then
    return jsonb_build_object('status', 'invalid');
  end if;
  digest := md5(jsonb_build_array(p_supplier_id, p_payload)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into draft from public.product_form_drafts where request_id = p_request_id for update;
  if found then
    if draft.supplier_id is distinct from p_supplier_id or draft.creation_hash is distinct from digest then
      return jsonb_build_object('status', 'request_conflict');
    end if;
    return jsonb_build_object('status', 'saved', 'product_id', draft.product_id, 'revision', draft.revision);
  end if;
  -- Mark the shell as a quantity product so the existing submit/publication
  -- guards cannot publish it before a complete price revision exists.
  if exists (select 1 from public.quantity_product_creation_requests where request_id = p_request_id) then
    return jsonb_build_object('status', 'request_conflict');
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  insert into public.supplier_products (supplier_id, name, category, supplier_review_status, supplier_originated, ready_for_buyer)
    values (p_supplier_id, '', null, 'draft', true, false) returning * into product;
  insert into public.product_form_drafts (product_id, supplier_id, request_id, creation_hash, base_product_updated_at, payload)
    values (product.id, p_supplier_id, p_request_id, digest, product.updated_at, p_payload) returning * into draft;
  insert into public.quantity_product_creation_requests (request_id, supplier_id, product_id, payload_hash)
    values (p_request_id, p_supplier_id, product.id, digest);
  return jsonb_build_object('status', 'saved', 'product_id', product.id, 'revision', draft.revision);
end;
$$;

-- A private draft never changes approved product fields or the buyer-visible
-- price. The caller supplies the last observed revision; stale edits fail closed.
create or replace function public.save_product_form_draft(
  p_supplier_id uuid, p_product_id uuid, p_expected_revision integer, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  product public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
begin
  if p_supplier_id is null or p_product_id is null or p_expected_revision is null or p_expected_revision < 0
     or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 65536 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into product from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  if product.supplier_review_status not in ('draft', 'changes_requested', 'approved', 'paused')
     or product.supplier_review_status is null then return jsonb_build_object('status', 'state_changed'); end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id for update;
  if found then
    if draft.supplier_id is distinct from p_supplier_id or draft.revision <> p_expected_revision then
      return jsonb_build_object('status', 'changed');
    end if;
    update public.product_form_drafts set payload = p_payload, revision = revision + 1, updated_at = now()
      where product_id = p_product_id returning * into draft;
  else
    if p_expected_revision <> 0 then return jsonb_build_object('status', 'changed'); end if;
    insert into public.product_form_drafts (product_id, supplier_id, base_product_updated_at, payload)
      values (p_product_id, p_supplier_id, product.updated_at, p_payload) returning * into draft;
  end if;
  return jsonb_build_object('status', 'saved', 'product_id', draft.product_id, 'revision', draft.revision);
end;
$$;

revoke all on function public.create_product_form_draft(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.save_product_form_draft(uuid,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.create_product_form_draft(uuid,uuid,jsonb) to service_role;
grant execute on function public.save_product_form_draft(uuid,uuid,integer,jsonb) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261062_private_product_form_drafts.sql


-- BEGIN supabase/migrations/20261063_product_form_submission.sql
-- KHÔNG CHẠY LÚC NÀY: migration đang phát triển, chưa sẵn sàng triển khai.
-- Không xóa, thay thế hay chuyển đổi sản phẩm hiện có khi chạy migration này.
-- ON DELETE CASCADE chỉ xóa bản gửi con nếu sản phẩm/NCC cha bị xóa bằng
-- thao tác khác; nó không tự xóa sản phẩm hoặc NCC.
-- Private immutable submission snapshots for the shared five-section form.
-- This migration is a foundation only. SQL64 revokes the preliminary submit
-- RPC and introduces an ordered private image selection. Neither migration is
-- ready to deploy: the review transaction and buyer cutover are incomplete.

create table if not exists public.product_form_submissions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  draft_revision integer not null check (draft_revision > 0),
  base_product_updated_at timestamptz not null,
  submitted_product_updated_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  quantity jsonb not null check (jsonb_typeof(quantity) = 'object'),
  warnings jsonb not null check (jsonb_typeof(warnings) = 'array'),
  image_ids uuid[] not null check (cardinality(image_ids) between 1 and 8),
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'superseded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(product_id, draft_revision)
);
create unique index if not exists product_form_submissions_one_pending
  on public.product_form_submissions(product_id) where status = 'pending';
alter table public.product_form_submissions enable row level security;
revoke all on public.product_form_submissions from public, anon, authenticated;
grant all on public.product_form_submissions to service_role;

-- The trusted server action must authorize the actor, validate the complete
-- payload and recompute normalized quantities from the current category policy.
-- The payload equality and revision prevent a validation/save race. Every
-- product media insert/delete uses the same product lock. A future approval RPC
-- must recheck these image IDs and the product baseline before publication.
create or replace function public.submit_product_form_draft(
  p_supplier_id uuid, p_product_id uuid, p_expected_revision integer,
  p_validated_payload jsonb, p_quantity jsonb, p_warnings jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
  previous public.product_form_submissions%rowtype;
  submission public.product_form_submissions%rowtype;
  photo_ids uuid[];
  all_photos integer;
begin
  if p_supplier_id is null or p_product_id is null or p_expected_revision is null or p_expected_revision < 1
    or jsonb_typeof(p_validated_payload) is distinct from 'object'
    or jsonb_typeof(p_quantity) is distinct from 'object'
    or jsonb_typeof(p_warnings) is distinct from 'array'
    or octet_length(p_validated_payload::text) > 65536 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into item from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;

  -- A lost response is safe to retry; it must match the exact submission.
  select * into previous from public.product_form_submissions
    where product_id = p_product_id and draft_revision = p_expected_revision for update;
  if found then
    if previous.supplier_id = p_supplier_id and previous.payload = p_validated_payload
      and previous.quantity = p_quantity and previous.warnings = p_warnings then
      if previous.status <> 'pending' then return jsonb_build_object('status', 'already_decided'); end if;
      return jsonb_build_object('status', 'submitted', 'submission_id', previous.id);
    end if;
    return jsonb_build_object('status', 'changed');
  end if;
  if item.supplier_review_status is null or item.supplier_review_status not in ('draft', 'changes_requested', 'approved', 'paused') then
    return jsonb_build_object('status', 'state_changed');
  end if;
  if exists (select 1 from public.product_form_submissions where product_id = p_product_id and status = 'pending') then
    return jsonb_build_object('status', 'already_pending');
  end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id for update;
  if not found or draft.supplier_id is distinct from p_supplier_id or draft.revision is distinct from p_expected_revision
     or draft.payload is distinct from p_validated_payload then
    return jsonb_build_object('status', 'changed');
  end if;
  if item.updated_at is distinct from draft.base_product_updated_at then
    return jsonb_build_object('status', 'product_changed');
  end if;
  select count(*) into all_photos from public.media_assets
    where owner_type = 'product' and product_id = p_product_id and kind = 'image';
  select array_agg(id order by sort_order, created_at, id) into photo_ids from public.media_assets
    where owner_type = 'product' and product_id = p_product_id and supplier_id = p_supplier_id and kind = 'image'
      and storage_path is not null and btrim(storage_path) <> '' and status <> 'expired'
      and (expires_on is null or expires_on >= (now() at time zone 'UTC')::date);
  if all_photos < 1 or all_photos > 8 or cardinality(coalesce(photo_ids, '{}'::uuid[])) <> all_photos then
    return jsonb_build_object('status', 'images_changed');
  end if;
  -- A previously approved listing and its buyer-visible price remain unchanged.
  -- For an unpublished draft, block ordinary edits until this review resolves.
  if item.supplier_review_status in ('draft', 'changes_requested') then
    update public.supplier_products set supplier_review_status = 'pending', ready_for_buyer = false,
      supplier_review_note = null, updated_at = now() where id = p_product_id returning * into item;
  end if;
  insert into public.product_form_submissions
    (product_id, supplier_id, draft_revision, base_product_updated_at, submitted_product_updated_at, payload, quantity, warnings, image_ids)
    values (p_product_id, p_supplier_id, p_expected_revision, draft.base_product_updated_at, item.updated_at,
      p_validated_payload, p_quantity, p_warnings, photo_ids)
    returning * into submission;
  return jsonb_build_object('status', 'submitted', 'submission_id', submission.id);
end;
$$;
revoke all on function public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261063_product_form_submission.sql


-- BEGIN supabase/migrations/20261064_product_form_private_images.sql
-- KHÔNG CHẠY LÚC NÀY: nền tảng ảnh nháp đang phát triển, chưa có luồng duyệt hoàn chỉnh.
-- Chỉ tạo cấu trúc mới cho form. Không đổi, xóa hoặc chuyển ảnh/sản phẩm hiện có.
-- SQL62/63 cũng chưa sẵn sàng triển khai. Không áp dụng trên database thật.

-- A draft owns an ordered selection, not public media. Existing approved assets
-- and newly uploaded files remain separate until an atomic review transaction.
alter table public.product_form_drafts add column if not exists image_selection jsonb not null default '[]'::jsonb
  check (jsonb_typeof(image_selection) = 'array' and jsonb_array_length(image_selection) <= 8);

create table if not exists public.product_form_staged_images (
  id uuid primary key,
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  created_by text not null check (length(btrim(created_by)) > 0),
  storage_path text not null unique,
  thumb_path text not null unique,
  caption text not null default '' check (length(caption) <= 150),
  mime text not null check (mime = 'image/webp'),
  bytes bigint not null check (bytes between 1 and 8388608),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  thumb_bytes bigint not null check (thumb_bytes between 1 and 8388608),
  thumb_sha256 text not null check (thumb_sha256 ~ '^[a-f0-9]{64}$'),
  width integer not null check (width between 1 and 20000),
  height integer not null check (height between 1 and 20000),
  created_at timestamptz not null default now(),
  check (storage_path = 'products/' || product_id::text || '/' || id::text || '.webp'),
  check (thumb_path = 'products/' || product_id::text || '/' || id::text || '-thumb.webp')
);
create index if not exists product_form_staged_images_product_idx on public.product_form_staged_images(product_id, supplier_id);
alter table public.product_form_staged_images enable row level security;
revoke all on public.product_form_staged_images from public, anon, authenticated;
grant all on public.product_form_staged_images to service_role;

-- Called only after trusted application authorization and successful storage
-- writes. A staged row is never inserted in media_assets here, so the existing
-- public media ACL cannot expose it, even for an already-approved product.
-- A server must NOT delete storage objects on an uncertain RPC result; the
-- transaction may have committed despite a lost response. Reload to reconcile.
create or replace function public.stage_product_form_image(
  p_supplier_id uuid, p_product_id uuid, p_user_id text, p_expected_revision integer,
  p_id uuid, p_caption text, p_bytes bigint, p_width integer, p_height integer,
  p_sha256 text, p_thumb_bytes bigint, p_thumb_sha256 text,
  p_replaces_media_id uuid default null, p_expected_media jsonb default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  product public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
  photo public.product_form_staged_images%rowtype;
  source_media public.media_assets%rowtype;
  next_selection jsonb;
  path text;
  thumb text;
begin
  if p_supplier_id is null or p_product_id is null or p_id is null or coalesce(btrim(p_user_id), '') = ''
     or p_expected_revision is null or p_expected_revision < 1 or length(coalesce(p_caption,'')) > 150
     or p_bytes is null or p_bytes not between 1 and 8388608
     or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
     or p_thumb_bytes is null or p_thumb_bytes not between 1 and 8388608
     or p_thumb_sha256 is null or p_thumb_sha256 !~ '^[a-f0-9]{64}$'
     or (p_replaces_media_id is null) <> (p_expected_media is null)
     or (p_expected_media is not null and jsonb_typeof(p_expected_media) is distinct from 'object')
     or p_width is null or p_width not between 1 and 20000 or p_height is null or p_height not between 1 and 20000 then
    return jsonb_build_object('status','invalid');
  end if;
  select * into product from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_owned'); end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','missing_draft'); end if;
  select * into photo from public.product_form_staged_images where id = p_id;
  if found then
    if photo.product_id = p_product_id and photo.supplier_id = p_supplier_id and photo.created_by = p_user_id
       and photo.caption = coalesce(p_caption,'') and photo.bytes = p_bytes and photo.sha256 = p_sha256
       and photo.thumb_bytes = p_thumb_bytes and photo.thumb_sha256 = p_thumb_sha256
       and photo.width = p_width and photo.height = p_height then
      return jsonb_build_object('status','exists','revision',draft.revision,'image_id',photo.id);
    end if;
    return jsonb_build_object('status','conflict');
  end if;
  if product.supplier_review_status is null or product.supplier_review_status not in ('draft','changes_requested','approved','paused') then
    return jsonb_build_object('status','state_changed');
  end if;
  if draft.revision <> p_expected_revision then return jsonb_build_object('status','changed'); end if;
  if draft.base_product_updated_at is distinct from product.updated_at then return jsonb_build_object('status','product_changed'); end if;
  if p_replaces_media_id is null then
    if jsonb_array_length(draft.image_selection) >= 8 then return jsonb_build_object('status','image_limit'); end if;
    next_selection := draft.image_selection || jsonb_build_array(jsonb_build_object('source','staged','id',p_id));
  else
    -- Replace the selected reference in place, without deleting or changing
    -- the public media. The trusted caller has copied the source bytes first.
    select * into source_media from public.media_assets where id = p_replaces_media_id for update;
    if not found or to_jsonb(source_media) is distinct from p_expected_media
       or source_media.owner_type is distinct from 'product' or source_media.product_id is distinct from p_product_id
       or source_media.supplier_id is distinct from p_supplier_id or source_media.kind is distinct from 'image'
       or source_media.storage_path is null or btrim(source_media.storage_path) = ''
       or source_media.status is null or source_media.status = 'expired'
       or (source_media.expires_on is not null and source_media.expires_on < (now() at time zone 'UTC')::date)
       or (source_media.audience is distinct from 'buyer' and source_media.created_by is distinct from p_user_id)
       or (select count(*) from jsonb_array_elements(draft.image_selection) e
           where e->>'source' = 'media' and e->>'id' = p_replaces_media_id::text) <> 1 then
      return jsonb_build_object('status','image_unavailable');
    end if;
    select jsonb_agg(case when e.value->>'source' = 'media' and e.value->>'id' = p_replaces_media_id::text
      then jsonb_build_object('source','staged','id',p_id) else e.value end order by e.ordinality)
      into next_selection from jsonb_array_elements(draft.image_selection) with ordinality e(value, ordinality);
  end if;
  path := 'products/' || p_product_id::text || '/' || p_id::text || '.webp';
  thumb := 'products/' || p_product_id::text || '/' || p_id::text || '-thumb.webp';
  -- Never create an ambiguous owner for a path served by public-media.
  if exists (select 1 from public.media_assets where id = p_id or storage_path in (path,thumb) or thumb_path in (path,thumb))
     or exists (select 1 from public.product_form_staged_images where storage_path in (path,thumb) or thumb_path in (path,thumb)) then
    return jsonb_build_object('status','conflict');
  end if;
  insert into public.product_form_staged_images (id,product_id,supplier_id,created_by,storage_path,thumb_path,caption,mime,bytes,width,height,sha256,thumb_bytes,thumb_sha256)
    values (p_id,p_product_id,p_supplier_id,p_user_id,path,thumb,coalesce(p_caption,''),'image/webp',p_bytes,p_width,p_height,p_sha256,p_thumb_bytes,p_thumb_sha256);
  update public.product_form_drafts set revision = revision + 1, updated_at = now(), image_selection = next_selection
    where product_id = p_product_id returning * into draft;
  return jsonb_build_object('status','created','revision',draft.revision,'image_id',p_id);
end;
$$;

-- Ordering and removals affect only the private selection. They never delete or
-- unshare an existing buyer image. Staff access must be authorized separately
-- by the caller; untrusted clients do not have EXECUTE on this function.
create or replace function public.set_product_form_images(
  p_supplier_id uuid, p_product_id uuid, p_user_id text, p_staff boolean,
  p_expected_revision integer, p_selection jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  product public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
  element jsonb;
  image_id uuid;
  image_source text;
  seen text[] := '{}';
  token text;
begin
  if p_supplier_id is null or p_product_id is null or coalesce(btrim(p_user_id),'') = '' or p_staff is null
     or p_expected_revision is null or p_expected_revision < 1 or jsonb_typeof(p_selection) is distinct from 'array' then
    return jsonb_build_object('status','invalid');
  end if;
  if jsonb_array_length(p_selection) > 8 then return jsonb_build_object('status','image_limit'); end if;
  select * into product from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_owned'); end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','missing_draft'); end if;
  if product.supplier_review_status is null or product.supplier_review_status not in ('draft','changes_requested','approved','paused') then
    return jsonb_build_object('status','state_changed');
  end if;
  if draft.revision <> p_expected_revision then return jsonb_build_object('status','changed'); end if;
  if draft.base_product_updated_at is distinct from product.updated_at then return jsonb_build_object('status','product_changed'); end if;
  for element in select value from jsonb_array_elements(p_selection) loop
    if jsonb_typeof(element) is distinct from 'object' then return jsonb_build_object('status','invalid'); end if;
    if (select count(*) from jsonb_object_keys(element)) <> 2
       or jsonb_typeof(element->'source') is distinct from 'string' or jsonb_typeof(element->'id') is distinct from 'string'
       or (element->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('status','invalid');
    end if;
    image_id := (element->>'id')::uuid;
    image_source := element->>'source';
    token := image_id::text;
    if token = any(seen) then return jsonb_build_object('status','invalid'); end if;
    seen := array_append(seen, token);
    if image_source = 'media' then
      if not exists (select 1 from public.media_assets m where m.id = image_id and m.owner_type = 'product'
        and m.product_id = p_product_id and m.supplier_id = p_supplier_id and m.kind = 'image'
        and m.storage_path is not null and btrim(m.storage_path) <> '' and m.status <> 'expired'
        and (m.expires_on is null or m.expires_on >= (now() at time zone 'UTC')::date)
        and (p_staff or m.audience = 'buyer' or m.created_by = p_user_id)) then
        return jsonb_build_object('status','image_unavailable');
      end if;
    elsif image_source = 'staged' then
      if not exists (select 1 from public.product_form_staged_images s where s.id = image_id and s.product_id = p_product_id
        and s.supplier_id = p_supplier_id and (p_staff or s.created_by = p_user_id)) then
        return jsonb_build_object('status','image_unavailable');
      end if;
    else return jsonb_build_object('status','invalid');
    end if;
  end loop;
  if draft.image_selection = p_selection then return jsonb_build_object('status','saved','revision',draft.revision); end if;
  update public.product_form_drafts set image_selection = p_selection, revision = revision + 1, updated_at = now()
    where product_id = p_product_id returning * into draft;
  return jsonb_build_object('status','saved','revision',draft.revision);
end;
$$;
-- The earlier preliminary submit function enumerates public media and cannot
-- represent a private selection. Do not allow it after this migration.
revoke all on function public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) from service_role;
alter table public.product_form_submissions add column if not exists image_selection jsonb not null default '[]'::jsonb;
alter table public.product_form_submissions add column if not exists image_snapshot jsonb not null default '[]'::jsonb;

-- Trusted callers authorize staff or supplier and validate the payload and
-- pricing against the live category first. Locks serialize with other draft and
-- supplier media transactions. A later approval MUST compare each snapshot
-- again, and check the submitted product version before changing public data.
create or replace function public.submit_product_form_draft_selected_images(
  p_supplier_id uuid, p_product_id uuid, p_user_id text, p_staff boolean, p_expected_revision integer,
  p_validated_payload jsonb, p_quantity jsonb, p_warnings jsonb, p_selection jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
  previous public.product_form_submissions%rowtype;
  submission public.product_form_submissions%rowtype;
  element jsonb;
  photo_id uuid;
  source text;
  seen text[] := '{}';
  token text;
  image_ids uuid[] := '{}';
  snapshots jsonb := '[]'::jsonb;
  snapshot jsonb;
  path text;
  thumb text;
begin
  if p_supplier_id is null or p_product_id is null or coalesce(btrim(p_user_id),'') = '' or p_staff is null
     or p_expected_revision is null or p_expected_revision < 1
     or jsonb_typeof(p_validated_payload) is distinct from 'object' or octet_length(p_validated_payload::text) > 65536
     or jsonb_typeof(p_quantity) is distinct from 'object' or jsonb_typeof(p_warnings) is distinct from 'array'
     or jsonb_typeof(p_selection) is distinct from 'array' then return jsonb_build_object('status','invalid'); end if;
  if jsonb_array_length(p_selection) not between 1 and 8 then return jsonb_build_object('status','images_changed'); end if;
  select * into item from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_owned'); end if;
  select * into previous from public.product_form_submissions where product_id = p_product_id and draft_revision = p_expected_revision for update;
  if found then
    if previous.supplier_id = p_supplier_id and previous.payload = p_validated_payload and previous.quantity = p_quantity
       and previous.warnings = p_warnings and previous.image_selection = p_selection then
      if previous.status <> 'pending' then return jsonb_build_object('status','already_decided'); end if;
      return jsonb_build_object('status','submitted','submission_id',previous.id);
    end if;
    return jsonb_build_object('status','changed');
  end if;
  if item.supplier_review_status is null or item.supplier_review_status not in ('draft','changes_requested','approved','paused') then
    return jsonb_build_object('status','state_changed');
  end if;
  if exists (select 1 from public.product_form_submissions where product_id = p_product_id and status = 'pending') then
    return jsonb_build_object('status','already_pending');
  end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id and supplier_id = p_supplier_id for update;
  if not found or draft.revision is distinct from p_expected_revision or draft.payload is distinct from p_validated_payload
     or draft.image_selection is distinct from p_selection then return jsonb_build_object('status','changed'); end if;
  if item.updated_at is distinct from draft.base_product_updated_at then return jsonb_build_object('status','product_changed'); end if;
  for element in select value from jsonb_array_elements(p_selection) loop
    if jsonb_typeof(element) is distinct from 'object' then return jsonb_build_object('status','images_changed'); end if;
    if (select count(*) from jsonb_object_keys(element)) <> 2
       or jsonb_typeof(element->'source') is distinct from 'string' or jsonb_typeof(element->'id') is distinct from 'string'
       or (element->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('status','images_changed');
    end if;
    photo_id := (element->>'id')::uuid;
    source := element->>'source';
    token := photo_id::text;
    if token = any(seen) then return jsonb_build_object('status','images_changed'); end if;
    seen := array_append(seen, token);
    snapshot := null; path := null; thumb := null;
    if source = 'media' then
      select to_jsonb(m),m.storage_path,m.thumb_path into snapshot,path,thumb from public.media_assets m
        where m.id = photo_id and m.owner_type = 'product' and m.product_id = p_product_id and m.supplier_id = p_supplier_id
          and m.kind = 'image' and m.storage_path is not null and btrim(m.storage_path) <> '' and m.status <> 'expired'
          and (m.expires_on is null or m.expires_on >= (now() at time zone 'UTC')::date)
          and (p_staff or m.audience = 'buyer' or m.created_by = p_user_id) for update;
      if snapshot is null or (select count(*) from public.media_assets m where m.storage_path in (path,thumb) or m.thumb_path in (path,thumb)) <> 1
        or exists (select 1 from public.product_form_staged_images s where s.storage_path in (path,thumb) or s.thumb_path in (path,thumb)) then
        return jsonb_build_object('status','images_changed');
      end if;
    elsif source = 'staged' then
      select to_jsonb(s),s.storage_path,s.thumb_path into snapshot,path,thumb from public.product_form_staged_images s
        where s.id = photo_id and s.product_id = p_product_id and s.supplier_id = p_supplier_id
          and (p_staff or s.created_by = p_user_id) for update;
      if snapshot is null or exists (select 1 from public.media_assets m where m.storage_path in (path,thumb) or m.thumb_path in (path,thumb))
        or exists (select 1 from public.product_form_staged_images s where s.id <> photo_id and (s.storage_path in (path,thumb) or s.thumb_path in (path,thumb))) then
        return jsonb_build_object('status','images_changed');
      end if;
    else return jsonb_build_object('status','images_changed'); end if;
    image_ids := array_append(image_ids, photo_id);
    snapshots := snapshots || jsonb_build_array(jsonb_build_object('source',source,'row',snapshot));
  end loop;
  if item.supplier_review_status in ('draft','changes_requested') then
    update public.supplier_products set supplier_review_status = 'pending',ready_for_buyer = false,
      supplier_review_note = null,updated_at = now() where id = p_product_id returning * into item;
  end if;
  insert into public.product_form_submissions (product_id,supplier_id,draft_revision,base_product_updated_at,
    submitted_product_updated_at,payload,quantity,warnings,image_ids,image_selection,image_snapshot)
    values (p_product_id,p_supplier_id,p_expected_revision,draft.base_product_updated_at,item.updated_at,
      p_validated_payload,p_quantity,p_warnings,image_ids,p_selection,snapshots) returning * into submission;
  return jsonb_build_object('status','submitted','submission_id',submission.id);
end;
$$;
revoke all on function public.submit_product_form_draft_selected_images(uuid,uuid,text,boolean,integer,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_product_form_draft_selected_images(uuid,uuid,text,boolean,integer,jsonb,jsonb,jsonb,jsonb) to service_role;

-- A rejection must not replace any approved name, price, public fields or
-- images. Store the reason on the submission; only an unpublished shell gets
-- its workflow status changed. The actor is authenticated by the server action.
alter table public.product_form_submissions add column if not exists decision_note text;
alter table public.product_form_submissions add column if not exists decided_by uuid;
create or replace function public.request_product_form_changes(
  p_product_id uuid, p_submission_id uuid, p_actor_id uuid,
  p_expected_product_updated_at timestamptz, p_note text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  submission public.product_form_submissions%rowtype;
  draft public.product_form_drafts%rowtype;
begin
  if p_product_id is null or p_submission_id is null or p_actor_id is null or p_expected_product_updated_at is null
     or p_note is null or length(btrim(p_note)) = 0 or length(p_note) > 1000 then
    return jsonb_build_object('status','invalid');
  end if;
  select * into item from public.supplier_products where id = p_product_id for update;
  if not found then return jsonb_build_object('status','missing_product'); end if;
  select * into submission from public.product_form_submissions where id = p_submission_id and product_id = p_product_id for update;
  if not found then return jsonb_build_object('status','changed'); end if;
  if submission.status = 'changes_requested' and submission.decided_by = p_actor_id
     and submission.decision_note = btrim(p_note) then
    return jsonb_build_object('status','changes_requested','already_decided',true);
  end if;
  if submission.status <> 'pending' then return jsonb_build_object('status','changed'); end if;
  if item.updated_at is distinct from p_expected_product_updated_at
     or item.updated_at is distinct from submission.submitted_product_updated_at then
    return jsonb_build_object('status','product_changed');
  end if;
  if item.supplier_id is distinct from submission.supplier_id or item.supplier_review_status is null
     or item.supplier_review_status not in ('pending','approved','paused') then
    return jsonb_build_object('status','state_changed');
  end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id for update;
  if item.supplier_review_status = 'pending' then
    -- Check the original draft before refreshing its baseline. A different or
    -- missing draft must not silently inherit a newer product version.
    if draft.product_id is null or draft.supplier_id is distinct from submission.supplier_id
       or draft.revision is distinct from submission.draft_revision
       or draft.base_product_updated_at is distinct from submission.base_product_updated_at
       or draft.payload is distinct from submission.payload or draft.image_selection is distinct from submission.image_selection then
      return jsonb_build_object('status','changed');
    end if;
    update public.supplier_products set supplier_review_status = 'changes_requested', supplier_review_note = btrim(p_note),
      ready_for_buyer = false, updated_at = now() where id = p_product_id returning * into item;
  end if;
  -- Give an unchanged submitted draft a fresh revision, so an exact retry of
  -- the old submission cannot be mistaken for a new request. A newer private
  -- draft on an already-approved product is left entirely untouched.
  if draft.product_id is not null and draft.supplier_id = submission.supplier_id
     and draft.revision = submission.draft_revision and draft.base_product_updated_at = submission.base_product_updated_at
     and draft.payload = submission.payload and draft.image_selection = submission.image_selection then
    update public.product_form_drafts set revision = revision + 1, base_product_updated_at = item.updated_at, updated_at = now()
      where product_id = p_product_id;
  end if;
  update public.product_form_submissions set status = 'changes_requested', decided_at = now(),
    decided_by = p_actor_id, decision_note = btrim(p_note) where id = p_submission_id;
  return jsonb_build_object('status','changes_requested','already_decided',false);
end;
$$;
revoke all on function public.request_product_form_changes(uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.request_product_form_changes(uuid,uuid,uuid,timestamptz,text) to service_role;

revoke all on function public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.set_product_form_images(uuid,uuid,text,boolean,integer,jsonb) from public, anon, authenticated;
grant execute on function public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb) to service_role;
grant execute on function public.set_product_form_images(uuid,uuid,text,boolean,integer,jsonb) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261064_product_form_private_images.sql


-- BEGIN supabase/migrations/20261065_product_form_review_context.sql
-- KHÔNG CHẠY LÚC NÀY: chỉ là nền tảng kiểm tra duyệt, chưa có transaction công bố.
-- Không xóa hoặc sửa sản phẩm, ảnh hay dữ liệu đang công khai.

-- A future atomic approval records the precise approved price revision here.
-- This link lets buyer projections prove the per-product consent belongs to
-- that revision; it does not itself publish or approve anything.
alter table public.product_form_submissions add column if not exists approved_price_revision_id uuid
  references public.product_quantity_price_revisions(id) on delete restrict;
create unique index if not exists product_form_submission_price_revision_key
  on public.product_form_submissions(approved_price_revision_id) where approved_price_revision_id is not null;

-- Gallery order is independent of legacy media rows. This lets a future
-- approval select at most eight images without deleting old rows or breaking
-- their existing URLs. No manifest is written until atomic approval exists.
create unique index if not exists product_form_submission_product_key on public.product_form_submissions(id, product_id);
create unique index if not exists product_form_media_product_key on public.media_assets(id, product_id);
create table if not exists public.product_form_published_images (
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  submission_id uuid not null,
  media_id uuid not null,
  position smallint not null check (position between 0 and 7),
  primary key (product_id, position),
  unique (product_id, media_id),
  foreign key (submission_id, product_id) references public.product_form_submissions(id, product_id) on delete cascade,
  foreign key (media_id, product_id) references public.media_assets(id, product_id) on delete restrict
);
alter table public.product_form_published_images enable row level security;
revoke all on public.product_form_published_images from public, anon, authenticated;
grant all on public.product_form_published_images to service_role;

-- This service-role-only helper must be called INSIDE the eventual approval
-- transaction. A separate RPC call releases its locks at the end of that call;
-- it is not an approval and cannot guarantee that a later RPC sees the same data.
-- The approval transaction must compare this exact JSONB with the snapshot the
-- authorized server used for its current-policy, HTML, English and byte checks.
-- All known quantity-revision writers lock the product first. The revision-table
-- locks additionally prevent unguarded inserts/updates during the final decision.
create or replace function public.product_form_review_context(p_product_id uuid, p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  submission public.product_form_submissions%rowtype;
  category public.categories%rowtype;
  settings public.quantity_price_settings%rowtype;
  grade_bounds jsonb;
  prices jsonb;
  names jsonb;
  published_images jsonb;
  entry jsonb;
  selected jsonb;
  current_photo jsonb;
  photo_id uuid;
  photo_path text;
  photo_thumb text;
  index_ integer;
  seen uuid[] := '{}';
begin
  if p_product_id is null or p_submission_id is null then return jsonb_build_object('status','invalid'); end if;
  select * into item from public.supplier_products where id = p_product_id for update;
  if not found then return jsonb_build_object('status','missing_product'); end if;
  select * into submission from public.product_form_submissions where id = p_submission_id and product_id = p_product_id for update;
  if not found or submission.status <> 'pending' or submission.supplier_id is distinct from item.supplier_id then
    return jsonb_build_object('status','submission_changed');
  end if;
  if item.updated_at is distinct from submission.submitted_product_updated_at
     or item.supplier_review_status is null or item.supplier_review_status not in ('pending','approved','paused') then
    return jsonb_build_object('status','product_changed');
  end if;
  -- Never reinterpret an existing multi-grade listing as one grade. The user
  -- will create and review separate drafts manually; the original stays intact.
  if item.specs is not null and jsonb_typeof(item.specs) is distinct from 'object' then
    return jsonb_build_object('status','legacy_grade_unmapped');
  end if;
  if item.specs->'grade' is not null and item.specs->'grade' <> 'null'::jsonb
     and jsonb_typeof(item.specs->'grade') is distinct from 'string' then
    return jsonb_build_object('status','legacy_grade_unmapped');
  end if;
  if item.specs->'grade_rows' is not null and item.specs->'grade_rows' <> 'null'::jsonb then
    if jsonb_typeof(item.specs->'grade_rows') is distinct from 'array' then return jsonb_build_object('status','legacy_grade_unmapped'); end if;
    if jsonb_array_length(item.specs->'grade_rows') > 1 then return jsonb_build_object('status','legacy_grade_unmapped'); end if;
    if jsonb_array_length(item.specs->'grade_rows') = 1 then
      if jsonb_typeof(item.specs->'grade_rows'->0) is distinct from 'object'
         or jsonb_typeof(item.specs->'grade_rows'->0->'grade') is distinct from 'string'
         or coalesce(btrim(item.specs->'grade_rows'->0->>'grade'),'') = '' then
        return jsonb_build_object('status','legacy_grade_unmapped');
      end if;
      if coalesce(btrim(item.specs->>'grade'),'') <> ''
         and lower(regexp_replace(btrim(item.specs->>'grade'),'\s+',' ','g'))
             <> lower(regexp_replace(btrim(item.specs->'grade_rows'->0->>'grade'),'\s+',' ','g')) then
        return jsonb_build_object('status','legacy_grade_unmapped');
      end if;
    end if;
  end if;
  -- Prevent policy/category changes, including new grade-bound rows (row locks
  -- alone cannot prevent an insert into an otherwise empty category).
  lock table public.categories, public.quantity_price_settings, public.category_grade_price_bounds in share mode;
  lock table public.product_quantity_price_revisions, public.product_english_name_revisions,
    public.media_assets, public.product_form_staged_images, public.product_form_published_images in share row exclusive mode;
  select * into category from public.categories where slug = submission.payload->>'category';
  if not found or category.status <> 'published' or category.is_published is distinct from true then
    return jsonb_build_object('status','category_changed');
  end if;
  select * into settings from public.quantity_price_settings where singleton = true;
  if not found then return jsonb_build_object('status','policy_unavailable'); end if;
  select coalesce(jsonb_agg(to_jsonb(b) order by b.grade),'[]'::jsonb) into grade_bounds
    from public.category_grade_price_bounds b where b.category_id = category.id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb) into prices
    from public.product_quantity_price_revisions p where p.product_id = item.id and p.status in ('draft','pending','approved');
  select coalesce(jsonb_agg(to_jsonb(n) order by n.id),'[]'::jsonb) into names
    from public.product_english_name_revisions n where n.product_id = item.id and n.status in ('draft','pending','approved');
  select coalesce(jsonb_agg(to_jsonb(i) order by i.position),'[]'::jsonb) into published_images
    from public.product_form_published_images i where i.product_id = item.id;
  if jsonb_typeof(submission.image_selection) is distinct from 'array' or jsonb_typeof(submission.image_snapshot) is distinct from 'array' then
    return jsonb_build_object('status','images_changed');
  end if;
  if jsonb_array_length(submission.image_selection) not between 1 and 8
     or jsonb_array_length(submission.image_selection) <> jsonb_array_length(submission.image_snapshot)
     or cardinality(submission.image_ids) is distinct from jsonb_array_length(submission.image_selection) then
    return jsonb_build_object('status','images_changed');
  end if;
  for index_ in 0..jsonb_array_length(submission.image_selection)-1 loop
    selected := submission.image_selection->index_;
    entry := submission.image_snapshot->index_;
    if jsonb_typeof(selected) is distinct from 'object' or jsonb_typeof(entry) is distinct from 'object' then
      return jsonb_build_object('status','images_changed');
    end if;
    if (select count(*) from jsonb_object_keys(selected)) <> 2 or jsonb_typeof(selected->'id') is distinct from 'string'
       or jsonb_typeof(selected->'source') is distinct from 'string' or jsonb_typeof(entry->'row') is distinct from 'object'
       or entry->>'source' is distinct from selected->>'source' or (selected->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('status','images_changed');
    end if;
    photo_id := (selected->>'id')::uuid;
    if photo_id is null or photo_id = any(seen) or submission.image_ids[index_ + 1] is distinct from photo_id then
      return jsonb_build_object('status','images_changed');
    end if;
    seen := array_append(seen,photo_id);
    current_photo := null; photo_path := null; photo_thumb := null;
    if selected->>'source' = 'staged' then
      select to_jsonb(s), s.storage_path, s.thumb_path into current_photo, photo_path, photo_thumb
        from public.product_form_staged_images s where s.id = photo_id and s.product_id = item.id and s.supplier_id = item.supplier_id for update;
      if current_photo is null or exists (select 1 from public.media_assets m where m.storage_path in (photo_path,photo_thumb) or m.thumb_path in (photo_path,photo_thumb))
        or exists (select 1 from public.product_form_staged_images s where s.id <> photo_id and (s.storage_path in (photo_path,photo_thumb) or s.thumb_path in (photo_path,photo_thumb))) then
        return jsonb_build_object('status','images_changed');
      end if;
    elsif selected->>'source' = 'media' then
      select to_jsonb(m), m.storage_path, m.thumb_path into current_photo, photo_path, photo_thumb
        from public.media_assets m where m.id = photo_id and m.product_id = item.id and m.supplier_id = item.supplier_id
          and m.owner_type = 'product' and m.kind = 'image' and m.status <> 'expired'
          and (m.expires_on is null or m.expires_on >= (now() at time zone 'UTC')::date) for update;
      if current_photo is null or coalesce(btrim(photo_path),'') = ''
        or (select count(*) from public.media_assets m where m.storage_path in (photo_path,photo_thumb) or m.thumb_path in (photo_path,photo_thumb)) <> 1
        or exists (select 1 from public.product_form_staged_images s where s.storage_path in (photo_path,photo_thumb) or s.thumb_path in (photo_path,photo_thumb)) then
        return jsonb_build_object('status','images_changed');
      end if;
    else return jsonb_build_object('status','images_changed'); end if;
    if current_photo is distinct from entry->'row' then return jsonb_build_object('status','images_changed'); end if;
  end loop;
  return jsonb_build_object('status','ok','product',to_jsonb(item),'submission',to_jsonb(submission),
    'category',to_jsonb(category),'settings',to_jsonb(settings),'bounds',grade_bounds,'prices',prices,'names',names,
    'published_images',published_images);
end;
$$;
revoke all on function public.product_form_review_context(uuid,uuid) from public, anon, authenticated;
grant execute on function public.product_form_review_context(uuid,uuid) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261065_product_form_review_context.sql


-- BEGIN supabase/migrations/20261066_product_form_private_image_namespace.sql
-- KHÔNG CHẠY LÚC NÀY: sửa sai khác SQL64, cần kiểm thử staging trước khi triển khai form.
-- Không đổi/xóa sản phẩm, ảnh, bản nháp hay bản gửi. Nếu còn ảnh nháp dùng
-- đường dẫn cũ, dừng toàn bộ migration để xử lý thủ công; không tự chuyển file.

lock table public.product_form_staged_images in access exclusive mode;
do $$
declare
  stage_fn regprocedure := to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)');
begin
  if stage_fn is null or has_function_privilege('anon', stage_fn, 'execute')
     or has_function_privilege('authenticated', stage_fn, 'execute')
     or not has_function_privilege('service_role', stage_fn, 'execute') then
    raise exception 'Hàm ảnh nháp hoặc quyền khác dự kiến; dừng để kiểm tra';
  end if;
  if exists (select 1 from public.product_form_staged_images
    where storage_path is distinct from 'product-form-images/' || product_id::text || '/' || id::text || '.webp'
       or thumb_path is distinct from 'product-form-images/' || product_id::text || '/' || id::text || '-thumb.webp') then
    raise exception 'Ảnh nháp đang dùng đường dẫn cũ; dừng để kiểm tra, không tự chuyển dữ liệu';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.product_form_staged_images'::regclass
      and contype = 'c' and conname in ('product_form_staged_images_check','product_form_staged_images_check1')
      and pg_get_constraintdef(oid) like '%product_id%'
      and ((conname = 'product_form_staged_images_check' and pg_get_constraintdef(oid) like '%storage_path%')
        or (conname = 'product_form_staged_images_check1' and pg_get_constraintdef(oid) like '%thumb_path%'))
      and (pg_get_constraintdef(oid) like '%products/%' or pg_get_constraintdef(oid) like '%product-form-images/%')) <> 2 then
    raise exception 'Ràng buộc ảnh nháp khác dự kiến; dừng để kiểm tra';
  end if;
end $$;
alter table public.product_form_staged_images
  drop constraint product_form_staged_images_check,
  drop constraint product_form_staged_images_check1,
  add constraint product_form_staged_images_check
    check (storage_path = 'product-form-images/' || product_id::text || '/' || id::text || '.webp'),
  add constraint product_form_staged_images_check1
    check (thumb_path = 'product-form-images/' || product_id::text || '/' || id::text || '-thumb.webp');

-- Replace only the existing service-only function; keep its signature and grants.
create or replace function public.stage_product_form_image(
  p_supplier_id uuid, p_product_id uuid, p_user_id text, p_expected_revision integer,
  p_id uuid, p_caption text, p_bytes bigint, p_width integer, p_height integer,
  p_sha256 text, p_thumb_bytes bigint, p_thumb_sha256 text,
  p_replaces_media_id uuid default null, p_expected_media jsonb default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  product public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
  photo public.product_form_staged_images%rowtype;
  source_media public.media_assets%rowtype;
  next_selection jsonb;
  path text;
  thumb text;
begin
  if p_supplier_id is null or p_product_id is null or p_id is null or coalesce(btrim(p_user_id), '') = ''
     or p_expected_revision is null or p_expected_revision < 1 or length(coalesce(p_caption,'')) > 150
     or p_bytes is null or p_bytes not between 1 and 8388608
     or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
     or p_thumb_bytes is null or p_thumb_bytes not between 1 and 8388608
     or p_thumb_sha256 is null or p_thumb_sha256 !~ '^[a-f0-9]{64}$'
     or (p_replaces_media_id is null) <> (p_expected_media is null)
     or (p_expected_media is not null and jsonb_typeof(p_expected_media) is distinct from 'object')
     or p_width is null or p_width not between 1 and 20000 or p_height is null or p_height not between 1 and 20000 then
    return jsonb_build_object('status','invalid');
  end if;
  select * into product from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_owned'); end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','missing_draft'); end if;
  select * into photo from public.product_form_staged_images where id = p_id;
  if found then
    if photo.product_id = p_product_id and photo.supplier_id = p_supplier_id and photo.created_by = p_user_id
       and photo.caption = coalesce(p_caption,'') and photo.bytes = p_bytes and photo.sha256 = p_sha256
       and photo.thumb_bytes = p_thumb_bytes and photo.thumb_sha256 = p_thumb_sha256
       and photo.width = p_width and photo.height = p_height then
      return jsonb_build_object('status','exists','revision',draft.revision,'image_id',photo.id);
    end if;
    return jsonb_build_object('status','conflict');
  end if;
  if product.supplier_review_status is null or product.supplier_review_status not in ('draft','changes_requested','approved','paused') then
    return jsonb_build_object('status','state_changed');
  end if;
  if draft.revision <> p_expected_revision then return jsonb_build_object('status','changed'); end if;
  if draft.base_product_updated_at is distinct from product.updated_at then return jsonb_build_object('status','product_changed'); end if;
  if p_replaces_media_id is null then
    if jsonb_array_length(draft.image_selection) >= 8 then return jsonb_build_object('status','image_limit'); end if;
    next_selection := draft.image_selection || jsonb_build_array(jsonb_build_object('source','staged','id',p_id));
  else
    -- Replace the selected reference in place, without deleting or changing
    -- the public media. The trusted caller has copied the source bytes first.
    select * into source_media from public.media_assets where id = p_replaces_media_id for update;
    if not found or to_jsonb(source_media) is distinct from p_expected_media
       or source_media.owner_type is distinct from 'product' or source_media.product_id is distinct from p_product_id
       or source_media.supplier_id is distinct from p_supplier_id or source_media.kind is distinct from 'image'
       or source_media.storage_path is null or btrim(source_media.storage_path) = ''
       or source_media.status is null or source_media.status = 'expired'
       or (source_media.expires_on is not null and source_media.expires_on < (now() at time zone 'UTC')::date)
       or (source_media.audience is distinct from 'buyer' and source_media.created_by is distinct from p_user_id)
       or (select count(*) from jsonb_array_elements(draft.image_selection) e
           where e->>'source' = 'media' and e->>'id' = p_replaces_media_id::text) <> 1 then
      return jsonb_build_object('status','image_unavailable');
    end if;
    select jsonb_agg(case when e.value->>'source' = 'media' and e.value->>'id' = p_replaces_media_id::text
      then jsonb_build_object('source','staged','id',p_id) else e.value end order by e.ordinality)
      into next_selection from jsonb_array_elements(draft.image_selection) with ordinality e(value, ordinality);
  end if;
  path := 'product-form-images/' || p_product_id::text || '/' || p_id::text || '.webp';
  thumb := 'product-form-images/' || p_product_id::text || '/' || p_id::text || '-thumb.webp';
  -- Never create an ambiguous owner for a path served by public-media.
  if exists (select 1 from public.media_assets where id = p_id or storage_path in (path,thumb) or thumb_path in (path,thumb))
     or exists (select 1 from public.product_form_staged_images where storage_path in (path,thumb) or thumb_path in (path,thumb)) then
    return jsonb_build_object('status','conflict');
  end if;
  insert into public.product_form_staged_images (id,product_id,supplier_id,created_by,storage_path,thumb_path,caption,mime,bytes,width,height,sha256,thumb_bytes,thumb_sha256)
    values (p_id,p_product_id,p_supplier_id,p_user_id,path,thumb,coalesce(p_caption,''),'image/webp',p_bytes,p_width,p_height,p_sha256,p_thumb_bytes,p_thumb_sha256);
  update public.product_form_drafts set revision = revision + 1, updated_at = now(), image_selection = next_selection
    where product_id = p_product_id returning * into draft;
  return jsonb_build_object('status','created','revision',draft.revision,'image_id',p_id);
end;
$$;

notify pgrst, 'reload schema';

-- END supabase/migrations/20261066_product_form_private_image_namespace.sql


-- BEGIN supabase/migrations/20261067_product_form_image_namespace_capability.sql
-- KHÔNG CHẠY LÚC NÀY: cần kiểm thử staging trước khi mở form.
-- Chỉ tạo hàm kiểm tra, không thay đổi sản phẩm, nháp, ảnh hay dữ liệu Storage.

-- Called before any Storage write. A missing or mismatched migration must not
-- leave orphan files while an older stage function still targets products/.
-- The hash pins the SQL66 function body. Any later change to that function must
-- update this readiness contract in a new reviewed migration.
create or replace function public.product_form_image_namespace_ready()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)') is not null
    and exists (select 1 from pg_proc where oid = to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)')
      and prosecdef and proconfig = array['search_path=public, pg_temp']
      and md5(prosrc) = '9b434d1a5684e9a0f829a6ddc1bc9869')
    and not has_function_privilege('anon', to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)'), 'execute')
    and not has_function_privilege('authenticated', to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)'), 'execute')
    and has_function_privilege('service_role', to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)'), 'execute')
    and (select count(*) from pg_constraint where conrelid = 'public.product_form_staged_images'::regclass
      and contype = 'c' and convalidated and ((conname = 'product_form_staged_images_check' and pg_get_constraintdef(oid) =
        'CHECK ((storage_path = ((((''product-form-images/''::text || (product_id)::text) || ''/''::text) || (id)::text) || ''.webp''::text)))')
        or (conname = 'product_form_staged_images_check1' and pg_get_constraintdef(oid) =
        'CHECK ((thumb_path = ((((''product-form-images/''::text || (product_id)::text) || ''/''::text) || (id)::text) || ''-thumb.webp''::text)))'))) = 2,
    false);
$$;
revoke all on function public.product_form_image_namespace_ready() from public, anon, authenticated;
grant execute on function public.product_form_image_namespace_ready() to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261067_product_form_image_namespace_capability.sql


-- BEGIN supabase/migrations/20261068_product_form_namespace_constraints.sql
-- KHÔNG CHẠY LÚC NÀY: cần kiểm thử staging trước khi mở form.
-- Khắc phục trạng thái hàm dùng namespace mới nhưng ràng buộc còn namespace cũ.
-- Không sửa hoặc xóa sản phẩm, nháp, ảnh hay Storage; dừng nếu còn ảnh nháp cũ.

lock table public.product_form_staged_images in access exclusive mode;
do $$
declare
  stage_fn regprocedure := to_regprocedure('public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)');
begin
  if stage_fn is null or not exists (select 1 from pg_proc where oid = stage_fn and prosecdef
       and proconfig = array['search_path=public, pg_temp'] and md5(prosrc) = '9b434d1a5684e9a0f829a6ddc1bc9869')
     or has_function_privilege('anon', stage_fn, 'execute')
     or has_function_privilege('authenticated', stage_fn, 'execute')
     or not has_function_privilege('service_role', stage_fn, 'execute')
     or to_regprocedure('public.product_form_image_namespace_ready()') is null then
    raise exception 'Hàm ảnh nháp hoặc quyền khác dự kiến; dừng để kiểm tra';
  end if;
  if exists (select 1 from public.product_form_staged_images
    where storage_path is distinct from 'product-form-images/' || product_id::text || '/' || id::text || '.webp'
       or thumb_path is distinct from 'product-form-images/' || product_id::text || '/' || id::text || '-thumb.webp') then
    raise exception 'Ảnh nháp đang dùng đường dẫn cũ; dừng để kiểm tra, không tự chuyển dữ liệu';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.product_form_staged_images'::regclass
      and contype = 'c' and convalidated and (
        (conname = 'product_form_staged_images_check' and pg_get_constraintdef(oid) in (
          'CHECK ((storage_path = ((((''products/''::text || (product_id)::text) || ''/''::text) || (id)::text) || ''.webp''::text)))',
          'CHECK ((storage_path = ((((''product-form-images/''::text || (product_id)::text) || ''/''::text) || (id)::text) || ''.webp''::text)))'))
        or (conname = 'product_form_staged_images_check1' and pg_get_constraintdef(oid) in (
          'CHECK ((thumb_path = ((((''products/''::text || (product_id)::text) || ''/''::text) || (id)::text) || ''-thumb.webp''::text)))',
          'CHECK ((thumb_path = ((((''product-form-images/''::text || (product_id)::text) || ''/''::text) || (id)::text) || ''-thumb.webp''::text)))')))) <> 2 then
    raise exception 'Ràng buộc ảnh nháp khác dự kiến; dừng để kiểm tra';
  end if;
end $$;
alter table public.product_form_staged_images
  drop constraint product_form_staged_images_check,
  drop constraint product_form_staged_images_check1,
  add constraint product_form_staged_images_check
    check (storage_path = 'product-form-images/' || product_id::text || '/' || id::text || '.webp'),
  add constraint product_form_staged_images_check1
    check (thumb_path = 'product-form-images/' || product_id::text || '/' || id::text || '-thumb.webp');
notify pgrst, 'reload schema';

-- END supabase/migrations/20261068_product_form_namespace_constraints.sql


-- BEGIN supabase/migrations/20261069_product_form_approved_baseline.sql
-- KHÔNG CHẠY TRÊN PRODUCTION LÚC NÀY: cần transaction duyệt và kiểm thử staging.
-- Chỉ thêm cột snapshot; không sửa sản phẩm, nháp, ảnh hoặc bản duyệt cũ.

alter table public.product_form_submissions
  add column if not exists approved_product_updated_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.product_form_submissions'::regclass
    and conname = 'product_form_approved_baseline_link_check') then
    alter table public.product_form_submissions add constraint product_form_approved_baseline_link_check
      check (approved_product_updated_at is null or
        (approved_price_revision_id is not null and status in ('approved', 'superseded')));
  end if;
end $$;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261069_product_form_approved_baseline.sql


-- BEGIN supabase/migrations/20261070_product_form_checked_save.sql
-- KHÔNG CHẠY TRÊN PRODUCTION LÚC NÀY: cần kiểm thử staging và luồng duyệt.
-- Thêm wrapper an toàn, không sửa sản phẩm, ảnh, bản nháp hay hàm đã triển khai.

create or replace function public.save_product_form_draft_checked(
  p_supplier_id uuid, p_product_id uuid, p_expected_revision integer, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  product public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
  old_fn regprocedure := to_regprocedure('public.save_product_form_draft(uuid,uuid,integer,jsonb)');
begin
  if p_supplier_id is null or p_product_id is null or p_expected_revision is null or p_expected_revision < 0
    or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 65536 then
    return jsonb_build_object('status','invalid');
  end if;
  -- Do not call an unknown or publicly callable older implementation.
  if old_fn is null or not exists (select 1 from pg_proc where oid = old_fn and prosecdef
      and proconfig = array['search_path=public, pg_temp'] and md5(prosrc) = '19eadfaddd70ea675d36ff82a0fa7d5b')
    or has_function_privilege('anon', old_fn, 'execute') or has_function_privilege('authenticated', old_fn, 'execute')
    or not has_function_privilege('service_role', old_fn, 'execute') then
    return jsonb_build_object('status','save_unavailable');
  end if;
  -- Existing writers and the inner RPC use this lock order. These locks survive
  -- until the outer transaction commits, so no product change can slip through.
  select * into product from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_owned'); end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id for update;
  if found then
    if draft.supplier_id is distinct from p_supplier_id or draft.revision is distinct from p_expected_revision then
      return jsonb_build_object('status','changed');
    end if;
    if draft.base_product_updated_at is distinct from product.updated_at then
      return jsonb_build_object('status','product_changed');
    end if;
  elsif p_expected_revision <> 0 then
    return jsonb_build_object('status','changed');
  end if;
  return public.save_product_form_draft(p_supplier_id,p_product_id,p_expected_revision,p_payload);
end;
$$;
revoke all on function public.save_product_form_draft_checked(uuid,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.save_product_form_draft_checked(uuid,uuid,integer,jsonb) to service_role;
notify pgrst, 'reload schema';

-- END supabase/migrations/20261070_product_form_checked_save.sql
$vexim_staging_sql$;
end;
$vexim_staging_guard$;
