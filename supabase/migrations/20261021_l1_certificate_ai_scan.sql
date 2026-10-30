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
begin;

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

commit;
