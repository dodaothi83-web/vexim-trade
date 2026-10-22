-- ============================================================================
--  VEXIM TRADE – BỎ TỪ "SHORTLIST" KHỎI MÔ TẢ TÌM KIẾM ĐÃ LƯU TRONG DATABASE
--  Ngày: 23/10/2026
--
--  Bối cảnh
--    Code đã thôi dùng từ "shortlist" trong mọi câu buyer đọc. Câu đã lưu sẵn
--    trong cột seo_desc_i18n thì code không sửa tới, mà Google lại đọc bản lưu
--    đó, nên nếu còn thì vẫn hiện trên trang kết quả.
--
--  Trạng thái
--    Ngày 23/10/2026 đã rà database bằng truy vấn ở dưới và không còn dòng nào
--    chứa từ đó. Migration này hiện là lưới an toàn, chạy cũng không đổi gì.
--
--    Truy vấn rà, dùng lại khi cần:
--
--      select slug, jsonb_typeof(seo_desc_i18n) as shape, seo_desc_i18n::text as raw
--      from public.categories
--      where seo_desc_i18n::text ilike '%shortlist%'
--      order by slug;
--
--  Vì sao dùng seo_desc_i18n::text thay vì seo_desc_i18n->>'en'
--    Cột này từng gặp hai dạng: object {"en": "...", "vi": "..."} và chuỗi jsonb
--    thuần. Với dạng chuỗi, toán tử ->> trả null nên điều kiện lọc không bao giờ
--    khớp và câu lệnh im lặng không làm gì. Ép ::text bắt được cả hai dạng.
--
--  An toàn khi chạy lại
--    Chỉ ghi đè khi mô tả hiện tại còn chứa cụm cũ. Nhân viên đã sửa trong CRM
--    thì câu lệnh không làm gì. Phần ghi cũng kiểm dạng cột trước khi ghép,
--    tránh trường hợp chuỗi || object tạo ra mảng hỏng.
-- ============================================================================

begin;

update public.categories
set
  seo_desc_i18n = case
    when jsonb_typeof(seo_desc_i18n) = 'object'
      then seo_desc_i18n || jsonb_build_object(
        'en', $en$Compare verified Vietnamese cashew kernel suppliers by grade, MOQ and lead time. Request a quote from the supplier you choose, or ask us to look for one.$en$
      )
    else jsonb_build_object(
      'en', $en$Compare verified Vietnamese cashew kernel suppliers by grade, MOQ and lead time. Request a quote from the supplier you choose, or ask us to look for one.$en$
    )
  end,
  updated_at = now()
where slug = 'cashew'
  and coalesce(seo_desc_i18n::text, '') ilike '%shortlist%';

commit;
