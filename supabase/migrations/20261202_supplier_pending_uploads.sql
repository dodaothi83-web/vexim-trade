-- Tệp A+ (ảnh) và video tải lên khi sản phẩm mới chưa được lưu lần đầu. Khi lưu sản phẩm, tệp
-- được gắn vào sản phẩm và dòng ở đây bị xoá; tệp bị bỏ ngang quá 24 giờ thì tác vụ định kỳ
-- (/api/cron/pending-media, gọi gộp trong /api/cron/rfq-sla) xoá tệp và dòng.
create table if not exists public.supplier_pending_uploads (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  -- Ảnh: đường dẫn aplus/<supplier>/pending/<uuid>.<ext>; video: mã Cloudflare Stream.
  ref text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists supplier_pending_uploads_created_idx on public.supplier_pending_uploads (created_at);
create index if not exists supplier_pending_uploads_supplier_idx on public.supplier_pending_uploads (supplier_id, created_at);
alter table public.supplier_pending_uploads enable row level security;
-- Không có policy: chỉ máy chủ (service role) đọc ghi.
comment on table public.supplier_pending_uploads is 'Ảnh A+ và video tải lên trước khi sản phẩm mới được lưu; dọn sau 24 giờ nếu không được gắn.';
