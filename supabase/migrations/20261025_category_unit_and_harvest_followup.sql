-- ============================================================================
--  VEXIM TRADE – VÁ ĐƠN VỊ GIÁ THEO SLUG THỰC TẾ + LỊCH MÙA VỤ CHO DANH MỤC HẠT ĐIỀU
--  Ngày: 25/10/2026
--
--  Vì sao cần migration này
--    Migration 20261024 đặt đơn vị giá theo danh sách slug mình đoán trước. Rà
--    database ngày 25/10/2026 thấy slug thực tế khác:
--
--      dried-fruits                          mt   đúng
--      seafood-processed-fisheries-products  kg   đúng
--      spices                                null sai, vì danh sách ghi "dried-spices"
--
--    Và không có dòng nào mang slug "cashew", nên cả phần đơn vị giá lẫn lịch
--    mùa vụ của hạt điều trong migration trước không áp vào đâu cả. Đây là lý do
--    biểu đồ mùa vụ chưa hiện ở đâu sau khi chạy migration.
--
--  Phần 1 – đơn vị giá
--    Vá slug "spices" về tấn. Ruột ngành gia vụ khô (hồ tiêu, quế, hồi) đều
--    giao dịch theo tấn.
--
--  Phần 2 – lịch mùa vụ hạt điều
--    Chỉ chạy khi đã có danh mục hạt điều, nhận diện theo tên chứ không theo
--    slug, vì slug có thể là "cashew", "cashew-kernels" hay "hat-dieu". Chưa có
--    danh mục nào như vậy thì câu lệnh không làm gì, chạy lại sau khi tạo danh
--    mục vẫn đúng.
--
--  An toàn khi chạy lại
--    Cả hai phần đều có điều kiện "còn null", nên không đè lên nội dung nhân
--    viên đã nhập trong CRM.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Đơn vị giá cho slug thực tế
-- ---------------------------------------------------------------------------
update public.categories
set price_unit = 'mt', updated_at = now()
where price_unit is null
  and (
    slug in ('spices', 'dried-spices', 'rice', 'coffee', 'pepper', 'cassia-cinnamon', 'star-anise', 'coconut', 'dried-fruits')
    or slug ~ '(rice|coffee|pepper|cassia|cinnamon|anise|spice|coconut|fruit|bean|tea|sugar)'
  );

update public.categories
set price_unit = 'kg', updated_at = now()
where price_unit is null
  and (
    slug in ('seafood-processed-fisheries-products', 'seafood', 'cashew', 'cashew-kernels')
    or slug ~ '(seafood|fisher|shrimp|prawn|fish|squid|tuna|pangasius|cashew|nut|kernel)'
  );

-- ---------------------------------------------------------------------------
-- 2. Lịch mùa vụ cho danh mục hạt điều
--
--    Nội dung: vụ chính tháng 2 đến tháng 5 ở Bình Phước, Đồng Nai, Tây Nguyên.
--    reviewed_on để null có chủ đích: con số này là kiến thức ngành phổ biến
--    nhưng chưa đối chiếu lại với VINACAS hay Bộ Nông nghiệp, nên biểu đồ sẽ tự
--    ghi "Review date not set" thay vì giả vờ đã duyệt. Xác nhận xong thì điền
--    ngày trong /crm/categories, tab Mùa vụ.
-- ---------------------------------------------------------------------------
update public.categories
set
  harvest = $json${
    "windows": [
      {
        "id": "main",
        "label": "Main crop",
        "start_month": 2,
        "end_month": 5,
        "regions": ["Binh Phuoc", "Dong Nai", "Central Highlands"],
        "peak": true,
        "note": "Picking runs province by province, so the peak moves by a few weeks from year to year."
      }
    ],
    "note_i18n": {
      "en": "Plants process kernels all year because they also buy raw nuts from West Africa and Cambodia. These months are the domestic harvest, not the only window when you can order."
    },
    "reviewed_on": null
  }$json$::jsonb,
  price_unit = coalesce(price_unit, 'kg'),
  updated_at = now()
where harvest is null
  and (
    slug ~ 'cashew'
    or coalesce(name_i18n->>'en', '') ilike '%cashew%'
    or coalesce(name_i18n->>'vi', '') ilike '%điều%'
  );

commit;

-- ============================================================================
--  Kiểm tra sau khi chạy
--
--    select slug, price_unit,
--           jsonb_array_length(coalesce(harvest->'windows', '[]'::jsonb)) as harvest_windows
--    from public.categories order by slug;
--
--  Kỳ vọng: spices ra 'mt'. Danh mục hạt điều, nếu đã tạo, ra 'kg' với 1 cửa sổ.
-- ============================================================================
