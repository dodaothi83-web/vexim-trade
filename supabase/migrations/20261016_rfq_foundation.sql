-- ============================================================================
--  VEXIM TRADE – RFQ FOUNDATION (GĐ 0)
--  Chạy trong Supabase SQL Editor sau khi đã áp dụng supabase/schema.sql.
--
--  Thêm:
--    - categories (2 cấp, i18n-ready)
--    - supplier_categories (N-N)
--    - cột mới cho suppliers + mở rộng status
--    - cột mới cho supplier_products
--    - certificates
--    - verifications (khung, UI/quy trình kích hoạt sau)
--    - rfqs + rfq_attachments + rfq_matches (chờ luồng công khai ở GĐ 2)
--    - introductions (bảo vệ không vượt mặt)
--    - audit_log
--    - bổ sung cột buyers (consent_at, business_type, is_blocked, email_domain)
--    - view whitelist công khai + index + bucket rfq-attachments
--
--  Tuân thủ quy tắc: mọi thay đổi thiết kế phá hoại (xoá cột, đổi kiểu) đều được
--  làm mềm (thêm cột mới, giữ cột cũ) để code cũ tiếp tục chạy trong quá trình
--  di chuyển; code mới sẽ ưu tiên đọc cột mới.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 0. TYPES
-- ---------------------------------------------------------------------------

-- Không dùng CREATE TYPE ... AS ENUM để tránh migrate ràng buộc khi cần thêm giá
-- trị mới; dùng CHECK constraint như các bảng hiện có.

-- ---------------------------------------------------------------------------
-- 1. SUPPLIERS – mở rộng
-- ---------------------------------------------------------------------------

-- Giữ cột role cũ cho code cũ tiếp tục chạy (manufacturer/trader/agent/exporter)
-- trong khi xây dựng GĐ. Khi code mới đã dùng cột type thì hãy thêm migration
-- xoá cột role sau.
alter table public.suppliers
  add column if not exists slug text,
  add column if not exists display_name text,
  -- type mới: manufacturer/trading/cooperative (đồng bộ với vai trò ở mục 4 đặc tả)
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

-- Mở rộng status enum cũ (new/verifying/verified/paused) → thêm draft/submitted/in_verification/published/suspended/archived.
alter table public.suppliers drop constraint if exists suppliers_status_check;
alter table public.suppliers add constraint suppliers_status_check
  check (status in
    ('new','verifying','verified','paused',
     'draft','submitted','in_verification','published','suspended','archived'));

-- Di chuyển dữ liệu cũ sang trạng thái mới:
--   'new'       -> 'draft'       (chưa nhập đủ hồ sơ)
--   'verifying' -> 'in_verification' (đang kiểm tra)
--   'verified'  -> 'published'   (đã kiểm tra, công khai)
--   'paused'    -> 'suspended'   (ngừng hiện công khai)
update public.suppliers set status = 'draft' where status = 'new';
update public.suppliers set status = 'in_verification' where status = 'verifying';
update public.suppliers set status = 'published' where status = 'verified';
update public.suppliers set status = 'suspended' where status = 'paused';

-- Migrate giá trị cột role cũ sang supplier_type:
--   manufacturer -> manufacturer; trader/exporter/agent -> trading
update public.suppliers set supplier_type = 'manufacturer'
  where supplier_type is null and role = 'manufacturer';
update public.suppliers set supplier_type = 'trading'
  where supplier_type is null and role in ('trader','agent','exporter');

-- Đồng bộ private_label từ oem (nếu oem=true thì private_label=true; lúc MVP coi OEM và private-label là một)
update public.suppliers set private_label = true
  where private_label = false and id in (
    select sp.supplier_id from public.supplier_products sp where sp.oem = true
  );

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
create index if not exists supplier_products_slug_idx
  on public.supplier_products (supplier_id, slug);

-- ---------------------------------------------------------------------------
-- 2. CATEGORIES (2 cấp: danh mục ngành / sản phẩm con)
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

create unique index if not exists categories_slug_key on public.categories (slug);
create index if not exists categories_parent_idx on public.categories (parent_id) where parent_id is not null;
create index if not exists categories_published_idx on public.categories (is_published, sort_order);

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
-- 3. CERTIFICATES (tách từ media_assets)
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
create index if not exists certificates_valid_until_idx on public.certificates (valid_until);

drop trigger if exists certificates_touch on public.certificates;
create trigger certificates_touch before update on public.certificates
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. VERIFICATIONS (khung bảng, UI & quy trình chi tiết kích hoạt sau)
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
  -- Ràng buộc 4-eyes: người duyệt không được là người kiểm tra (chỉ ép khi đủ 2 người)
  constraint verifications_four_eyes check (
    approved_by is null or inspector_id is null or approved_by <> inspector_id
  )
);

create index if not exists verifications_supplier_idx on public.verifications (supplier_id, created_at desc);
create index if not exists verifications_status_idx on public.verifications (status);

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

