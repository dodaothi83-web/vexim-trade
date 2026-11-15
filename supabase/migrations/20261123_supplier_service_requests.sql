-- Yêu cầu tư vấn dịch vụ Vexim gửi từ cổng nhà cung cấp (mục "Dịch vụ Vexim").
--
-- Trang công khai /for-suppliers vẫn gửi qua email như cũ. Trong cổng, nhà cung cấp đã
-- đăng nhập nên yêu cầu gắn thẳng với hồ sơ, có trạng thái để họ theo dõi ("Yêu cầu của
-- tôi") và để nhân viên cập nhật trong CRM. Đây chỉ là yêu cầu tư vấn: không có giá,
-- không có thanh toán.
--
-- Mỗi nhà cung cấp chỉ có một yêu cầu đang mở cho mỗi dịch vụ, tránh gửi trùng.
-- Chỉ máy chủ (service_role) đọc ghi; trình duyệt đi qua server action có kiểm quyền.
begin;

create table if not exists public.supplier_service_requests (
  id               uuid primary key default gen_random_uuid(),
  supplier_id      uuid not null references public.suppliers(id) on delete cascade,
  service_key      text not null check (service_key in ('international_website', 'featured_ads', 'fda_compliance')),
  note             text check (note is null or length(note) <= 1200),
  status           text not null default 'submitted'
                   check (status in ('submitted', 'in_consultation', 'quoted', 'closed')),
  -- Mã in trong email và hiện cho nhà cung cấp, ví dụ DV-261115-4F7K.
  reference        text not null check (length(reference) between 4 and 40),
  requested_by     uuid,
  requested_email  text not null check (length(requested_email) <= 320),
  -- Nhân viên cập nhật trạng thái gần nhất.
  handled_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists supplier_service_requests_supplier_idx
  on public.supplier_service_requests (supplier_id, created_at desc);
create index if not exists supplier_service_requests_status_idx
  on public.supplier_service_requests (status, created_at desc);
create unique index if not exists supplier_service_requests_one_open
  on public.supplier_service_requests (supplier_id, service_key)
  where status <> 'closed';

alter table public.supplier_service_requests enable row level security;
revoke all on table public.supplier_service_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.supplier_service_requests to service_role;

commit;
notify pgrst, 'reload schema';
