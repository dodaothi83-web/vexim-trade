-- GĐ2 giấy tờ & chứng nhận: một kho giấy, phạm vi theo danh mục/sản phẩm, bản gia hạn.
-- Chạy trong Supabase SQL Editor SAU 20261075_certificate_scheme.sql.
--
-- Vì sao: trước đây giấy được "gắn sản phẩm" bằng hai cột id rời
-- (`requested_product_ids` / `approved_product_ids`), không nói được "giấy này phủ cả
-- danh mục Cashew" và không có chỗ ghi ai xác nhận phạm vi. Ba thay đổi:
--
--   1. Loại giấy (scheme) mở rộng đúng danh sách mới: tách hữu cơ thành USDA/EU/khác,
--      thêm GPKD và phiếu kiểm nghiệm. Giấy pháp lý và giấy theo lô nằm trong cùng
--      danh sách nhưng KHÔNG lên chip (xem lib/certificate-scheme.ts).
--   2. `certificate_scopes` — mỗi dòng là HOẶC một danh mục HOẶC một sản phẩm, kèm
--      người/ lúc xác nhận. Sản phẩm thuộc danh mục đã có phạm vi thì tự nhận giấy.
--   3. `product_certificate_optouts` — nhà cung cấp bỏ nhận một giấy thừa hưởng.
--
-- Bản gia hạn dùng cột `supersedes_certificate_id` / `superseded_by_certificate_id`:
-- tải bản mới thì bản cũ vẫn hiệu lực tới khi bản mới được duyệt; duyệt xong thì phạm
-- vi chuyển sang bản mới và bản cũ ngừng hiện.
--
-- KHÔNG tự chốt loại giấy cho dữ liệu cũ. Giấy chưa phân loại (NULL, 'other' hoặc giá
-- trị cũ 'organic') vẫn hiện trên hồ sơ nhưng không lên chip và chờ nhân viên tách
-- loại ở hàng đợi "Giấy chưa phân loại".
begin;

-- 1. Danh sách loại giấy mới --------------------------------------------------
alter table public.certificates drop constraint if exists certificates_scheme_ck;
alter table public.certificates add constraint certificates_scheme_ck check (
  certificate_scheme is null or certificate_scheme in (
    -- pháp lý (L1, không gắn sản phẩm)
    'business_license', 'food_safety', 'export_license',
    -- giấy theo lô (để dành cho đơn hàng/RFQ)
    'origin', 'phytosanitary', 'inspection_report',
    -- chứng nhận chất lượng (gán phạm vi → badge + chip)
    'haccp', 'iso_22000', 'fssc_22000', 'brc', 'ifs', 'iso_9001', 'gmp',
    'globalgap', 'halal', 'kosher',
    'organic_usda', 'organic_eu', 'organic_other',
    'rainforest', 'fda',
    -- chưa xếp được (giá trị 'organic' cũ vẫn nằm trong bảng, không tự đổi)
    'other'
  )
) not valid;

create index if not exists certificates_scheme_idx
  on public.certificates (certificate_scheme)
  where certificate_scheme is not null;

-- 2. Bản gia hạn ---------------------------------------------------------------
alter table public.certificates
  add column if not exists supersedes_certificate_id uuid references public.certificates(id) on delete set null,
  add column if not exists superseded_by_certificate_id uuid references public.certificates(id) on delete set null;

create index if not exists certificates_supersedes_idx
  on public.certificates (supersedes_certificate_id)
  where supersedes_certificate_id is not null;
create index if not exists certificates_superseded_by_idx
  on public.certificates (superseded_by_certificate_id)
  where superseded_by_certificate_id is not null;

-- 3. Phạm vi chứng nhận --------------------------------------------------------
create table if not exists public.certificate_scopes (
  id             uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  category_id    uuid references public.categories(id) on delete cascade,
  product_id     uuid references public.supplier_products(id) on delete cascade,
  -- Người xác nhận phạm vi; chỉ dòng có verified_at mới có hiệu lực với người mua.
  verified_by    text,
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint certificate_scopes_one_target check ((category_id is null) <> (product_id is null))
);
create index if not exists certificate_scopes_certificate_idx
  on public.certificate_scopes (certificate_id);
create index if not exists certificate_scopes_category_idx
  on public.certificate_scopes (category_id) where category_id is not null;
create index if not exists certificate_scopes_product_idx
  on public.certificate_scopes (product_id) where product_id is not null;
create unique index if not exists certificate_scopes_certificate_category_key
  on public.certificate_scopes (certificate_id, category_id) where category_id is not null;
create unique index if not exists certificate_scopes_certificate_product_key
  on public.certificate_scopes (certificate_id, product_id) where product_id is not null;

alter table public.certificate_scopes enable row level security;
revoke all on public.certificate_scopes from anon, authenticated;

-- 4. Nhà cung cấp bỏ nhận giấy thừa hưởng từ danh mục --------------------------
create table if not exists public.product_certificate_optouts (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid not null references public.suppliers(id) on delete cascade,
  product_id     uuid not null references public.supplier_products(id) on delete cascade,
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  created_at     timestamptz not null default now()
);
create unique index if not exists product_certificate_optouts_key
  on public.product_certificate_optouts (product_id, certificate_id);
create index if not exists product_certificate_optouts_supplier_idx
  on public.product_certificate_optouts (supplier_id);

alter table public.product_certificate_optouts enable row level security;
revoke all on public.product_certificate_optouts from anon, authenticated;

-- 5. Chuyển phạm vi cũ: approved_product_ids → một dòng phạm vi / sản phẩm -------
-- Chỉ chuyển giấy chất lượng (hoặc giấy chưa phân loại nhưng đã được duyệt gắn từ
-- trước) và chỉ sản phẩm còn tồn tại đúng nhà cung cấp. Giấy pháp lý/giấy theo lô
-- không tạo phạm vi, nên không thể thành badge hay chip.
insert into public.certificate_scopes (certificate_id, product_id, verified_by, verified_at)
select c.id, sp.id, c.checked_by, coalesce(c.checked_at, c.updated_at)
from public.certificates c
cross join lateral unnest(coalesce(c.approved_product_ids, '{}'::uuid[])) as pid
join public.supplier_products sp on sp.id = pid and sp.supplier_id = c.supplier_id
where c.certificate_scheme is null
   or c.certificate_scheme in (
     'haccp', 'iso_22000', 'fssc_22000', 'brc', 'ifs', 'iso_9001', 'gmp',
     'globalgap', 'halal', 'kosher',
     'organic_usda', 'organic_eu', 'organic_other',
     'rainforest', 'fda'
   )
on conflict do nothing;

commit;
notify pgrst, 'reload schema';
