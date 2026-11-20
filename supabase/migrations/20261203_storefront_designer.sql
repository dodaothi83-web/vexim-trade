-- "Thiết kế trang" cho nhà cung cấp Premium/Pro (xem lib/storefront-layout.ts).
-- storefront_layout: bản người mua đang thấy; storefront_layout_draft: bản đang soạn.
alter table public.suppliers add column if not exists storefront_layout jsonb;
alter table public.suppliers add column if not exists storefront_layout_draft jsonb;
comment on column public.suppliers.storefront_layout is 'Bố cục trang nhà cung cấp đang công khai (Premium/Pro). Null: dùng giao diện cũ (storefront_theme + showcase_blocks).';
comment on column public.suppliers.storefront_layout_draft is 'Bản nháp bố cục trang; chỉ nhà cung cấp và nhân viên thiết kế hộ thấy.';

-- Mỗi lần Áp dụng lưu một phiên bản để khôi phục.
create table if not exists public.supplier_storefront_versions (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  layout jsonb not null,
  applied_by uuid,
  applied_by_email text,
  -- supplier: nhà cung cấp tự áp dụng; staff: Vexim thiết kế hộ; restore: khôi phục bản cũ.
  applied_role text not null check (applied_role in ('supplier', 'staff')),
  note text,
  consent_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists supplier_storefront_versions_supplier_idx on public.supplier_storefront_versions (supplier_id, created_at desc);
alter table public.supplier_storefront_versions enable row level security;

-- Đồng ý cho Vexim thiết kế và đăng trang thay nhà cung cấp (dịch vụ bán ngoài hệ thống).
create table if not exists public.supplier_design_consents (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  representative text not null,
  consented_on date not null,
  method text not null check (method in ('contract', 'email', 'zalo', 'other')),
  evidence text not null,
  scope text not null check (scope in ('storefront', 'storefront_aplus')),
  recorded_by uuid,
  recorded_by_email text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_email text
);
create index if not exists supplier_design_consents_supplier_idx on public.supplier_design_consents (supplier_id, created_at desc);
alter table public.supplier_design_consents enable row level security;
-- Không có policy: chỉ máy chủ (service role) đọc ghi hai bảng trên.
