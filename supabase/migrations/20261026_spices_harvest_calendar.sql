-- ============================================================================
--  VEXIM TRADE – LỊCH MÙA VỤ CHO DANH MỤC GIA VỊ KHÔ
--  Ngày: 25/10/2026
--
--  Bối cảnh
--    Database đang có ba danh mục: dried-fruits, seafood-processed-fisheries-
--    products, spices. Không có danh mục hạt điều, nên phần dữ liệu hạt điều
--    trong các migration trước nằm im. Migration này điền lịch mùa vụ cho danh
--    mục đang thật sự có người xem.
--
--  Vì sao gộp thành hai cửa sổ chứ không phải năm
--    Danh mục này gồm ba loại cây có lịch khác nhau: hồ tiêu, quế và hồi. Nếu vẽ
--    riêng từng cây thì biểu đồ có năm thanh chồng nhau, buyer nhìn không ra.
--    Ở cấp danh mục, ba cây này trùng nhau thành hai mùa: chính từ tháng 2 đến
--    tháng 5, phụ từ tháng 8 đến tháng 11. Chi tiết từng cây nằm trong ghi chú,
--    nơi nó hữu ích hơn là một thanh thứ năm.
--
--  Nguồn đã đối chiếu ngày 24/10/2026
--    - Hồ tiêu: VPSA cho biết vụ 2026 bắt đầu cuối tháng 2 và kéo tới hết tháng
--      4; vùng chính là Tây Nguyên (Đắk Lắk, Gia Lai, Đắk Nông), Bình Phước,
--      Bà Rịa - Vũng Tàu.
--    - Quế: hai vụ, chính tháng 3 đến tháng 5, phụ tháng 8 đến tháng 10; Yên Bái
--      chiếm khoảng 70 phần trăm diện tích.
--    - Hồi: vụ xuân tháng 3 đến tháng 4, vụ thu tháng 8 đến tháng 11; Lạng Sơn
--      chiếm phần lớn sản lượng.
--
--    reviewed_on ghi ngày 24/10/2026 vì đã đối chiếu các nguồn trên. Nếu bộ phận
--    thu mua của Vexim xác nhận khác, sửa lại một dòng trong /crm/categories,
--    tab Mùa vụ, không cần deploy.
--
--  An toàn khi chạy lại
--    Chỉ điền khi harvest còn null, nên không đè nội dung nhân viên đã nhập.
-- ============================================================================

begin;

update public.categories
set
  harvest = $json${
    "windows": [
      {
        "id": "main",
        "label": "Main crop",
        "start_month": 2,
        "end_month": 5,
        "regions": ["Dak Lak", "Gia Lai", "Dak Nong", "Binh Phuoc", "Ba Ria - Vung Tau", "Yen Bai"],
        "peak": true,
        "note": "Pepper runs from late February to the end of April. Cassia bark peaks from March to May."
      },
      {
        "id": "second",
        "label": "Second crop",
        "start_month": 8,
        "end_month": 11,
        "regions": ["Yen Bai", "Lao Cai", "Lang Son"],
        "peak": false,
        "note": "Second cassia bark season and the autumn star anise crop, which carries the stronger aroma."
      }
    ],
    "note_i18n": {
      "en": "Spices are dried and stored, so you can buy all year. These months are when the crop is picked, which is when prices move and when the freshest material reaches the mills."
    },
    "reviewed_on": "2026-10-24"
  }$json$::jsonb,
  price_unit = coalesce(price_unit, 'mt'),
  updated_at = now()
where slug in ('spices', 'dried-spices')
  and harvest is null;

commit;

-- ============================================================================
--  Kiểm tra sau khi chạy
--
--    select slug, price_unit,
--           jsonb_array_length(coalesce(harvest->'windows', '[]'::jsonb)) as harvest_windows
--    from public.categories order by slug;
--
--  Kỳ vọng: spices ra 'mt' với 2 cửa sổ.
-- ============================================================================
