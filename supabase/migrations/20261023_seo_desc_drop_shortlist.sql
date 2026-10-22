-- ============================================================================
--  VEXIM TRADE – BỎ TỪ "SHORTLIST" KHỎI MÔ TẢ TÌM KIẾM ĐÃ LƯU TRONG DATABASE
--  Ngày: 23/10/2026
--
--  Bối cảnh
--    Code đã thôi dùng từ "shortlist" trong mọi câu buyer đọc, nhưng
--    seo_desc_i18n lưu sẵn trong database thì vẫn còn. Google đọc bản lưu này,
--    nên câu cũ vẫn hiện trên trang kết quả dù code đã đổi.
--
--  Phạm vi
--    Chỉ danh mục hạt điều, vì đây là chỗ duy nhất trong schema nắm được chắc
--    có câu cũ. Các danh mục khác có thể đã được sửa tay trong CRM.
--
--    Muốn biết còn danh mục nào khác, chạy câu truy vấn này trước:
--
--      select slug, seo_desc_i18n->>'en' as en_description
--      from public.categories
--      where coalesce(seo_desc_i18n->>'en', '') ilike '%shortlist%'
--      order by slug;
--
--    Nếu kết quả có thêm dòng nào, gửi lại và tôi viết tiếp cho đúng câu.
--
--  An toàn khi chạy lại
--    Chỉ ghi đè khi mô tả hiện tại vẫn còn chứa cụm cũ. Nhân viên đã sửa trong
--    CRM thì câu lệnh không làm gì.
-- ============================================================================

begin;

update public.categories
set
  seo_desc_i18n = coalesce(seo_desc_i18n, '{}'::jsonb) || jsonb_build_object(
    'en', $en$Compare verified Vietnamese cashew kernel suppliers by grade, MOQ and lead time. Request a quote from the supplier you choose, or ask us to look for one.$en$
  ),
  updated_at = now()
where slug = 'cashew'
  and coalesce(seo_desc_i18n->>'en', '') ilike '%shortlist%';

commit;
