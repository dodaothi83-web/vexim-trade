# Mua gói đẩy sản phẩm: kế hoạch chưa mở bán

Tài liệu này ghi quyết định sản phẩm, **không khẳng định đã triển khai chức năng mua/giữ chỗ/thanh toán**. Migration `20261047` chỉ lưu cấu hình. Không lấy giá trống làm giá 0; không tạo đơn hoặc cho mua khi chưa có thanh toán, điều khoản và kiểm thử staging. Luồng gửi yêu cầu mới và các thao tác tạo, duyệt, chạy lại gói thủ công đã bị loại khỏi ứng dụng; lịch sử yêu cầu và gói cũ được giữ lại. Migration 20261048 chặn tạo/kích hoạt qua cơ sở dữ liệu và phải được áp trước khi triển khai; không hiểu dữ liệu cũ là đơn đã thanh toán.

## Tình trạng thiết lập

Anh đang thiết lập, chưa đưa gói đẩy sản phẩm vào kinh doanh. Tạm ẩn mục khỏi menu NCC; đường dẫn cũ chỉ báo chưa mở và action cũ từ chối gửi yêu cầu. Không mở lại bằng biến môi trường trước khi có đơn, giữ chỗ, L1, chốt giao dịch và nghiệm thu. Quảng cáo banner là dịch vụ riêng, vẫn nhận form tư vấn theo yêu cầu của anh.

## Phạm vi

Gói này đẩy **thẻ sản phẩm** trên trang danh mục. Dịch vụ “Quảng cáo nổi bật” trên trang chủ là dịch vụ **banner doanh nghiệp** riêng, nhận đăng ký tư vấn qua biểu mẫu dịch vụ; không áp dụng quy tắc, giá hay thời hạn của gói đẩy sản phẩm cho banner. Vị trí và điều kiện banner chưa được xác định trong đặc tả này.

## Đã thống nhất

- Một sản phẩm thuộc NCC, trong một danh mục, 168 giờ từ khi kích hoạt. Số ô dựa trên sản phẩm công khai không demo trước lọc: mặc định <10 là 1, 10–30 là 2, >30 là 3. Tối đa 4 gói mỗi ô; các giá trị phải cấu hình được.
- Giá VND do admin cấu hình; đơn phải chốt một bản sao giá, đơn vị tiền, chính sách và điều kiện ở thời điểm tạo đơn. Giá thay đổi sau đó không tự thay đổi đơn cũ. Giá trống không mở bán.
- Giữ chỗ cấu hình được, mặc định 20 phút. Sau thời hạn, nếu chưa có xác nhận thanh toán, chỗ được trả về bể. Ước tính tỷ lệ chỉ là ảnh chụp tại thời điểm mua, không phải lượt xem hay bảo đảm.
- L1 phải đã duyệt, chưa thu hồi, NCC không bị khóa; chứng chỉ hết hạn không làm mất quyền mua. Không áp dụng khóa marketing chu kỳ L2/L3 trong đợt này. Đọc lỗi hoặc thiếu dữ liệu do hệ thống: giữ trạng thái đã biết và báo admin, không coi là bị thu hồi. Phải thiết kế trạng thái đã biết và kiểm toán rõ ràng, không coi việc không xác minh được là chứng cứ hợp lệ.
- L1 bị thu hồi trong thời gian chạy: ngừng phân phối ngay; xử lý tài chính theo điều khoản. Không thay đổi trạng thái gói dựa trên lỗi đọc. Phân biệt thu hồi thật với thiếu dữ liệu; mô hình verification hiện tại chưa có trạng thái thu hồi riêng và cần được thiết kế trước.
- Đo lường phụ thuộc đồng ý cookie và có thể thiếu; không gọi lượt đo được là số người xem.
- Tiền đến muộn: nếu còn chỗ và đủ điều kiện, kích hoạt; nếu hết chỗ hoặc cần kiểm tra, đưa vào hàng xử lý để NCC chọn ngày khác hoặc yêu cầu hoàn tiền; hoàn tiền thủ công, có lịch sử.

## Điều kiện kỹ thuật trước khi mở bán

1. Migration cho đơn, giữ chỗ, nhật ký trạng thái, bản chụp giá/điều khoản, nguồn thanh toán và đối soát. Tạo mã đơn duy nhất không tiết lộ thông tin NCC; kiểm tra định dạng khi chọn nhà cung cấp thanh toán.
2. Sử dụng giao dịch và khóa ở CSDL cho cả việc tạo giữ chỗ, hết hạn, thanh toán đến muộn và kích hoạt. Tính các khoảng thời gian 168 giờ chồng lấn, gồm gói cũ đang chạy/tạm dừng và giữ chỗ còn hiệu lực; xử lý khi số sản phẩm và giới hạn bể giảm. Không bán thêm khi đang vượt trần. Không sửa hoặc hủy gói cũ tự động.
3. Chỉ có luồng NCC tự mua; luồng tạo và duyệt thủ công bị vô hiệu. Migration 20261048 hiện chặn mọi INSERT và chuyển sang approved; phải được thay bằng cổng kích hoạt giao dịch đã được kiểm thử khi tích hợp mua hàng, không được bỏ chốt trước đó. Chỉ thông số máy chủ tin cậy được quyết định số ô, giá và bể; không tin dữ liệu từ form.
4. Định nghĩa nguồn dữ liệu thu hồi L1, khóa NCC và trạng thái đã xác thực gần nhất; kiểm tra quyền tài khoản/sở hữu ở server. Quyết định lưu cache và cảnh báo admin cho dữ liệu không thể đọc để thực hiện đúng quy tắc giữ trạng thái. Không suy L1 từ L2/L3 hay chứng chỉ.
5. Tích hợp **một** nhà cung cấp sau khi nhận tài liệu: xác thực webhook theo đúng chuẩn, kiểm tra mã đơn, tiền tệ và số tiền, định danh giao dịch duy nhất, xử lý idempotent/retry, đối soát giao dịch thiếu webhook, log an toàn. Không kích hoạt theo redirect trình duyệt hoặc webhook sai. Sai/thừa/thiếu tiền và giao dịch không khớp phải vào hàng đối soát, không tự kích hoạt.
6. Kiểm thử trên staging/Supabase thật: race cùng sản phẩm/bể, giao dịch lặp, webhook trễ/sai, hệ thống gián đoạn, giá thay đổi, L1 bị thu hồi và lỗi đọc, bể đầy/thu hẹp, quyền truy cập và dữ liệu NCC khác. PGlite/mocks không chứng minh khóa đồng thời hoặc cấu hình RLS thực tế.
7. Anh cung cấp điều khoản công khai, chính sách hoàn tiền, quy trình VAT và chọn nhà cung cấp. Chỉ mở bán sau khi đối soát gói cũ, nghiệm thu và cấu hình thanh toán thật. Secrets chỉ đặt tại môi trường triển khai, không đưa vào code/chat/log.

## Quyền quản lý và dữ liệu cũ

Admin không tạo/duyệt/chạy lại gói. Chỉ admin đang hoạt động có thể dừng gói do vi phạm, với lý do bắt buộc; migration 20261048 lưu lý do và thay trạng thái trong cùng giao dịch. Gói đang hoạt động tiếp tục tới hết hạn, không tự sửa dữ liệu. Nháp cũ không còn được duyệt; lịch sử yêu cầu còn được lưu để xử lý tồn đọng, không nhận yêu cầu mới. Mã giảm giá, đơn, giữ chỗ, xử lý hoàn tiền và thanh toán chưa được triển khai.
