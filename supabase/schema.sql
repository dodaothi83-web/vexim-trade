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
begin;

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

commit;
notify pgrst, 'reload schema';

-- Keep factory submissions complete and immutable while a person reviews them.
-- Apply after 20261040_l2_partner_contract.sql. No existing status is changed.
-- AI findings (including historical `hard` flags) never block submission.
begin;

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

commit;
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 20261051 · categories.filters jsonb shape repair (hotfix: /rfq "a.filters?.find is not a function")
-- ---------------------------------------------------------------------------
-- Hotfix cho lỗi "TypeError: a.filters?.find is not a function" ở trang /rfq.
--
-- `categories.filters` là jsonb, nên một dòng do người sửa tay hoặc do bản CRM cũ
-- ghi có thể là map {"grades": [...]}, một object filter đơn lẻ, hoặc chuỗi JSON đã
-- mã hoá hai lần — trong khi ứng dụng chỉ đọc được mảng
-- CategoryFilter[] = [{ "key", "label", "options": [{ "value", "label" }] }].
-- Trang /rfq gọi .find() trực tiếp trên cột nên gặp map là vỡ cả trang.
--
-- Migration này chuẩn hoá dữ liệu đang có về đúng một hình dạng và chặn hình dạng
-- khác ở tầng database. Idempotent: chỉ ghi lại dòng lệch chuẩn, không đổi nội dung
-- (giữ nguyên nhãn, thứ tự và danh sách lựa chọn).
begin;

create or replace function public.category_filters_normalized(raw jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  with parsed as (
    -- Dòng cũ có thể là chuỗi JSON (jsonb_typeof = 'string') thay vì mảng.
    select case
      when raw is null then '[]'::jsonb
      when jsonb_typeof(raw) = 'string' then
        case when btrim(raw #>> '{}') ~ '^[\[{]' then (raw #>> '{}')::jsonb else '[]'::jsonb end
      else raw
    end as value
  ),
  candidates as (
    -- Mảng filter.
    select e.value as item, null::text as map_key, null::jsonb as map_value
    from parsed, jsonb_array_elements(case when jsonb_typeof(parsed.value) = 'array' then parsed.value else '[]'::jsonb end) e
    union all
    -- Một object filter duy nhất, lưu thiếu mảng bao ngoài.
    select parsed.value, null, null
    from parsed
    where jsonb_typeof(parsed.value) = 'object' and parsed.value ? 'key'
    union all
    -- Map kiểu {"grades": [...]} hoặc {"grades": {"label": ..., "options": [...]}}.
    select null, m.key, m.value
    from parsed, jsonb_each(case when jsonb_typeof(parsed.value) = 'object' and not (parsed.value ? 'key') then parsed.value else '{}'::jsonb end) m
  ),
  shaped as (
    select
      case when item is not null then coalesce(nullif(btrim(item ->> 'key'), ''), nullif(btrim(item ->> 'name'), '')) else map_key end as raw_key,
      case when item is not null then item ->> 'label' else map_value ->> 'label' end as raw_label,
      case
        when item is not null then coalesce(item -> 'options', item -> 'values', item -> 'items')
        when jsonb_typeof(map_value) = 'array' then map_value
        when jsonb_typeof(map_value) = 'object' then coalesce(map_value -> 'options', map_value -> 'values', map_value -> 'items')
        else '[]'::jsonb
      end as raw_options
    from candidates
  ),
  filters as (
    select
      -- Bản CRM cũ đặt số nhiều; form RFQ tìm đúng "grade" và "certifications".
      case lower(btrim(raw_key))
        when 'grades' then 'grade'
        when 'certs' then 'certifications'
        when 'certificates' then 'certifications'
        else btrim(raw_key)
      end as key,
      coalesce(nullif(btrim(raw_label), ''), case lower(btrim(raw_key))
        when 'grades' then 'Grades'
        when 'grade' then 'Grade'
        when 'certs' then 'Certifications'
        when 'certificates' then 'Certifications'
        when 'certifications' then 'Certifications'
        else btrim(raw_key)
      end) as label,
      raw_options
    from shaped
    where raw_key is not null and btrim(raw_key) <> ''
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', f.key,
    'label', f.label,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('value', o.value, 'label', o.label) order by o.ord)
      from (
        select
          opt.ord,
          case when jsonb_typeof(opt.value) = 'string' then btrim(opt.value #>> '{}') else opt.value ->> 'value' end as value,
          case when jsonb_typeof(opt.value) = 'string' then btrim(opt.value #>> '{}') else coalesce(nullif(btrim(opt.value ->> 'label'), ''), opt.value ->> 'value') end as label
        from jsonb_array_elements(case when jsonb_typeof(f.raw_options) = 'array' then f.raw_options else '[]'::jsonb end) with ordinality as opt(value, ord)
      ) o
      where nullif(btrim(o.value), '') is not null
    ), '[]'::jsonb)
  ) order by f.key), '[]'::jsonb)
  from filters f;
