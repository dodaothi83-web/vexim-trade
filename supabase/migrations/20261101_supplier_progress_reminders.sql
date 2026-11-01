-- 20261101 — Thư nhắc nhà cung cấp hoàn thiện hồ sơ xác minh.
--
-- Thêm `supplier_reminder` vào danh sách kind của `email_messages` để mỗi lần nhắc
-- được ghi nhật ký và chống gửi trùng (14 ngày, tối đa 6 thư/nhà cung cấp).
-- Không thêm bảng/cột mới. Chạy trên đúng project Supabase TRƯỚC khi deploy mã
-- `/api/cron/supplier-reminders`; nếu chưa chạy, lệnh ghi nhật ký sẽ lỗi CHECK và
-- cron báo failed (không gửi sai người, nhưng cũng không chống trùng được).
--
-- Xem docs/email-lifecycle-plan.md.
--
-- Kiểm tra sau khi chạy:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'email_messages_kind_check';
--   -- Mong đợi có 'supplier_reminder' trong danh sách.

alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check
  check (kind in (
    'auto',
    'manual',
    'inbound',
    'rfq_outreach',
    'rfq_followup',
    'shortlist_buyer',
    'buyer_status_update',
    'supplier_reminder'
  ));
