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
