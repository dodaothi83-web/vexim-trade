-- ============================================================================
--  VEXIM TRADE – LỊCH MÙA VỤ CHO DANH MỤC
--  Ngày: 24/10/2026
--
--  Bối cảnh
--    Trang danh mục chưa nói được "tháng nào nên chốt đơn". Dữ liệu mùa vụ hiện
--    chỉ nằm trong một dòng chữ tự do của buying_facts nên không vẽ được biểu đồ,
--    không lọc được, và mỗi lần sửa phải viết lại cả câu.
--
--  Thiết kế
--    Một cột harvest jsonb chứa danh sách cửa sổ mùa vụ, không phải mảng 12
--    tháng. Lý do: gạo có ba vụ rời nhau (Đông Xuân, Hè Thu, Thu Đông) và thủy
--    sản cao điểm theo từng loài, mảng 12 tháng không biểu diễn được cả hai mà
--    vẫn phải sửa schema khi làm danh mục thứ hai.
--
--    Cấu trúc:
--      {
--        "windows": [
--          { "id": "main", "label": "Main crop",
--            "start_month": 2, "end_month": 5,
--            "regions": ["Binh Phuoc", "Dong Nai"],
--            "peak": true, "note": "..." }
--        ],
--        "note_i18n": { "en": "..." },
--        "reviewed_on": "2026-10-24"   -- null nghĩa là chưa rà soát
--      }
--
--    end_month nhỏ hơn start_month nghĩa là cửa sổ vắt qua năm mới, ví dụ cà phê
--    robusta từ tháng 11 đến tháng 1.
--
--  An toàn khi chạy lại
--    Cột thêm bằng if not exists. Phần điền dữ liệu chỉ chạy khi harvest còn
--    null, nên không đè lên nội dung nhân viên đã sửa trong CRM.
--
--  Ghi chú về nội dung hạt điều
--    reviewed_on để null có chủ đích. Con số vụ chính là kiến thức ngành phổ
--    biến nhưng chưa đối chiếu lại với VINACAS hay Bộ Nông nghiệp, nên biểu đồ
--    sẽ tự ghi "Review date not set" thay vì giả vờ đã duyệt.
-- ============================================================================

begin;

alter table public.categories
  add column if not exists harvest jsonb;

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
  updated_at = now()
where slug = 'cashew'
  and harvest is null;

commit;
