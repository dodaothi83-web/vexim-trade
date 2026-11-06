-- Chat trực tiếp giữa người mua và nhà cung cấp (thay luồng email của "Ask supplier").
--
-- Một cuộc trò chuyện = một người mua (theo email đã xác minh) + một nhà cung cấp, gắn với
-- sản phẩm người mua bấm hỏi. Hỏi lại cùng nhà cung cấp thì mở lại đúng cuộc cũ, nên lịch sử
-- liền mạch. Chỉ máy chủ (service_role) đọc ghi; trình duyệt đi qua API có kiểm quyền.
begin;

create table if not exists public.chat_conversations (
  id                     uuid primary key default gen_random_uuid(),
  buyer_email            text not null,
  supplier_id            uuid not null references public.suppliers(id) on delete cascade,
  -- Sản phẩm mở đầu cuộc trò chuyện; giữ lại cả khi sản phẩm bị gỡ để đọc lịch sử.
  product_id             uuid references public.supplier_products(id) on delete set null,
  product_name           text,
  last_message_at        timestamptz,
  last_message_preview   text,
  last_sender            text check (last_sender in ('buyer', 'supplier')),
  buyer_last_read_at     timestamptz,
  supplier_last_read_at  timestamptz,
  -- Mốc gửi email báo tin mới gần nhất cho từng bên, để không gửi mỗi tin một thư.
  buyer_notified_at      timestamptz,
  supplier_notified_at   timestamptz,
  created_at             timestamptz not null default now(),
  check (buyer_email = lower(btrim(buyer_email)) and length(buyer_email) <= 320)
);

create unique index if not exists chat_conversations_pair_key
  on public.chat_conversations (buyer_email, supplier_id);
create index if not exists chat_conversations_supplier_idx
  on public.chat_conversations (supplier_id, last_message_at desc);
create index if not exists chat_conversations_buyer_idx
  on public.chat_conversations (buyer_email, last_message_at desc);

create table if not exists public.chat_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.chat_conversations(id) on delete cascade,
  sender           text not null check (sender in ('buyer', 'supplier')),
  sender_email     text not null,
  body             text not null check (length(btrim(body)) between 1 and 4000),
  -- Sản phẩm đang được hỏi ở tin này (khi người mua hỏi tiếp về sản phẩm khác).
  product_id       uuid references public.supplier_products(id) on delete set null,
  product_name     text,
  created_at       timestamptz not null default now()
);

create index if not exists chat_messages_conversation_idx
  on public.chat_messages (conversation_id, created_at);

alter table public.chat_conversations enable row level security;
revoke all on table public.chat_conversations from public, anon, authenticated;
grant select, insert, update, delete on table public.chat_conversations to service_role;

alter table public.chat_messages enable row level security;
revoke all on table public.chat_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.chat_messages to service_role;

commit;
notify pgrst, 'reload schema';
