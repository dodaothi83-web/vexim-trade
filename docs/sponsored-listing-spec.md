# Đẩy sản phẩm: đặc tả cơ chế

Chốt ngày 23/10/2026. Tài liệu này là nguồn duy nhất cho cơ chế bán và hiển thị gói đẩy sản phẩm. Mọi thay đổi về số suất, thời hạn, cách luân phiên hoặc nhãn hiển thị phải sửa ở đây trước.

## 1. Thuật ngữ

| Phía | Từ dùng | Ghi chú |
|---|---|---|
| Nhà cung cấp | **Đẩy sản phẩm** | Tên gói và tên nút trong cổng nhà cung cấp |
| Buyer | **Tài trợ / Sponsored** | Nhãn trên thẻ sản phẩm, luôn hiện sẵn |
| Nội bộ | **Vùng đẩy** | Dải thẻ trả tiền ở đầu trang danh mục hoặc trang chủ |
| Nội bộ | **Bể gói** | Tổng số gói bán ra đồng thời, lớn hơn số thẻ hiển thị |

Không dùng "đẩy tin". Một gói luôn gắn với đúng một sản phẩm, không gắn với một tin rao hay một danh mục.

## 2. Gói bán

- Một gói là **một lượt đẩy cho một sản phẩm, dài đúng 7 ngày (168 giờ)**, tính liên tục cả ngày lẫn đêm để phủ buyer ở mọi múi giờ.
- Mốc thời gian lưu theo UTC, so sánh ở máy chủ. Không cắt theo ngày Việt Nam, vì buyer mua hàng phần lớn ở múi giờ khác.
- Hết 168 giờ, gói tự rời vùng đẩy. Sản phẩm **trở về đúng vị trí theo xác minh** trong lưới tự nhiên, không bị ẩn, không bị hạ xuống cuối.
- Một sản phẩm chỉ có một lượt đẩy trong cùng thời điểm. Một nhà cung cấp tối đa hai lượt cùng lúc.

## 3. Suất hiển thị

| Bề mặt | Số thẻ tài trợ tối đa | Bể gói bán ra | Tỷ lệ hiển thị kỳ vọng |
|---|---|---|---|
| Trang danh mục | 3 | 12 | khoảng 1/4 số lượt xem trang |
| Trang chủ | 2 | 8 | khoảng 1/4 số lượt xem trang |

Bể gói gấp bốn lần số suất để nhiều nhà cung cấp mua được trong cùng một tuần mà bố cục không đổi. Đổi lại, mỗi gói chỉ xuất hiện khoảng một phần tư số lượt xem trang. Con số này phải nói rõ trong điều kiện bán, không được hứa "luôn đứng đầu".

**Hết bể thì ngừng bán.** Không bán thêm rồi đẩy người trả tiền trước ra khỏi vùng hiển thị. Đây là điểm khác Chợ Tốt có chủ ý: bên đó nguồn tin không giới hạn nên đẩy thêm chỉ làm tin cũ trôi xuống, còn ở đây vùng đẩy có hạn nên bán quá bể là bán thứ không còn chỗ hiển thị.

## 4. Luân phiên trong vùng đẩy

Vùng đẩy chia thành các **cửa sổ luân phiên 10 phút**. Trong một cửa sổ, thứ tự và tập thẻ được chọn bằng hàm băm của `(mốc cửa sổ, id gói)`. Sang cửa sổ sau, thứ tự đổi. Sau 7 ngày, mỗi gói nhận xấp xỉ cùng số lượt hiển thị.

Ba lý do chọn cửa sổ thay vì đảo ngẫu nhiên theo từng lượt tải:

1. Mọi người xem trong cùng mười phút thấy cùng một bố cục, nên không có cảm giác thẻ nhảy lung tung khi mở lại trang.
2. Bố cục tính được ở máy chủ và không đổi giữa các lần dựng, nên không lệch giữa HTML gửi đi và phần chạy trên trình duyệt.
3. Cân bằng hiển thị kiểm chứng được bằng số, không phụ thuộc may rủi của từng lượt chia.

Đảo ngẫu nhiên theo từng lượt F5 vẫn cho tỷ lệ tương đương về lâu dài nhưng không kiểm chứng được trong một tuần, và làm mỗi lần tải trang cho ra một bố cục khác nhau dù cùng một người xem. Nếu sau này cần đổi, chỉ đổi hàm chọn, không đổi dữ liệu.

