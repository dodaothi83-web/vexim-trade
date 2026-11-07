-- L2 xác minh nhà máy qua cuộc gọi video / thực địa do trưởng kiểm duyệt thực hiện.
--
-- Thay luồng "nhà cung cấp tự chụp 9 ảnh + tờ mã" bằng:
--   1. Nhà cung cấp ĐẶT LỊCH trên cổng (hồ sơ L2 trong supplier_submissions).
--   2. Trưởng kiểm duyệt/admin xác nhận lịch → tạo đợt kiểm L2.
--   3. Người đó gọi video (hoặc đi thực địa), ghi checklist 12 mục, chụp màn hình,
--      chọn ít nhất 2 ảnh công khai, xác nhận rồi duyệt.
--
-- Migration chỉ THÊM cột và thay điều kiện; không xoá bảng/cột/bản ghi cũ.
-- Dữ liệu ảnh/mã của luồng cũ vẫn giữ nguyên để đối soát.
begin;

-- 1. Thông tin đặt lịch trên hồ sơ L2 của nhà cung cấp.
alter table public.supplier_submissions
  add column if not exists booking_method text,
  add column if not exists booking_slots jsonb not null default '[]'::jsonb,
  add column if not exists booking_contact_name text,
  add column if not exists booking_contact_role text,
  add column if not exists booking_contact_phone text,
  add column if not exists booking_factory_address text,
  add column if not exists booking_consent_at timestamptz,
  add column if not exists booking_scheduled_at timestamptz;

alter table public.supplier_submissions drop constraint if exists supplier_submissions_booking_method_ck;
alter table public.supplier_submissions add constraint supplier_submissions_booking_method_ck
  check (booking_method is null or booking_method in ('video_call', 'on_site'));
alter table public.supplier_submissions drop constraint if exists supplier_submissions_booking_slots_ck;
alter table public.supplier_submissions add constraint supplier_submissions_booking_slots_ck
  check (jsonb_typeof(booking_slots) = 'array' and jsonb_array_length(booking_slots) <= 3);

comment on column public.supplier_submissions.booking_consent_at is
  'Nhà cung cấp đồng ý cho Vexim chụp màn hình trong cuộc gọi và công khai bản tóm tắt kèm ảnh đã chọn.';

-- 2. Kết quả cuộc gọi trên đợt kiểm L2.
alter table public.verifications
  add column if not exists review_method text,
  add column if not exists call_started_at timestamptz,
  add column if not exists call_ended_at timestamptz,
  add column if not exists inspector_name text,
  add column if not exists supplier_participants text,
  add column if not exists observed_scale text,
  add column if not exists report_code text,
  add column if not exists public_photo_ids jsonb not null default '[]'::jsonb,
  add column if not exists public_photos_confirmed_at timestamptz;

alter table public.verifications drop constraint if exists verifications_review_method_ck;
alter table public.verifications add constraint verifications_review_method_ck
  check (review_method is null or (target_level = 2 and review_method in ('video_call', 'on_site')));
alter table public.verifications drop constraint if exists verifications_public_photo_ids_ck;
alter table public.verifications add constraint verifications_public_photo_ids_ck
  check (jsonb_typeof(public_photo_ids) = 'array' and jsonb_array_length(public_photo_ids) <= 6);
create unique index if not exists verifications_report_code_key
  on public.verifications (report_code) where report_code is not null;

comment on column public.verifications.inspector_name is
  'Họ tên người kiểm, chụp lại từ hồ sơ nhân sự tại thời điểm duyệt; không đổi theo hồ sơ sau này.';
comment on column public.verifications.public_photo_ids is
  'ID ảnh (media_assets của đúng đợt kiểm) được người kiểm chọn đưa vào báo cáo người mua tải về.';

-- 3. Mục bằng chứng mới của checklist cuộc gọi (các mục khác dùng lại key cũ).
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
    'participant_identity', 'location_match', 'live_random_request',
    'partner_factory_contract', 'partner_factory_photos',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'
  ))
);

