-- Yêu cầu báo giá, độc lập với gói/quyết định duyệt/thanh toán.
-- Chỉ ứng dụng phía server dùng service_role; không cấp quyền cho browser.
create table if not exists public.sponsored_requests (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  product_id uuid references public.supplier_products(id) on delete set null,
  requested_by uuid references public.app_users(id) on delete set null,
  -- Lưu tên tại thời điểm gửi để nhân viên vẫn hiểu yêu cầu khi bản gốc bị xoá.
  supplier_name text not null check (length(trim(supplier_name)) between 1 and 300),
  product_name text not null check (length(trim(product_name)) between 1 and 300),
  category_slug text not null check (length(trim(category_slug)) between 1 and 200),
  category_name text not null check (length(trim(category_name)) between 1 and 300),
  requester_email text not null check (length(trim(requester_email)) between 1 and 320),
  note text check (note is null or length(note) <= 500),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chỉ một yêu cầu chưa kết thúc cho mỗi sản phẩm, kể cả khi gửi đồng thời.
create unique index if not exists sponsored_requests_one_open_idx
  on public.sponsored_requests (supplier_id, product_id)
  where status in ('new', 'contacted') and supplier_id is not null and product_id is not null;
create index if not exists sponsored_requests_supplier_idx
  on public.sponsored_requests (supplier_id, created_at desc);
create index if not exists sponsored_requests_status_idx
  on public.sponsored_requests (status, created_at desc);

create or replace function public.guard_sponsored_request()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'new' or new.updated_by is not null or
       new.supplier_id is null or new.product_id is null or new.requested_by is null or
       not exists (select 1 from public.app_users u where u.id = new.requested_by
         and u.role = 'supplier' and u.is_active and u.supplier_id = new.supplier_id) or
       not exists (select 1 from public.supplier_products p where p.id = new.product_id
         and p.supplier_id = new.supplier_id) then
      raise exception 'Invalid sponsored request owner';
    end if;
  elsif new.status is distinct from old.status then
    if not (old.status = 'new' and new.status in ('contacted', 'closed') or
            old.status = 'contacted' and new.status = 'closed') or
       not exists (select 1 from public.app_users u where u.id = new.updated_by
         and u.is_active and u.role in ('admin', 'reviewer', 'sale')) then
      raise exception 'Invalid sponsored request transition';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function public.guard_sponsored_request() from public, anon, authenticated;
grant execute on function public.guard_sponsored_request() to service_role;
drop trigger if exists sponsored_requests_guard on public.sponsored_requests;
create trigger sponsored_requests_guard before insert or update on public.sponsored_requests
  for each row execute function public.guard_sponsored_request();

alter table public.sponsored_requests enable row level security;
revoke all on public.sponsored_requests from public, anon, authenticated;
grant select, insert, update on public.sponsored_requests to service_role;
comment on table public.sponsored_requests is 'Yêu cầu báo giá; không tạo hoặc duyệt gói quảng cáo.';