Mô phỏng 1.008 cửa sổ của một tuần với bể 12 gói và 3 suất: mỗi gói nhận từ 239 đến 268 lượt hiển thị, quanh mức 252, lệch dưới 6 phần trăm. Đó là mức cân bằng đủ tốt cho một tuần bán, và kiểm lại được bất cứ lúc nào bằng cùng phép tính.

Thứ tự trong vùng đẩy **không phụ thuộc số tiền, ngày mua hay giờ sửa giá**. Mọi gói trong cùng một cửa sổ có cùng cơ hội.

## 5. Lưới tự nhiên

Lưới tự nhiên bên dưới **không luân phiên ngẫu nhiên và không bán vị trí**. Thứ hạng giữ nguyên: mức xác minh trước, sau đó luân phiên nhà cung cấp, không xếp theo giờ cập nhật.

Lý do: đây là thứ buyer B2B dùng để đọc mức độ tin cậy. Xếp theo độ mới sẽ khiến nhà cung cấp nào sửa giá thường xuyên là lên đầu, và khi đó họ không cần mua gói nào cả.

## 6. Luật cố định

- Sản phẩm muốn đẩy vẫn phải qua đủ bốn cổng công khai: hồ sơ được duyệt, sẵn sàng cho buyer kèm ảnh hoặc catalogue, thuộc danh mục đã publish, nhà cung cấp đã publish và không phải hồ sơ demo. Trả tiền không mua được quyền vượt cổng.
- Sản phẩm trong vùng đẩy **không lặp lại** ở lưới tự nhiên bên dưới.
- Buyer đang lọc thì thẻ tài trợ cũng phải khớp bộ lọc. Không gói nào khớp thì ẩn cả vùng, không nhồi một sản phẩm không liên quan vào chỗ trống.
- Nhãn **Tài trợ / Sponsored** hiện sẵn trên thẻ, không cần rê chuột, ở cả hai ngôn ngữ, kèm câu nói rõ đây là vị trí trả tiền và không phải kết quả xác minh.
- Gói không làm thay đổi huy hiệu xác minh, không mở thêm giấy tờ, không đổi hạng trong lưới tự nhiên.
- Danh mục chưa publish, sản phẩm chưa sẵn sàng, hoặc nhà cung cấp bị tạm dừng thì gói không hiển thị, kể cả khi còn hạn.

## 7. Đo lường

- Ghi nhận lượt hiển thị khi ít nhất một nửa thẻ nằm trong khung nhìn đủ 800ms, và ghi nhận lượt bấm khi buyer mở trang chi tiết sản phẩm.
- Mỗi tab chỉ ghi một sự kiện cùng loại cho mỗi gói trong 30 phút. Số liệu lưu ở bảng riêng, không trộn vào bộ đếm tự nhiên hay báo cáo RFQ.
- Số liệu dùng để đối soát và để chứng minh hiệu quả, **không dùng để tính tiền theo lượt bấm**. Chu kỳ mua nông sản kéo dài nhiều tháng, tính theo lượt bấm là tự phạt mình.

## 8. Vận hành

- Giai đoạn đầu: CRM tạo gói, admin Vexim duyệt bằng tay. Chưa mở tự phục vụ.
- Chưa có thanh toán, hoá đơn, hoàn tiền tự động. Thu tiền ngoài hệ thống, ghi nhận bằng trạng thái đã duyệt.
- Muốn tạm dừng một gói: đổi trạng thái sang `paused`, vùng đẩy tự bỏ gói đó ở lượt dựng kế tiếp.
- Mở tự phục vụ khi đã chạy đủ số gói để biết tỷ lệ hiển thị thật, và khi có thanh toán cùng hàng chờ duyệt.

## 9. Chưa nằm trong phạm vi

Thanh toán trực tuyến, hoá đơn, hoàn tiền, chống gian lận nâng cao, báo cáo tách riêng trả phí và tự nhiên cho nhà cung cấp, cùng việc mở cổng tự đăng ký gói. Những phần này phải làm trước khi bán đại trà, nhưng không chặn việc chạy thử vài gói bằng tay.

## 10. Hạ tầng

Bảng và ràng buộc nằm ở `supabase/migrations/20261028_sponsored_product_push.sql`. Migration này chỉ tạo chỗ chứa và chặn sai sót, không tạo gói nào và không bật hiển thị. Bảng thử nghiệm cũ `sponsored_pilot_campaigns` giữ nguyên, chỉ dùng ở staging, và sẽ bỏ sau khi cơ chế mới chạy ổn định.
