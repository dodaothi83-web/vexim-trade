# Đợt 2 — thông báo theo mốc nghiệp vụ

Triển khai trên PR #5, tiếp nối `notification-email-audit.md`. Không có thay đổi về quyền duyệt, quy tắc công bố hoặc dữ liệu buyer được phép chia sẻ.

| Khi nào | Người nhận / kênh | Điều kiện và nội dung an toàn |
| --- | --- | --- |
| NCC **nộp** sản phẩm | Admin + sourcing đang hoạt động: email; hàng chờ CRM vẫn là nguồn sự thật | Không gửi khi tạo/sửa bản nháp hoặc tải tệp; chỉ sau DB chuyển `pending`. |
| Staff duyệt/yêu cầu sửa hồ sơ doanh nghiệp | Tài khoản NCC đang hoạt động, đúng `supplier_id`: email | Sau DB chuyển trạng thái; NCC chưa được mở cổng vẫn thấy yêu cầu bổ sung khi đăng nhập. Khi được mở quyền có thêm thông báo portal. Không đồng nghĩa duyệt xác minh/công khai. |
| Staff duyệt/yêu cầu sửa sản phẩm | Cùng tài khoản NCC: email và thông báo portal từ trạng thái review hiện tại | Chỉ sau review thủ công từ `pending`; approval **không tự bật** `ready_for_buyer`. Lời nhắn sửa được escape trong HTML. |
| Staff duyệt/yêu cầu sửa/từ chối chứng nhận | Cùng tài khoản NCC: email và thông báo portal | Chỉ sau review thủ công; email “đã kiểm bản sao” khẳng định **chưa công bố**. |
| Admin quyết định công bố/thu hồi chứng nhận | Cùng tài khoản NCC: email; portal hiển thị trạng thái công bố hiện tại | Công bố là quyết định thứ hai, có kiểm tra phạm vi/tệp/hạn; thao tác không thay đổi không gửi thư trùng. Thu hồi có email riêng, portal chuyển về “đã kiểm/chưa công bố”. |
| Staff duyệt/trả từng đánh giá xác minh | Cùng tài khoản NCC: email; thông báo portal hiện có | Chỉ sau quyết định ở từng đợt kiểm; không suy ra duyệt các bước khác, không công khai bằng chứng. |
| NCC được chọn cho RFQ | Email từ **địa chỉ nhân viên Vexim hợp lệ**, Reply-To RFQ; thông báo portal hiện có | Khi chọn NCC hoặc chuyển sang sampling với NCC chọn, chỉ nếu đã có lời mời email thật; không đưa buyer email/danh tính, access token, ghi chú nội bộ. Bấm chọn lại cùng trạng thái không gửi trùng. Đổi trạng thái thủ công không thể đặt `selected` để bỏ qua luồng này. |

Thông báo trong portal chỉ đọc các sản phẩm/chứng nhận của đúng NCC; khóa `product-*`, `cert-*`, `onboarding-approved` chỉ được đánh dấu đọc sau khi server kiểm lại quyền và thấy thông báo đó. Sản phẩm/chứng nhận dựa trên **trạng thái hiện tại** (không phải nhật ký đầy đủ các lần xét lại); cùng một sản phẩm/chứng nhận được duyệt lại sau khi người dùng đã đánh dấu đọc có thể giữ khóa đã đọc cũ cho tới khi có outbox sự kiện ở đợt 3. Quyền trước duyệt vẫn bị chặn ở portal. Không thêm migration cho đợt này.

Email là best-effort sau khi lưu trạng thái: lỗi email không đảo ngược quyết định của staff, được báo trong kết quả thao tác và log server; sản phẩm vẫn nằm trong hàng chờ CRM. `sent` nghĩa là Resend chấp nhận, **không phải đã phát tới hộp thư**. Đợt 3 mới bổ sung outbox bền vững, retry/dedupe qua sự kiện, và webhook delivery/bounce. Nếu thư chọn NCC bằng nút “Chọn NCC này” bị lỗi, CRM báo cần liên hệ thủ công; đường chuyển sampling ghi lỗi trong server log. Bấm lại quyết định không tự gửi trùng.

Bài kiểm tra: `check-supplier-notifications.mjs`, `check-supplier-self-registration.mjs`, `check-supplier-products.mjs`, `check-certificate-workflow.mjs`, `check-audit-pages.mjs`, `check-supplier-dashboard.mjs`, `check-rfq-email.mjs`, `check-mail-visibility.mjs`, `check-permissions.mjs`, `npm run typecheck`, `npm run build`. Chưa gửi email thật hoặc xác nhận bản production đã triển khai.
