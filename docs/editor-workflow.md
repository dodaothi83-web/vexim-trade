# Lưu và công khai trong CRM

## Nhà cung cấp

- Nhập tên rồi **Lưu nhà cung cấp**: tạo bản nháp ngay; liên hệ/mặt hàng/ảnh có thể bổ sung sau. Trên trang sửa, **Lưu thay đổi** cập nhật nội dung và **giữ nguyên trạng thái hiện tại**.
- Trạng thái chỉ chuyển khi chọn nút riêng ở **Bước tiếp theo**; nút đó lưu cả thay đổi đang nhập. Luồng: Nháp → Đã nộp → Đang kiểm → Công khai (chỉ người có quyền `suppliers.publish`). Hồ sơ công khai nhưng chưa duyệt đánh giá nào hiện nhãn “Under audit/Chưa xác minh”, **không** nhận huy hiệu của đánh giá chưa duyệt. Chờ quyết định nghiệp vụ về việc có cho công khai L0 hay không.
- Form thông tin **không thể tự gán cấp xác minh**: chỉ các trang kiểm toán độc lập Giấy tờ / Nhà máy / Lịch sử giao hàng mới duyệt từng đánh giá; chỉ hiển thị huy hiệu nào đã duyệt. Tạo mới chưa xác minh, kể cả request giả mạo.
- Upload ảnh đại diện/bìa độc lập với nút lưu form; ảnh bổ sung nằm trong mục riêng.

## Danh mục

- Màn hình mặc định là **danh sách dạng cây** (lọc theo trạng thái, kéo–thả sắp xếp trong cùng nhóm ngành); bấm **Sửa** mới vào form. Form chia theo tab (Cơ bản / Nội dung & ảnh / Thông số / Trường sản phẩm / Mua hàng & FAQ / SEO), cột phải có checklist công khai và xem trước trực tiếp.
- Thêm danh mục qua hộp thoại 3 ô (tên · đường dẫn · danh mục cha): hệ thống tạo **bản nháp** rồi tự mở màn hình sửa, nên tải ảnh bìa được ngay.
- **Lưu bản nháp** không tự công khai hoặc ẩn. **Công khai/Ẩn khỏi website** là quyết định riêng áp dụng cho **bản đã lưu**: còn thay đổi chưa lưu thì nút bị khoá kèm lý do hiển thị ngay trên thanh hành động (cùng các điều kiện: đủ mục bắt buộc trong checklist, người công khai khác người sửa cuối).
- Đổi đường dẫn đã xuất bản vẫn theo cơ chế giữ slug cũ và chuyển tiếp 301; bảng dữ liệu nâng cao còn được lưu nhưng bộ lọc MVP chưa hoạt động không xuất hiện trong luồng chính.

## AI soạn nháp

Khi máy chủ có `OPENAI_API_KEY`, nút **AI soạn giới thiệu** xuất hiện ở cả hai form. Nó chỉ dùng những dữ kiện người dùng đã nhập (tên/mặt hàng/địa điểm hoặc thông tin mua hàng), tạo một đoạn tiếng Anh ngắn, **chỉ điền ô nháp**, không tự lưu/duyệt/công khai. Người dùng kiểm tra tính đúng đắn trước khi lưu. Nếu không có key, không hiện nút; khi nhà cung cấp AI gặp lỗi, người dùng vẫn có thể nhập/lưu thủ công. Endpoint chỉ nhận phiên đăng nhập đúng quyền, giới hạn 10 lượt/giờ/người trên từng instance; hiện chưa có rate limit phân tán. Không gửi giấy tờ, ảnh hay ghi chú nội bộ vào AI.

Kiểm tra cục bộ: `node scripts/check-editor-workflow.mjs && npm run typecheck && npm run build`. Bản preview không kết nối được Supabase production hoặc AI provider; cần thử thao tác có đăng nhập trên đúng deployment.
