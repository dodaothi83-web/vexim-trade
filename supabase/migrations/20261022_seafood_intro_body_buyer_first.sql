-- ============================================================================
--  VEXIM TRADE – INTRO VÀ BODY DANH MỤC THỦY SẢN THEO LUỒNG BUYER LIÊN HỆ NCC
--  Ngày: 22/10/2026
--
--  Bối cảnh
--    Migration 20261021 đã thay bộ FAQ thủy sản sang luồng buyer liên hệ nhà
--    cung cấp trước. Hai phần còn lại của danh mục vẫn kể theo lối cũ nên trang
--    tự mâu thuẫn: FAQ nói "gửi thẳng cho nhà cung cấp", còn intro và khối
--    About this category vẫn nói "so sánh nhiều nhà cung cấp, Vexim điều phối".
--
--    Migration này sửa hai phần đó, giữ nguyên faq_i18n đã chạy.
--
--  An toàn khi chạy lại
--    Mỗi câu lệnh có điều kiện riêng, chỉ ghi đè khi nội dung vẫn là bản cũ.
--    Nếu nhân viên đã sửa trong CRM thì câu lệnh tương ứng không làm gì.
--    Hai câu lệnh độc lập: chỉ muốn đổi body thì xoá câu lệnh số 1 và commit.
--
--  Ghi chú kỹ thuật
--    Dùng toán tử || để chỉ ghi đè khóa en và vi, giữ nguyên các ngôn ngữ khác
--    nếu sau này có thêm.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. intro_i18n: một câu "so sánh và yêu cầu báo giá" thành ba câu theo luồng mới
-- ---------------------------------------------------------------------------
update public.categories
set
  intro_i18n = coalesce(intro_i18n, '{}'::jsonb) || jsonb_build_object(
    'en', $en$Vietnamese seafood and processed fisheries suppliers, listed with the paperwork we have checked. Open a product, read the spec, and send your request straight to the supplier. If what you need is not on this page, tell us and we look at producers outside these pages.$en$,
    'vi', $vi$Nhà cung cấp thủy sản và thủy sản chế biến Việt Nam, kèm hồ sơ giấy tờ đã được kiểm tra. Mở một sản phẩm, đọc quy cách, rồi gửi yêu cầu thẳng cho nhà cung cấp đó. Nếu mặt hàng bạn cần chưa có trên trang, cho chúng tôi biết và chúng tôi tìm cả những nhà máy chưa lên sàn.$vi$
  ),
  updated_at = now()
where slug = 'seafood-processed-fisheries-products'
  and coalesce(intro_i18n->>'en', '') like '%Compare their products and request quotations%';

-- ---------------------------------------------------------------------------
-- 2. body_i18n: bốn đoạn văn phong máy thành bốn đoạn ngắn, bỏ lối Vexim đứng giữa
-- ---------------------------------------------------------------------------
update public.categories
set
  body_i18n = coalesce(body_i18n, '{}'::jsonb) || jsonb_build_object(
    'en', $en$<p>The category covers what Vietnamese coastal plants and aquaculture farms ship: frozen shrimp, pangasius fillets, squid, and processed items packed for retail or industrial use.</p><p>Most listings are graded by count per pound or by size class, and the packing decides as much as the grade. Glaze level, IQF against block frozen, and carton weight change what actually arrives, so ask for those in writing before you compare prices.</p><p>Paperwork depends on where the container is going. Health certificates, catch or farm documents and customs papers are set by the importing country, and the supplier confirms which ones they can issue. Nothing on this page is a promise that a document will be accepted at your border.</p><p>If you already know the spec, go straight to the supplier page. If you do not, send the details to us and we look outside these pages.</p>$en$,
    'vi', $vi$<p>Danh mục này gồm những gì các nhà máy ven biển và cơ sở nuôi trồng Việt Nam xuất đi: tôm đông lạnh, cá tra phi lê, mực, và hàng chế biến đóng gói cho bán lẻ hoặc cho công nghiệp.</p><p>Phần lớn hàng được phân cỡ theo số con trên pound hoặc theo cỡ, và cách đóng gói quyết định ngang với cỡ. Tỷ lệ áo băng, IQF hay đông block, và trọng lượng thùng hàng thay đổi thứ thực sự đến tay bạn, nên yêu cầu ghi rõ mấy mục đó trước khi so giá.</p><p>Giấy tờ phụ thuộc vào nơi container đến. Giấy chứng nhận y tế, giấy chứng nhận khai thác hoặc nuôi trồng và giấy hải quan do nước nhập khẩu quy định, nhà cung cấp xác nhận họ cấp được những loại nào. Không có gì trên trang này là cam kết rằng giấy tờ sẽ được chấp nhận ở cửa khẩu của bạn.</p><p>Nếu bạn đã rõ quy cách, đi thẳng tới trang nhà cung cấp. Nếu chưa, gửi thông tin cho chúng tôi và chúng tôi tìm cả những nhà máy chưa lên sàn.</p>$vi$
  ),
  updated_at = now()
where slug = 'seafood-processed-fisheries-products'
  and (
    coalesce(body_i18n->>'en', '') like '%compare multiple Vietnamese suppliers%'
    or coalesce(body_i18n->>'en', '') like '%coordinating communication%'
  );

commit;
