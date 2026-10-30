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
begin;

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

commit;
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