$$;

revoke all on function public.category_filters_normalized(jsonb) from public;

-- Chỉ những dòng lệch chuẩn mới bị ghi lại.
update public.categories c
set filters = public.category_filters_normalized(c.filters)
where c.filters is distinct from public.category_filters_normalized(c.filters);

-- Chặn tái diễn: cột chỉ nhận mảng. NOT VALID để không quét lại toàn bảng mỗi lần
-- thêm dòng, nhưng mọi insert/update sau đây vẫn bị buộc đúng hình dạng.
alter table public.categories drop constraint if exists categories_filters_is_array;
alter table public.categories add constraint categories_filters_is_array
  check (jsonb_typeof(filters) = 'array') not valid;

commit;
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 4c. L2 THƯƠNG MẠI: TÊN NHÀ MÁY ĐỐI TÁC
--     (Bản đầy đủ: migrations/20261074_l2_partner_factory_name.sql)
--     Hồ sơ L2 đối tác phải ghi tên nhà máy trên hợp đồng; giấy chứng nhận chỉ
--     được công bố khi tên trên giấy trùng tên này. Không backfill dữ liệu cũ.
-- ---------------------------------------------------------------------------
begin;

alter table public.supplier_submissions add column if not exists partner_factory_name text;
alter table public.verifications add column if not exists partner_factory_name text;

-- Chỉ L2 partner_contract mới có tên nhà máy đối tác; tên phải là chuỗi thật, không
-- phải khoảng trắng. NOT VALID: không quét lại dữ liệu cũ, vẫn chặn mọi ghi mới.
alter table public.supplier_submissions drop constraint if exists supplier_submissions_partner_name_ck;
alter table public.supplier_submissions add constraint supplier_submissions_partner_name_ck check (
  partner_factory_name is null or (
    coalesce(l2_scope, '') = 'partner_contract' and char_length(btrim(partner_factory_name)) between 2 and 200
  )
) not valid;
alter table public.verifications drop constraint if exists verifications_partner_name_ck;
alter table public.verifications add constraint verifications_partner_name_ck check (
  partner_factory_name is null or (
    coalesce(l2_scope, '') = 'partner_contract' and char_length(btrim(partner_factory_name)) between 2 and 200
  )
) not valid;

-- Nhà cung cấp chỉ sửa tên khi hồ sơ còn mở; đã nộp thì giữ nguyên để đối chiếu.
create or replace function public.guard_partner_factory_name_edit()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.partner_factory_name is not distinct from old.partner_factory_name then return new; end if;
  if tg_table_name = 'verifications' then
    -- Kết quả đã duyệt là mốc đối chiếu của giấy chứng nhận; không đổi tên sau đó.
    if old.status = 'approved' then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_NAME_LOCKED';
    end if;
  elsif old.status not in ('draft', 'returned') then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_NAME_LOCKED';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_partner_factory_name_edit() from public;
drop trigger if exists guard_submission_partner_name_edit on public.supplier_submissions;
create trigger guard_submission_partner_name_edit before update of partner_factory_name on public.supplier_submissions
  for each row execute function public.guard_partner_factory_name_edit();
drop trigger if exists guard_review_partner_name_edit on public.verifications;
create trigger guard_review_partner_name_edit before update of partner_factory_name on public.verifications
  for each row execute function public.guard_partner_factory_name_edit();

-- Duyệt L2 đối tác bắt buộc có tên nhà máy đối tác, cùng lúc với hợp đồng đã được
-- nhân viên đánh dấu đã kiểm và hai ô xác nhận phạm vi.
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
    if nullif(btrim(coalesce(new.partner_factory_name, '')), '') is null then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_NAME_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_partner_review_approval() from public;
