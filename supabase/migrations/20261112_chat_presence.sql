-- Trạng thái online/offline cho chat (người mua, nhà cung cấp, đội Vexim).
--
-- Mỗi dòng là lần cuối một bên còn mở Vexim: trang công khai của người mua, cổng nhà cung cấp
-- hoặc hộp chat trong CRM. Khoá: "buyer:<email>", "supplier:<id>", "staff:vexim". Thiếu bảng
-- này thì chat vẫn chạy, chỉ không hiện trạng thái online.
begin;

create table if not exists public.chat_presence (
  key           text primary key check (length(key) between 3 and 400),
  last_seen_at  timestamptz not null default now()
);

alter table public.chat_presence enable row level security;
revoke all on table public.chat_presence from public, anon, authenticated;
grant select, insert, update, delete on table public.chat_presence to service_role;

commit;
notify pgrst, 'reload schema';