-- 4. Hồ sơ L2 nhà máy chuyển sang chờ xử lý khi ĐỦ THÔNG TIN ĐẶT LỊCH,
--    không còn đòi 9 ảnh và tờ mã. Hợp đồng của nhà máy đối tác vẫn do
--    guard_l3_pending_evidence kiểm như trước.
create or replace function public.guard_l2_factory_pending_evidence()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.target_level = 2 and new.status = 'pending_review' and old.status <> 'pending_review' then
    if new.booking_method is null
      or nullif(btrim(coalesce(new.booking_contact_name, '')), '') is null
      or nullif(btrim(coalesce(new.booking_contact_phone, '')), '') is null
      or nullif(btrim(coalesce(new.booking_factory_address, '')), '') is null
      or jsonb_array_length(coalesce(new.booking_slots, '[]'::jsonb)) < 1
      or new.booking_consent_at is null then
      raise exception using errcode = 'P0001', message = 'L2_BOOKING_INCOMPLETE';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_l2_factory_pending_evidence() from public;
drop trigger if exists guard_l2_factory_pending_evidence on public.supplier_submissions;
create trigger guard_l2_factory_pending_evidence before update of status on public.supplier_submissions
  for each row execute function public.guard_l2_factory_pending_evidence();

-- 5. Đợt kiểm L2 mới phải ghi phương thức; duyệt phải đủ dữ liệu cuộc gọi.
create or replace function public.guard_l2_call_review()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare photo_count int;
begin
  if new.target_level <> 2 then return new; end if;
  -- Chỉ chặn đợt kiểm MỚI mở; bản ghi lịch sử/seed đã có trạng thái khác không bị ảnh hưởng.
  if tg_op = 'INSERT' and new.status in ('scheduled', 'in_progress') and new.review_method is null then
    raise exception using errcode = 'P0001', message = 'L2_REVIEW_METHOD_REQUIRED';
  end if;
  if tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' and new.review_method is not null then
    if nullif(btrim(coalesce(new.inspector_name, '')), '') is null or new.call_started_at is null
      or nullif(btrim(coalesce(new.report_code, '')), '') is null then
      raise exception using errcode = 'P0001', message = 'L2_CALL_DETAILS_REQUIRED';
    end if;
    if new.public_photos_confirmed_at is null then
      raise exception using errcode = 'P0001', message = 'L2_PUBLIC_PHOTOS_CONFIRM_REQUIRED';
    end if;
    select count(*) into photo_count from public.media_assets m
    where m.owner_type = 'verification' and m.verification_id = new.id and m.supplier_id = new.supplier_id
      and m.kind = 'image' and nullif(btrim(m.storage_path), '') is not null
      and m.id::text in (select jsonb_array_elements_text(new.public_photo_ids));
    if photo_count < 2 then
      raise exception using errcode = 'P0001', message = 'L2_PUBLIC_PHOTOS_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_l2_call_review() from public;
drop trigger if exists guard_l2_call_review on public.verifications;
create trigger guard_l2_call_review before insert or update of status on public.verifications
  for each row execute function public.guard_l2_call_review();

-- Sau khi duyệt, dữ liệu cuộc gọi và ảnh công khai không sửa được nữa.
create or replace function public.guard_l2_call_review_locked()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = 'approved' and (
    new.review_method is distinct from old.review_method or
    new.call_started_at is distinct from old.call_started_at or
    new.call_ended_at is distinct from old.call_ended_at or
    new.inspector_name is distinct from old.inspector_name or
    new.supplier_participants is distinct from old.supplier_participants or
    new.observed_scale is distinct from old.observed_scale or
    new.report_code is distinct from old.report_code or
    new.public_photo_ids is distinct from old.public_photo_ids or
    new.public_photos_confirmed_at is distinct from old.public_photos_confirmed_at or
    new.checklist is distinct from old.checklist) then
    raise exception using errcode = 'P0001', message = 'L2_CALL_REVIEW_LOCKED';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_l2_call_review_locked() from public;
drop trigger if exists guard_l2_call_review_locked on public.verifications;
create trigger guard_l2_call_review_locked before update on public.verifications
  for each row execute function public.guard_l2_call_review_locked();

commit;
notify pgrst, 'reload schema';