drop trigger if exists guard_partner_review_approval on public.verifications;
create trigger guard_partner_review_approval before update of status on public.verifications
  for each row execute function public.guard_partner_review_approval();

commit;
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 5b. LOẠI CHỨNG NHẬN CHO BỘ LỌC NGƯỜI MUA
--     (Bản đầy đủ: migrations/20261075_certificate_scheme.sql)
--     Tách khỏi ô checklist L1 vốn gộp HACCP/ISO/FSSC/BRC/Halal. NULL = chưa phân loại.
-- ---------------------------------------------------------------------------
begin;

alter table public.certificates add column if not exists certificate_scheme text;

alter table public.certificates drop constraint if exists certificates_scheme_ck;
alter table public.certificates add constraint certificates_scheme_ck check (
  certificate_scheme is null or certificate_scheme in (
    'business_license', 'food_safety', 'export_license',
    'origin', 'phytosanitary', 'inspection_report',
    'haccp', 'iso_22000', 'fssc_22000', 'brc', 'ifs', 'iso_9001', 'gmp',
    'globalgap', 'halal', 'kosher',
    'organic_usda', 'organic_eu', 'organic_other',
    'rainforest', 'fda',
    'other'
  )
) not valid;

create index if not exists certificates_scheme_idx
  on public.certificates (certificate_scheme)
  where certificate_scheme is not null;

commit;
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 5c. PHẠM VI CHỨNG NHẬN + BẢN GIA HẠN + OPT-OUT CỦA NHÀ CUNG CẤP
--     (Bản đầy đủ: migrations/20261076_certificate_scope_flow.sql)
--     Mỗi dòng phạm vi là HOẶC một danh mục HOẶC một sản phẩm. Sản phẩm thuộc danh
--     mục có phạm vi thì tự nhận giấy; NCC bỏ tick cho một sản phẩm thì ghi opt-out.
--     Bản gia hạn: bản cũ giữ hiệu lực tới khi bản mới được duyệt.
-- ---------------------------------------------------------------------------
begin;

alter table public.certificates
  add column if not exists supersedes_certificate_id uuid references public.certificates(id) on delete set null,
  add column if not exists superseded_by_certificate_id uuid references public.certificates(id) on delete set null;

create index if not exists certificates_supersedes_idx
  on public.certificates (supersedes_certificate_id)
  where supersedes_certificate_id is not null;
create index if not exists certificates_superseded_by_idx
  on public.certificates (superseded_by_certificate_id)
  where superseded_by_certificate_id is not null;

create table if not exists public.certificate_scopes (
  id             uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  category_id    uuid references public.categories(id) on delete cascade,
  product_id     uuid references public.supplier_products(id) on delete cascade,
  verified_by    text,
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint certificate_scopes_one_target check ((category_id is null) <> (product_id is null))
);
create index if not exists certificate_scopes_certificate_idx
  on public.certificate_scopes (certificate_id);
create index if not exists certificate_scopes_category_idx
  on public.certificate_scopes (category_id) where category_id is not null;
create index if not exists certificate_scopes_product_idx
  on public.certificate_scopes (product_id) where product_id is not null;
create unique index if not exists certificate_scopes_certificate_category_key
  on public.certificate_scopes (certificate_id, category_id) where category_id is not null;
create unique index if not exists certificate_scopes_certificate_product_key
  on public.certificate_scopes (certificate_id, product_id) where product_id is not null;
alter table public.certificate_scopes enable row level security;
revoke all on public.certificate_scopes from anon, authenticated;

create table if not exists public.product_certificate_optouts (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid not null references public.suppliers(id) on delete cascade,
  product_id     uuid not null references public.supplier_products(id) on delete cascade,
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  created_at     timestamptz not null default now()
);
create unique index if not exists product_certificate_optouts_key
  on public.product_certificate_optouts (product_id, certificate_id);
create index if not exists product_certificate_optouts_supplier_idx
  on public.product_certificate_optouts (supplier_id);
alter table public.product_certificate_optouts enable row level security;
revoke all on public.product_certificate_optouts from anon, authenticated;

commit;
notify pgrst, 'reload schema';
