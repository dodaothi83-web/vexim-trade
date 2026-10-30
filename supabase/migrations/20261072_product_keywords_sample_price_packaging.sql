-- Phase 2 hồ sơ sản phẩm: từ khoá tìm kiếm, giá mẫu và đóng gói có cấu trúc.
--
-- Chỉ THÊM cột, không sửa và không đổ dữ liệu cũ. Sản phẩm đang chạy giữ nguyên:
-- cột mới để trống thì mọi trang đọc như hiện nay (form, trang người mua, CRM).
-- Không có backfill, không suy đoán giá trị từ `packaging` dạng văn bản.
alter table supplier_products
  add column if not exists keywords text[] not null default '{}',
  add column if not exists sample_price_usd numeric(12, 2),
  add column if not exists package_type text,
  add column if not exists package_weight_kg numeric(10, 3),
  add column if not exists package_size text,
  add column if not exists units_per_carton integer;

comment on column supplier_products.keywords is
  'Tối đa 3 từ khoá tiếng Anh để người mua tìm thấy sản phẩm; nhà cung cấp tự khai, không phải xác minh.';
comment on column supplier_products.sample_price_usd is
  'Giá một mẫu hàng tính bằng USD; để trống khi không bán mẫu.';
comment on column supplier_products.package_type is
  'Kiện đóng gói: bao, thùng, hộp, pallet… (văn bản ngắn).';
comment on column supplier_products.package_weight_kg is
  'Khối lượng thực của một kiện, tính bằng kg.';
comment on column supplier_products.package_size is
  'Kích thước một kiện, ví dụ 60x40x40 cm; để trống nếu chưa đo.';
comment on column supplier_products.units_per_carton is
  'Số đơn vị sản phẩm trong một thùng hoặc kiện.';

-- Giới hạn nhẹ để dữ liệu nhập tay không phá trang người mua. Cột trống vẫn hợp lệ.
alter table supplier_products
  drop constraint if exists supplier_products_keywords_size;
-- CHECK không được chứa truy vấn con, nên chỉ chặn số lượng ở đây; độ dài từng
-- từ khoá do `lib/products/product-extras.ts` kiểm tra trước khi ghi.
alter table supplier_products
  add constraint supplier_products_keywords_size
  check (coalesce(array_length(keywords, 1), 0) <= 3);

alter table supplier_products
  drop constraint if exists supplier_products_sample_price_range;
alter table supplier_products
  add constraint supplier_products_sample_price_range
  check (sample_price_usd is null or (sample_price_usd >= 0 and sample_price_usd <= 100000));

alter table supplier_products
  drop constraint if exists supplier_products_package_weight_range;
alter table supplier_products
  add constraint supplier_products_package_weight_range
  check (package_weight_kg is null or (package_weight_kg > 0 and package_weight_kg <= 100000));

alter table supplier_products
  drop constraint if exists supplier_products_units_per_carton_range;
alter table supplier_products
  add constraint supplier_products_units_per_carton_range
  check (units_per_carton is null or (units_per_carton > 0 and units_per_carton <= 100000));

-- Tìm theo từ khoá: chỉ mục GIN, không đổi cách đọc hiện tại.
create index if not exists supplier_products_keywords_gin
  on supplier_products using gin (keywords);
