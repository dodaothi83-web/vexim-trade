# Danh mục Thủy sản & thủy sản chế biến: nội dung theo luồng buyer liên hệ NCC trước

Cập nhật 21/10/2026.

## Luồng mới, viết ngắn gọn

Buyer vào xem hàng trên kệ trước. Sản phẩm nào hợp thì mở trang sản phẩm, xem spec rồi gửi yêu cầu
thẳng cho nhà cung cấp đó (nút trên trang sản phẩm đã gắn sẵn `suppliers=<supplier_id>` nên yêu cầu
đi tới đúng người, không qua Vexim). Vexim chỉ xuất hiện ở hai chỗ:

1. Buyer không tìm được sản phẩm, quy cách, đóng gói hoặc số lượng mình cần.
2. Buyer không muốn tự chọn và nhờ Vexim lọc giúp.

Nói cách khác, Vexim là quầy hỗ trợ ở cuối siêu thị, không phải quầy thu ngân bắt buộc phải đi qua.

## Phần đã sửa trong code

`app/(public)/products/[slug]/page.tsx`, trạng thái danh mục chưa có sản phẩm nào (StateB):

- Đoạn mở đầu: bỏ câu "Tell us your spec and we will check suitable producers".
- Khối bên phải: đổi từ "Tell us what you need / Get matched with ... suppliers" sang nội dung dưới đây.
- Khối CTA cuối trang: câu dẫn rõ hơn rằng đây là đường dành cho thứ chưa có trên trang.

### Khối "If it is not on the page"

> **If it is not on the page**
>
> ## Looking for something we have not listed?
>
> Start with the supplier whenever a listing fits: read their spec and send your request straight to
> them, no step through us. If the grade, the packing or the volume you need is not here, tell us and
> we will look at producers outside these pages. Free, no account needed, and we reply within one
> business day.
>
> - The product, the size or the grade you are after.
> - Volume, packing and the port it ships to.
> - Certificates your market asks for (HACCP, BRC, organic and so on).
>
> [Send us the details]
>
> **Product listings coming soon.**
> Suppliers are checked before they go up, which is why this page is still empty. Until the first
> listings are live, the form above comes to our sourcing desk and you hear back within one business day.

## Questions buyers ask (bộ mới, 6 câu)

Đây là nội dung thay cho 5 câu cũ đang nằm trong `categories.faq_i18n` của danh mục
`seafood-processed-fisheries-products`. Migration `20261021_seafood_category_buyer_first_copy.sql`
cập nhật thẳng vào DB, và chỉ ghi đè khi FAQ hiện tại vẫn là bộ cũ nên không đè lên bản sửa tay trong CRM.

**Can I send my request to a specific supplier?**
Yes. Open the product page and send your request from there. It goes to that supplier first, not to
us. If they cannot meet it, we ask you before suggesting anyone else.

**The grade or the packing I need is not on the page. What then?**
Send us the details through the request form. Seafood buyers often ask for a glaze level, an IQF or
block frozen format, or a private label pack that the current listings do not show. We check producers
outside these pages and reply within one business day. If nothing fits, we say so instead of offering a
near match.

**I do not know which supplier to pick. Can you choose for me?**
Yes. Say that in your request and we match suppliers on your specs, quantity and market, then send you
their quotes to compare. Paid listings never affect who we recommend.

**Does it cost anything, and do I need an account?**
No account and no fee. Browsing, writing to suppliers and sending a request are free for buyers. If
your order needs paid work, such as a pre-shipment inspection or factory verification, you get the price
first and decide.

**Who do I pay, and who do I sign with?**
The supplier. The contract and the payment are between you and them. We do not hold your money, and
the payment terms are the ones written in their quotation.

**How do I check a supplier before I write to them?**
Read the badge on their profile. It shows what we actually checked: business registration, quality
certificates with the holder name and expiry date, factory evidence and past export shipments.
Anything we have not checked is not shown as checked.

### Bản tiếng Việt để đối chiếu nội bộ

1. Tôi có gửi yêu cầu cho một nhà cung cấp cụ thể được không? — Được. Mở trang sản phẩm và gửi yêu cầu
   ngay ở đó, yêu cầu tới nhà cung cấp trước, không qua Vexim. Nếu họ không đáp ứng được thì Vexim sẽ
   hỏi lại trước khi giới thiệu bên khác.
2. Quy cách hoặc đóng gói tôi cần không có trên trang thì sao? — Gửi thông tin qua form: độ glaze, dạng
   IQF hay block frozen, nhãn riêng, số lượng, cảng đến. Vexim tìm cả những nhà máy chưa lên trang và
   trả lời trong một ngày làm việc. Không có hàng phù hợp thì nói thẳng, không đưa hàng gần giống.
3. Tôi không biết chọn nhà cung cấp nào, Vexim chọn giúp được không? — Được, chỉ cần ghi rõ trong yêu
   cầu. Vexim lọc theo quy cách, số lượng và thị trường rồi gửi báo giá để so sánh. Bài đăng trả phí
   không ảnh hưởng tới việc giới thiệu.
4. Có mất phí không, có phải tạo tài khoản không? — Miễn phí, không cần tài khoản. Dịch vụ có phí như
   giám định trước khi giao hay đi xem nhà máy thì báo giá trước rồi buyer quyết.
5. Tôi trả tiền cho ai, ký hợp đồng với ai? — Với nhà cung cấp. Vexim không giữ tiền của buyer, điều
   khoản thanh toán theo báo giá của nhà cung cấp.
6. Làm sao kiểm tra một nhà cung cấp trước khi viết thư? — Xem nhãn trên hồ sơ: hồ sơ doanh nghiệp,
   chứng chỉ kèm tên chủ sở hữu và hạn, bằng chứng nhà máy, lô hàng đã xuất. Phần chưa kiểm tra sẽ không
   hiện là đã kiểm tra.

## Còn hai chỗ vẫn kể theo lối cũ

Nằm trong DB, chưa sửa vì nằm ngoài phạm vi bạn yêu cầu:

- `intro_i18n`: "Compare their products and request quotations to find the best options for your
  business needs."
- `body_i18n` (mục About this category): đoạn cuối vẫn viết theo kiểu Vexim đứng giữa, "request
  multiple quotations and receive assistance in coordinating communication". Đoạn này cũng là văn
  phong máy, câu dài và nhiều danh từ chung.

Cần thì viết lại hai phần này theo cùng giọng, thêm một migration nữa.
