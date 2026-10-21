-- ============================================================================
--  VEXIM TRADE – FAQ DANH MỤC THỦY SẢN THEO LUỒNG "BUYER LIÊN HỆ NCC TRƯỚC"
--  Ngày: 21/10/2026
--
--  Bối cảnh
--    Luồng mua hàng của Vexim đổi thứ tự: buyer đi xem hàng trên kệ trước.
--    Mỗi trang sản phẩm đã có sẵn nút gửi yêu cầu tới đúng nhà cung cấp đó
--    (/rfq?...&suppliers=<supplier_id>), nên buyer liên hệ thẳng với NCC.
--    Vexim chỉ vào cuộc khi buyer không tìm được sản phẩm như ý, hoặc mặt hàng
--    đó chưa có trên sàn.
--
--    Bộ FAQ cũ của danh mục thủy sản vẫn kể theo lối "gửi yêu cầu cho Vexim,
--    Vexim đi ghép nhiều NCC" nên sai thứ tự. Migration này thay bằng 6 câu
--    hỏi buyer thật sự đặt ra khi đi theo luồng mới.
--
--  An toàn khi chạy lại
--    Chỉ ghi đè khi FAQ hiện tại còn trống hoặc vẫn là bộ câu hỏi cũ
--    ("Can I get quotes from multiple seafood suppliers in Vietnam at once?").
--    Nếu nhân viên đã sửa FAQ trong CRM thì câu lệnh không làm gì cả.
-- ============================================================================

begin;

update public.categories
set
  faq_i18n = $json$[
    {
      "q": "Can I send my request to a specific supplier?",
      "a": "Yes. Open the product page and send your request from there. It goes to that supplier first, not to us. If they cannot meet it, we ask you before suggesting anyone else."
    },
    {
      "q": "The grade or the packing I need is not on the page. What then?",
      "a": "Send us the details through the request form. Seafood buyers often ask for a glaze level, an IQF or block frozen format, or a private label pack that the current listings do not show. We check producers outside these pages and reply within one business day. If nothing fits, we say so instead of offering a near match."
    },
    {
      "q": "I do not know which supplier to pick. Can you choose for me?",
      "a": "Yes. Say that in your request and we match suppliers on your specs, quantity and market, then send you their quotes to compare. Paid listings never affect who we recommend."
    },
    {
      "q": "Does it cost anything, and do I need an account?",
      "a": "No account and no fee. Browsing, writing to suppliers and sending a request are free for buyers. If your order needs paid work, such as a pre-shipment inspection or a factory visit, you get the price first and decide."
    },
    {
      "q": "Who do I pay, and who do I sign with?",
      "a": "The supplier. The contract and the payment are between you and them. We do not hold your money, and the payment terms are the ones written in their quotation."
    },
    {
      "q": "How do I check a supplier before I write to them?",
      "a": "Read the badge on their profile. It shows what we actually checked: business registration, quality certificates with the holder name and expiry date, factory evidence and past export shipments. Anything we have not checked is not shown as checked."
    }
  ]$json$::jsonb,
  updated_at = now()
where slug = 'seafood-processed-fisheries-products'
  and (
    faq_i18n is null
    or jsonb_typeof(faq_i18n) <> 'array'
    or jsonb_array_length(faq_i18n) = 0
    or faq_i18n::text like '%multiple seafood suppliers%'
  );

commit;
