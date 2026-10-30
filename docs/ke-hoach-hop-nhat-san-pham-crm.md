# Hợp nhất quản lý sản phẩm CRM

## Mục tiêu

Danh sách CRM là điểm vào duy nhất cho sản phẩm hiện có và các bản cần xử lý. Nhà cung cấp và CRM sử dụng cùng cách trình bày thông tin sản phẩm; nhân viên có thể tạo, xem, đối chiếu, sửa và xử lý duyệt theo quyền của mình. Giá, tên và nội dung phải được kiểm tra trong ngữ cảnh đúng của bản gửi, không tạo những lối vận hành song song khó tìm.

## Đã làm trong bước đầu

- Danh sách CRM cho admin/reviewer hiển thị tình trạng chờ của bản gửi form và các bản giá/tên cũ cùng với trạng thái sản phẩm cũ. Một sản phẩm được tính một lần trong bộ lọc chờ, kể cả khi có nhiều việc phải xử lý.
- Với hồ sơ riêng tư chưa có tên trong sản phẩm gốc, tên, danh mục và ảnh của bản gửi được hiển thị có nhãn là chưa duyệt. Ảnh lấy qua đường dẫn riêng tư kiểm tra quyền; không xuất bản ảnh hoặc thay đổi bản gốc.
- Nút kiểm tra dẫn đến đúng bản gửi form; những bản giá/tên cũ vẫn dẫn vào luồng xử lý hiện hữu để không bị bỏ sót. Hai nút hàng đợi không còn ở đầu danh sách; khi không đối chiếu được hàng đợi, có cảnh báo và đường kiểm tra dự phòng.
- Form NCC tự gọi dịch tên sau khi ngừng nhập; CRM tự tạo lại gợi ý theo snapshot đang chờ, không cần bấm nút. Chỉ tên được gửi cho dịch vụ AI, không gửi giá hay mô tả. Kết quả là gợi ý tạm thời, không được lưu trong bản nháp; CRM kiểm tra/chỉnh trước khi duyệt. Hai lần dịch có thể cho kết quả khác nhau.
- Dịch tự động yêu cầu cấu hình OpenAI và Redis phân tán (UPSTASH_REDIS_REST_URL/TOKEN hoặc KV_REST_API_URL/TOKEN); production từ chối gọi AI nếu giới hạn không hoạt động. Lỗi dịch không tự xuất bản, không chặn gửi form; nhân viên có thể nhập tên tiếng Anh khi duyệt. Cần kiểm tra cấu hình và luồng thực tế sau khi triển khai, không giả định đã có.
- Các thay đổi này chỉ là tích hợp danh sách và dịch tự động; màn tạo/sửa CRM, màn duyệt chi tiết và chuyển đổi hồ sơ cũ chưa được thay thế.

## Các phần còn phải thực hiện

1. **Form CRM thống nhất:** xây adapter và server actions riêng cho nhân viên dựa trên quyền đã xác minh, không dùng quyền của NCC để ghi thay. Đưa trang tạo, sửa, duyệt và phần dịch/chứng nhận/tệp của CRM vào quy trình mới, đảm bảo không mất khả năng quản lý đang có. Phân biệt bản đang công khai, bản nháp và snapshot chờ duyệt; bảo vệ xung đột phiên và thay đổi đồng thời.
2. **Đối chiếu dữ liệu cũ:** đã bổ sung màn xem trước không ghi dữ liệu, có form dự kiến theo từng grade và phần dữ liệu gốc; chưa tạo/tách sản phẩm. Theo quyết định mới của người dùng, giá cũ là demo, không cần giữ lại trong bảng giá mới: để trống để NCC nhập giá và mức số lượng chính thức sau. Không tự suy đoán đơn vị MOQ, năng lực dạng văn bản, chứng nhận, thông số ngoài form, dịch thuật hay ảnh; các phần này cần đối chiếu và xử lý bảo toàn.
3. **Sản phẩm nhiều grade:** theo lựa chọn của người dùng, hướng tới một sản phẩm mới cho mỗi grade. Trước hết lập bảng đối chiếu nguồn → grade → bản mới, giữ nguyên từng dòng gốc và giá/đơn vị gốc; không tự phân bổ giá, MOQ, ảnh hay chứng nhận chưa rõ. Tạo mới phải chống tạo trùng, bảo toàn liên hệ NCC và có kiểm tra/duyệt từng bản. Giữ hồ sơ và URL cũ cho đến khi có quyết định chuyển đổi công khai riêng; không tự xóa, ẩn hoặc redirect sản phẩm cũ.
4. **Chuyển đổi và buyer:** quy định rõ sau duyệt bản mới sản phẩm/giá/ảnh nào được công khai, cách giữ liên kết cũ, RFQ và lịch sử, tránh công khai trùng hoặc thay đổi consent. Chỉ cho phép chuyển đổi khi có đối chiếu và phê duyệt phù hợp; không để người xem nhầm dữ liệu mới chưa duyệt với bản buyer đang thấy.
5. **Kiểm thử:** kiểm tra phân quyền admin/reviewer/sales/NCC; hàng chờ mới và cũ; form tạo/sửa; các trường hợp nhiều grade, giá khoảng, đơn vị, ảnh riêng tư, chứng nhận và dữ liệu quá dài; retry và tranh chấp; trạng thái buyer trước/sau duyệt; xử lý lỗi và không mất dữ liệu. Bản thử mô phỏng không thay thế kiểm tra thực tế có kiểm soát.

Không chạy migration, tạo/tách hồ sơ, thay đổi giá/ảnh/trạng thái công khai, deploy hoặc chuyển đổi dữ liệu production chỉ vì tài liệu này tồn tại. Mọi thao tác production cần được xác nhận riêng.
