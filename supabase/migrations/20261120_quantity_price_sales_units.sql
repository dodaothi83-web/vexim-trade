-- Đơn vị bán cho bảng giá theo số lượng: kg (mặc định) hoặc lon, chai, gói, hộp, thùng.
--
-- Hàng đóng gói (nước giải khát, bánh kẹo, đồ hộp) bán theo đơn vị đếm, không theo kg.
-- Đơn vị nằm trên từng mức giá trong product_quantity_price_revisions.tiers (trường
-- "unit"); mọi mức của một bảng dùng cùng một đơn vị. Bảng giá kg không ghi trường này nên
-- dữ liệu cũ giữ nguyên; thiếu trường là kg. Bảng giá thử nghiệm v2 ghi "kg" hoặc "mt".
--
-- Với đơn vị đếm, "minKg" là số đơn vị nguyên và "priceUsdPerKg" là giá trên một đơn vị
-- (tên trường giữ nguyên để không phải đổi các hàm duyệt). Giá theo đơn vị đếm không quy
-- đổi ra kg: không vào khoảng giá danh mục, xếp hạng giá hay bộ lọc MOQ theo khối lượng.
--
-- Migration chỉ thêm ràng buộc: các hàm gửi/duyệt giá lưu nguyên JSON nên không cần sửa.
-- Dữ liệu hiện có không có đơn vị lạ nên ràng buộc thêm được ngay. Chạy lại an toàn.
begin;

alter table public.product_quantity_price_revisions
  drop constraint if exists product_quantity_price_revisions_tier_unit_check;

alter table public.product_quantity_price_revisions
  add constraint product_quantity_price_revisions_tier_unit_check
  check (not jsonb_path_exists(tiers,
    '$[*] ? (exists(@.unit) && (@.unit.type() != "string" || !(@.unit like_regex "^(kg|mt|can|bottle|pack|box|carton)$")))'));

comment on column public.product_quantity_price_revisions.tiers is
  'Mức giá theo số lượng. Trường unit (can, bottle, pack, box, carton) đổi minKg/priceUsdPerKg thành số đơn vị và giá trên đơn vị; thiếu unit là kg.';

commit;
notify pgrst, 'reload schema';
