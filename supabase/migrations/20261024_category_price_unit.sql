-- ============================================================================
--  VEXIM TRADE – ĐƠN VỊ GIÁ THEO QUY ƯỚC THỊ TRƯỜNG CỦA TỪNG NGÀNH
--  Ngày: 24/10/2026
--
--  Vì sao cần cột này
--    Cột supplier_products.unit là chữ tự do ("MT", "kg", "thùng", đôi khi
--    "USD/kg" nằm trong currency). Không thể cộng giá của nhiều nhà cung cấp nếu
--    mỗi người ghi một kiểu, và đoán sai đơn vị thì con số sai gấp 1000 lần.
--
--    Cột categories.price_unit chốt đơn vị HIỂN THỊ của danh mục. Hệ thống vẫn
--    quy đổi mọi giá về kg để tính, rồi hiển thị theo đơn vị ở đây.
--
--  Quy ước đã đối chiếu ngày 24/10/2026
--    - Nhân điều: báo giá FOB Việt Nam phổ biến tính USD/kg (SVC, Pacific
--      Production, Tridge quy về USD/kg). Bản tin thương mại quốc tế và VINACAS
--      lại tính USD/lb. Nên chọn kg làm đơn vị chính và hiện thêm lb.
--    - Gạo: USD/tấn, ví dụ gạo 5% tấm FOB 420-450 USD/t (VFA, World Bank).
--    - Cà phê robusta: USD/tấn (ICE London, giá FOB Việt Nam quanh 4,500 USD/t).
--    - Hồ tiêu đen: USD/tấn theo cỡ 500 g/l và 550 g/l (IPC).
--    - Quế, hồi, hoa quả khô, dừa: USD/tấn trong giao dịch công nghiệp.
--    - Tôm, cá: USD/kg theo cỡ con.
--
--  An toàn khi chạy lại
--    Cột thêm bằng if not exists, và chỉ điền khi price_unit còn null.
-- ============================================================================

begin;

alter table public.categories
  add column if not exists price_unit text;

-- Nhân điều: kg, hiển thị kèm pound vì bản tin quốc tế đọc theo lb.
update public.categories
set price_unit = 'kg', updated_at = now()
where slug = 'cashew' and price_unit is null;

update public.categories
set price_unit = 'mt', updated_at = now()
where slug in (
  'rice',
  'coffee',
  'pepper',
  'cassia-cinnamon',
  'star-anise',
  'coconut',
  'dried-fruits',
  'dried-spices'
) and price_unit is null;

update public.categories
set price_unit = 'kg', updated_at = now()
where slug = 'seafood-processed-fisheries-products' and price_unit is null;

commit;
