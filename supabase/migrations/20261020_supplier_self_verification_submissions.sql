-- Cổng NHÀ CUNG CẤP TỰ GỬI bằng chứng xác thực:
--   L2: 9 ảnh nhà máy (định vị, ban ngày, ảnh gốc, mã xác minh viết tay cho ảnh 🔖)
--   L3: chứng từ lịch sử xuất khẩu + link nguồn công khai
--
-- Chạy trong SQL Editor của ĐÚNG Supabase project, TRƯỚC khi deploy code mới.
-- Migration idempotent: chạy lại không phá dữ liệu. KHÔNG tự duyệt hồ sơ nào:
-- huy hiệu L2/L3 vẫn chỉ đến từ một đợt kiểm `verifications` do nhân viên Vexim
-- lập và được người CÓ QUYỀN DUYỆT KHÁC phê (constraint bốn mắt sẵn có).
begin;

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
-- 4. Bằng chứng của hồ sơ tự gửi lưu trong media_assets (owner_type='verification',
--    audience='internal', verification_id = id hồ sơ tự gửi) nên cần mở rộng
--    CHECK checklist_key cho 9 ảnh L2 và 6 chứng từ L3. Tệp cũ không bị sửa.
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

commit;
notify pgrst, 'reload schema';

-- Kiểm tra nhanh sau khi chạy:
-- select table_name from information_schema.tables where table_schema='public'
--   and table_name in ('supplier_submissions','supplier_submission_items','supplier_submission_links');
-- Mong đợi 3 dòng.
