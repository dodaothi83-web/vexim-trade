-- Email báo tin nhắn: gửi chậm, gộp, nhắc tối đa một lần.
--
-- Email đầu gửi khi tin chưa đọc sau 10 phút và người nhận không online. Nếu vẫn chưa đọc
-- sau 24 giờ thì nhắc đúng một lần (mốc *_reminded_at), rồi dừng tới khi người nhận đọc.
-- Thiếu cột này thì email đầu vẫn gửi, chỉ không có lần nhắc.
begin;

alter table public.chat_conversations add column if not exists buyer_reminded_at timestamptz;
alter table public.chat_conversations add column if not exists supplier_reminded_at timestamptz;
alter table public.support_conversations add column if not exists buyer_reminded_at timestamptz;
alter table public.support_conversations add column if not exists staff_reminded_at timestamptz;

commit;
notify pgrst, 'reload schema';