-- Tự điền email_domain từ email cho các bản ghi cũ
update public.buyers
set email_domain = split_part(lower(email), '@', 2)
where email is not null and email_domain is null and position('@' in email) > 0;

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
  frequency             text, -- one_time / monthly / quarterly ...
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
                          ('new','qualified','matching','quoting','sampling',
                           'won','lost','spam','closed')),
  assigned_to           uuid references public.app_users(id) on delete set null,
  first_response_at     timestamptz,
  closed_reason         text,
  access_token          text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists rfqs_code_key on public.rfqs (code);
create unique index if not exists rfqs_access_token_key on public.rfqs (access_token);
create index if not exists rfqs_status_idx on public.rfqs (status, created_at desc);
create index if not exists rfqs_assigned_idx on public.rfqs (assigned_to, created_at desc);
create index if not exists rfqs_buyer_idx on public.rfqs (buyer_id, created_at desc);
create index if not exists rfqs_category_idx on public.rfqs (category_id) where category_id is not null;
create index if not exists rfqs_created_idx on public.rfqs (created_at desc);

drop trigger if exists rfqs_touch on public.rfqs;
create trigger rfqs_touch before update on public.rfqs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6b. RFQ_ATTACHMENTS (file buyer đính kèm trong form RFQ công khai)
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

-- Bucket private cho file RFQ
insert into storage.buckets (id, name, public, file_size_limit)
values ('rfq-attachments', 'rfq-attachments', false, 10 * 1024 * 1024)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6c. RFQ_MATCHES (mỗi dòng = một seller được ghép vào một RFQ)
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

drop trigger if exists rfq_matches_touch on public.rfq_matches;
create trigger rfq_matches_touch before update on public.rfq_matches
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. INTRODUCTIONS (cơ sở đòi hoa hồng, không vượt mặt)
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
-- 8. AUDIT_LOG (thay đổi nhạy cảm bắt buộc ghi)
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
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- 9. PUBLIC VIEWS (whitelist – chỉ trả các field được phép công khai, chỉ supplier published)
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
  case
    when s.fob_publicly_visible and s.fob_updated_at is not null
         and s.fob_updated_at > now() - interval '180 days'
      then s.fob_min
  end                                                   as fob_min,
  case
    when s.fob_publicly_visible and s.fob_updated_at is not null
         and s.fob_updated_at > now() - interval '180 days'
      then s.fob_max
  end                                                   as fob_max,
  case
    when s.fob_publicly_visible and s.fob_updated_at is not null
         and s.fob_updated_at > now() - interval '180 days'
      then s.fob_unit
  end                                                   as fob_unit,
  case
    when s.fob_publicly_visible and s.fob_updated_at is not null
         and s.fob_updated_at > now() - interval '180 days'
      then s.fob_currency
  end                                                   as fob_currency,
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
  case
    when exists (
      select 1 from public.suppliers s
      where s.id = sp.supplier_id
        and s.status = 'published'
        and s.fob_publicly_visible
        and s.fob_updated_at is not null
        and s.fob_updated_at > now() - interval '180 days'
    )
      then sp.ref_price
  end                                                   as ref_price,
  case
    when exists (
      select 1 from public.suppliers s
      where s.id = sp.supplier_id
        and s.status = 'published'
        and s.fob_publicly_visible
        and s.fob_updated_at is not null
        and s.fob_updated_at > now() - interval '180 days'
    )
      then sp.currency
  end                                                   as currency,
  sp.updated_at
from public.supplier_products sp
join public.suppliers s on s.id = sp.supplier_id
where s.status = 'published';

-- Grants: anonymous chỉ đọc được views whitelist
-- (Sẽ bật khi RLS cho bảng công khai được kích hoạt ở GĐ 2; ở GĐ 1 trang
-- công khai đọc bằng service role từ server components nên không cần mở cho anon)

-- ---------------------------------------------------------------------------
-- 10. SEED – Cashew category đầu tiên
-- ---------------------------------------------------------------------------

insert into public.categories (slug, parent_id, name_i18n, intro_i18n, faq_i18n, seo_title_i18n, seo_desc_i18n, is_published, sort_order)
values (
  'cashew',
  null,
  '{"en": "Cashew"}'::jsonb,
  '{"en": "Verified Vietnamese cashew kernel suppliers, graded WW320, WW240, W180, LP, SP. Factory-audited by Vexim Trade."}'::jsonb,
  '[]'::jsonb,
  '{"en": "Cashew Suppliers in Vietnam – Verified Manufacturers | Vexim Trade"}'::jsonb,
  '{"en": "Compare verified Vietnamese cashew kernel suppliers by grade, MOQ, certification and lead time. Send a shortlist RFQ and receive quotes within 5 working days."}'::jsonb,
  true,
  10
)
on conflict (slug) do update set
  name_i18n = excluded.name_i18n,
  intro_i18n = excluded.intro_i18n,
  seo_title_i18n = excluded.seo_title_i18n,
  seo_desc_i18n = excluded.seo_desc_i18n,
  is_published = excluded.is_published,
  sort_order = excluded.sort_order;

-- TODO: sub-categories (ww320, ww240, w180, lp, sp...) sẽ được thêm khi spec ngành chốt.
