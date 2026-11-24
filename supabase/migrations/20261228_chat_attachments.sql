-- Tệp đính kèm trong chat người mua ↔ nhà cung cấp (chủ dự án duyệt 24/11/2026).
--
-- Tệp nằm ở bucket R2 riêng tư (khoá `chat/<bên tải lên>/<sha256>.<đuôi>`); bảng này giữ thông
-- tin tệp và quyền xem (theo cuộc trò chuyện). Trình duyệt tải thẳng lên R2 bằng link có chữ ký
-- do máy chủ cấp sau khi kiểm quyền, nên tệp không đi qua máy chủ Vercel.
--
-- Quy tắc:
--  - PDF, ảnh, .xlsx, .docx, .csv; tối đa 10 MB mỗi tệp, 5 tệp mỗi tin.
--  - Cùng một bên gửi lại tệp giống hệt (cùng sha256 + dung lượng) thì dùng lại tệp đã lưu.
--  - Tệp hết hạn 6 tháng sau khi gửi; tệp tải lên mà không gửi bị dọn sau 24 giờ. Việc dọn chạy
--    trong cron /api/cron/chat-notify; tệp trên kho chỉ bị xoá khi không còn dòng nào dùng.
--  - Tin chỉ có tệp thì phần chữ để trống, nên bỏ điều kiện "ít nhất 1 ký tự" của chat_messages.body.
begin;

create table if not exists public.chat_attachments (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.chat_conversations(id) on delete cascade,
  -- null khi đã tải lên nhưng chưa gửi kèm tin nào.
  message_id       uuid references public.chat_messages(id) on delete cascade,
  uploader         text not null check (uploader in ('buyer', 'supplier')),
  -- 'supplier:<id>' hoặc 'buyer:<email>': tính hạn mức và gộp tệp trùng theo bên tải lên.
  uploader_key     text not null check (length(uploader_key) between 3 and 340),
  file_name        text not null check (length(btrim(file_name)) between 1 and 120),
  content_type     text not null check (content_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes       integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key      text not null check (storage_key like 'chat/%'),
  status           text not null default 'pending' check (status in ('pending', 'ready', 'deleted')),
  created_at       timestamptz not null default now(),
  uploaded_at      timestamptz,
  expires_at       timestamptz,
  deleted_at       timestamptz
);

create index if not exists chat_attachments_message_idx on public.chat_attachments (message_id) where message_id is not null;
create index if not exists chat_attachments_dedupe_idx on public.chat_attachments (uploader_key, sha256) where status = 'ready';
create index if not exists chat_attachments_uploader_idx on public.chat_attachments (uploader_key, created_at);
create index if not exists chat_attachments_storage_idx on public.chat_attachments (storage_key) where status <> 'deleted';
create index if not exists chat_attachments_unsent_idx on public.chat_attachments (created_at) where message_id is null and status <> 'deleted';
create index if not exists chat_attachments_expiry_idx on public.chat_attachments (expires_at) where status = 'ready' and message_id is not null;

alter table public.chat_attachments enable row level security;
revoke all on table public.chat_attachments from public, anon, authenticated;
grant select, insert, update, delete on table public.chat_attachments to service_role;

-- Tin chỉ có tệp: phần chữ được để trống (ứng dụng vẫn bắt buộc có chữ hoặc có tệp).
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages add constraint chat_messages_body_check check (length(body) <= 4000);

commit;
notify pgrst, 'reload schema';
