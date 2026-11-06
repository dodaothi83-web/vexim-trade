-- Chat giữa người mua và đội Vexim (chủ sàn), thay nút WhatsApp "Chat with us".
--
-- Mỗi người mua (theo email đã xác minh) có đúng một cuộc trò chuyện với Vexim. Nhân viên có
-- quyền support.manage (Quản trị, Kinh doanh) trả lời trong CRM và có thể nhận xử lý cuộc.
-- Chỉ máy chủ (service_role) đọc ghi; trình duyệt đi qua API có kiểm quyền.
begin;

create table if not exists public.support_conversations (
  id                    uuid primary key default gen_random_uuid(),
  buyer_email           text not null,
  -- Nhân viên đang phụ trách cuộc này (null = chưa ai nhận).
  assigned_to           uuid,
  last_message_at       timestamptz,
  last_message_preview  text,
  last_sender           text check (last_sender in ('buyer', 'staff')),
  buyer_last_read_at    timestamptz,
  staff_last_read_at    timestamptz,
  -- Mốc gửi email báo tin mới gần nhất cho từng bên, để không gửi mỗi tin một thư.
  buyer_notified_at     timestamptz,
  staff_notified_at     timestamptz,
  created_at            timestamptz not null default now(),
  check (buyer_email = lower(btrim(buyer_email)) and length(buyer_email) <= 320)
);

create unique index if not exists support_conversations_buyer_key
  on public.support_conversations (buyer_email);
create index if not exists support_conversations_recent_idx
  on public.support_conversations (last_message_at desc);

create table if not exists public.support_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.support_conversations(id) on delete cascade,
  sender           text not null check (sender in ('buyer', 'staff')),
  sender_email     text not null,
  -- Nhân viên trả lời (để biết ai đã nói gì); null với tin của người mua.
  staff_user_id    uuid,
  staff_name       text,
  body             text not null check (length(btrim(body)) between 1 and 4000),
  -- Trang người mua đang xem khi viết tin, giúp nhân viên hiểu ngữ cảnh.
  page_path        text check (page_path is null or length(page_path) <= 300),
  created_at       timestamptz not null default now()
);

create index if not exists support_messages_conversation_idx
  on public.support_messages (conversation_id, created_at);

alter table public.support_conversations enable row level security;
revoke all on table public.support_conversations from public, anon, authenticated;
grant select, insert, update, delete on table public.support_conversations to service_role;

alter table public.support_messages enable row level security;
revoke all on table public.support_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.support_messages to service_role;

commit;
notify pgrst, 'reload schema';
