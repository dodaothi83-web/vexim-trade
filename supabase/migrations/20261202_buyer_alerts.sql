-- Thư theo hành vi của người mua (sản phẩm đã lưu thay đổi, nhà cung cấp đang theo dõi đăng hàng mới,
-- RFQ 3 ngày chưa có báo giá, ngành bắt đầu mùa thu hoạch). Gộp một thư mỗi ngày.
--
-- Dùng chung nhật ký buyer_digest_sends (kind = 'alerts', week = ngày giờ Việt Nam) để đếm giới hạn
-- chung: tối đa 1 thư/ngày và 4 thư/7 ngày cho mỗi người mua, tính cả thư thứ Ba và thứ Sáu.
-- buyer_saved_snapshots lưu trạng thái sản phẩm đã lưu lần trước để biết điều gì vừa thay đổi.
begin;

alter table public.buyer_digest_sends drop constraint if exists buyer_digest_sends_kind_check;
alter table public.buyer_digest_sends add constraint buyer_digest_sends_kind_check check (kind in ('products', 'brief', 'alerts'));
create index if not exists buyer_digest_sends_buyer_idx on public.buyer_digest_sends (buyer_id, sent_at desc);

alter table public.buyer_digest_clicks_daily drop constraint if exists buyer_digest_clicks_daily_kind_check;
alter table public.buyer_digest_clicks_daily add constraint buyer_digest_clicks_daily_kind_check check (kind in ('products', 'brief', 'alerts'));

create table if not exists public.buyer_saved_snapshots (
  buyer_id    uuid not null references public.buyer_users(id) on delete cascade,
  product_id  text not null check (length(product_id) between 1 and 100),
  snapshot    jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  signature   text not null,
  updated_at  timestamptz not null default now(),
  primary key (buyer_id, product_id)
);
alter table public.buyer_saved_snapshots enable row level security;
revoke all on table public.buyer_saved_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.buyer_saved_snapshots to service_role;

commit;
notify pgrst, 'reload schema';
