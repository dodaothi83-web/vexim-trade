-- Chat người mua ↔ nhà cung cấp: chuyển cho Vexim khi nhà cung cấp không trả lời.
--
-- Người mua nhắn mà sau 48 giờ nhà cung cấp chưa trả lời: hệ thống ghi mốc
-- unanswered_escalated_at, báo cho người mua và đưa việc vào "Việc cần làm" của CRM.
-- Nhân viên liên hệ nhà cung cấp xong thì ghi unanswered_handled_at/by.
-- Thiếu các cột này thì chat và email báo tin vẫn chạy như cũ, chỉ không có bước chuyển.
begin;

alter table public.chat_conversations add column if not exists unanswered_escalated_at timestamptz;
alter table public.chat_conversations add column if not exists unanswered_handled_at timestamptz;
alter table public.chat_conversations add column if not exists unanswered_handled_by text;

commit;
notify pgrst, 'reload schema';
