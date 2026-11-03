-- Tài khoản người mua + thư đăng nhập bằng magic link.
--
-- Người mua KHÔNG nằm trong `app_users` (bảng nhân viên: có role và quyền nội bộ) và
-- KHÔNG nằm trong `buyers` (hồ sơ kinh doanh do nhân viên đọc và chăm sóc). Tách ba nơi
-- là điều kiện để không phải thêm nhánh người mua vào đúng chỗ phân quyền nhạy cảm nhất.
--
-- Liên kết giữa tài khoản và yêu cầu báo giá là EMAIL, không phải khoá ngoại:
-- `buyers.email` đã được lưu ở dạng chữ thường khi tạo yêu cầu, nên một email xác minh
-- là thấy đủ mọi yêu cầu cũ mà không có bước "claim" nào phải chạy.
begin;

create table if not exists public.buyer_users (
  id               uuid primary key default gen_random_uuid(),
  -- Luôn chữ thường: đây là khoá nhận diện duy nhất của người mua.
  email            text not null,
  company_name     text,
  -- null = chưa bấm link hoặc nhập mã trong thư; chỉ có mốc này mới mở được phiên.
  verified_at      timestamptz,
  -- Mặc định TẮT: chỉ nhận thư giới thiệu nguồn hàng khi tự bật.
  marketing_opt_in boolean not null default false,
  -- Danh sách đã lưu (yêu thích + bộ so sánh) là ảnh chụp để hiển thị, không cần
  -- truy vấn theo từng món, nên giữ một cột thay vì một bảng.
  saved            jsonb not null default '{"products":[],"comparisons":[]}'::jsonb,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz,
  check (email = lower(btrim(email)) and length(email) <= 320),
  check (jsonb_typeof(saved) = 'object')
);

create unique index if not exists buyer_users_email_key on public.buyer_users (email);
create index if not exists buyer_users_created_idx on public.buyer_users (created_at desc);

-- Một lần phát thư đăng nhập: link và mã 6 số nằm CÙNG một dòng để cùng hết hạn và
-- cùng bị tiêu một lần. Chỉ lưu băm — đọc được bảng này cũng không đăng nhập được.
create table if not exists public.buyer_sign_in_tokens (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  link_hash    text not null,
  code_hash    text not null,
  -- Số lần nhập mã sai; chạm trần thì token chết, phải xin thư mới.
  attempts     integer not null default 0 check (attempts >= 0),
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now(),
  check (email = lower(btrim(email)) and length(email) <= 320)
);

create index if not exists buyer_sign_in_tokens_email_idx
  on public.buyer_sign_in_tokens (email, created_at desc);
-- Tra cứu token còn sống là truy vấn nóng nhất của luồng đăng nhập.
create index if not exists buyer_sign_in_tokens_live_idx
  on public.buyer_sign_in_tokens (email) where consumed_at is null;

alter table public.buyer_users enable row level security;
revoke all on table public.buyer_users from public, anon, authenticated;
grant select, insert, update, delete on table public.buyer_users to service_role;

alter table public.buyer_sign_in_tokens enable row level security;
revoke all on table public.buyer_sign_in_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.buyer_sign_in_tokens to service_role;

-- `buyers.email` được tra theo email khi người mua mở /my; không cần unique (dữ liệu cũ
-- có thể trùng), nhưng cần index để không quét cả bảng người mua.
create index if not exists buyers_email_lower_idx on public.buyers (lower(email));

commit;
notify pgrst, 'reload schema';
