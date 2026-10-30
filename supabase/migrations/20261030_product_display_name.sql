-- Tên hiển thị cho buyer, soạn từ dữ kiện có cấu trúc.
--
-- Tên gốc của nhà cung cấp (`name`) là chứng từ, giữ nguyên văn và không bị ghi
-- đè. Cột này chỉ chứa tên do nhân viên chốt theo thứ tự mặt hàng, quy cách,
-- tỉnh, rồi tối đa hai chỉ tiêu phụ. Để trống thì trang buyer lùi về tên gốc,
-- nên migration này không đổi sản phẩm nào đang chạy.
alter table supplier_products
  add column if not exists display_name text;

comment on column supplier_products.display_name is
  'Tên soạn sẵn cho buyer; rỗng thì dùng name/name_i18n. Không dùng để suy ra danh mục.';

alter table supplier_products
  drop constraint if exists supplier_products_display_name_length;
alter table supplier_products
  add constraint supplier_products_display_name_length
  check (display_name is null or char_length(btrim(display_name)) between 0 and 120);
