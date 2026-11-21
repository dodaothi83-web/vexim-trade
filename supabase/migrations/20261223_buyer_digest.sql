-- Thư giới thiệu hằng tuần cho người mua (đợt 2, chủ sàn chốt 2026-11-21). Hệ thống tự tổng hợp từ
-- nội dung đã duyệt trên sàn (sản phẩm đang hiện, bài blog đã đăng, lịch mùa vụ) và tự gửi; nhân viên
-- chỉ làm nội dung. Không lưu ai mở thư; lượt bấm chỉ đếm tổng theo mục (cho báo cáo nhà cung cấp).
begin;

-- Bài blog gắn ngành hàng liên quan (mã ngành) để thư Market Brief chọn đúng người mua.
alter table public.posts add column if not exists related_categories text[] not null default '{}';
comment on column public.posts.related_categories is 'Mã ngành hàng (categories.id) bài viết liên quan, dùng cho thư Market Brief.';

-- Nhật ký thư đã gửi cho từng người mua: tránh lặp lại mục trong 4 tuần và không gửi trùng tuần.
create table if not exists public.buyer_digest_sends (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyer_users(id) on delete cascade,
  kind text not null check (kind in ('products', 'brief')),
  -- Tuần ISO, ví dụ 2026-W50.
  week text not null,
  items jsonb not null default '[]'::jsonb,
  sent_at timestamptz not null default now(),
  unique (buyer_id, kind, week)
);
create index if not exists buyer_digest_sends_sent_idx on public.buyer_digest_sends (sent_at desc);
alter table public.buyer_digest_sends enable row level security;

-- Lượt bấm trong thư, chỉ số tổng theo ngày và mục (không có mã người mua).
create table if not exists public.buyer_digest_clicks_daily (
  day date not null,
  kind text not null check (kind in ('products', 'brief')),
  item_type text not null check (item_type in ('product', 'supplier', 'post', 'category', 'rfq')),
  item_id text not null,
  supplier_id uuid,
  clicks bigint not null default 0 check (clicks >= 0),
  primary key (day, kind, item_type, item_id)
);
alter table public.buyer_digest_clicks_daily enable row level security;

create or replace function public.record_buyer_digest_click(p_kind text, p_item_type text, p_item_id text, p_supplier_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into public.buyer_digest_clicks_daily (day, kind, item_type, item_id, supplier_id, clicks)
    values ((now() at time zone 'UTC')::date, p_kind, p_item_type, p_item_id, p_supplier_id, 1)
  on conflict (day, kind, item_type, item_id) do update set clicks = public.buyer_digest_clicks_daily.clicks + 1;
end;
$$;
revoke all on function public.record_buyer_digest_click(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_buyer_digest_click(text, text, text, uuid) to service_role;

-- Công tắc tạm dừng khẩn cấp (một dòng).
create table if not exists public.buyer_digest_settings (
  id boolean primary key default true check (id),
  paused boolean not null default false,
  paused_by text,
  updated_at timestamptz not null default now()
);
insert into public.buyer_digest_settings (id) values (true) on conflict (id) do nothing;
alter table public.buyer_digest_settings enable row level security;
-- Không có policy: chỉ máy chủ (service role) đọc ghi.

commit;
notify pgrst, 'reload schema';
