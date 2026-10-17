# Lưu và công khai trong CRM

## Nhà cung cấp

- Nhập tên rồi **Lưu nhà cung cấp**: tạo bản nháp ngay; liên hệ/mặt hàng/ảnh có thể bổ sung sau. Trên trang sửa, **Lưu thay đổi** cập nhật nội dung và **giữ nguyên trạng thái hiện tại**.
- Trạng thái chỉ chuyển khi chọn nút riêng ở **Bước tiếp theo**; nút đó lưu cả thay đổi đang nhập. Luồng: Nháp → Đã nộp → Đang kiểm → Công khai (chỉ người có quyền `suppliers.publish`). Hồ sơ công khai nhưng chưa duyệt L1 hiện nhãn “Under audit/Chưa xác minh”, **không** mang huy hiệu L1/L2. Chờ quyết định nghiệp vụ về việc có cho công khai L0 hay không.
- Form thông tin **không thể tự gán L1/L2/L3**: chỉ quy trình xác minh ở trang chi tiết mới duyệt và cấp mức. Tạo mới mặc định L0, kể cả request giả mạo.
- Upload ảnh đại diện/bìa độc lập với nút lưu form; ảnh bổ sung nằm trong mục riêng.

## Danh mục

- Chọn danh mục ở danh sách bên trái; các mục cần viết nằm trên cùng. Bảng thông số/FAQ/SEO nằm trong phần mở rộng.
- Danh mục mới **luôn là bản nháp**. **Lưu thay đổi** không tự công khai hoặc ẩn. Người có quyền `categories.publish` dùng riêng **Công khai trang/Ẩn khỏi website**; thao tác này cũng lưu nội dung đang nhập. Ảnh bìa chỉ tải được sau khi danh mục có ID.
- Đổi đường dẫn đã xuất bản vẫn theo cơ chế giữ slug cũ và chuyển tiếp 301; bảng dữ liệu nâng cao còn được lưu nhưng bộ lọc MVP chưa hoạt động không xuất hiện trong luồng chính.

## AI soạn nháp

Khi máy chủ có `OPENAI_API_KEY`, nút **AI soạn giới thiệu** xuất hiện ở cả hai form. Nó chỉ dùng những dữ kiện người dùng đã nhập (tên/mặt hàng/địa điểm hoặc thông tin mua hàng), tạo một đoạn tiếng Anh ngắn, **chỉ điền ô nháp**, không tự lưu/duyệt/công khai. Người dùng kiểm tra tính đúng đắn trước khi lưu. Nếu không có key, không hiện nút; khi nhà cung cấp AI gặp lỗi, người dùng vẫn có thể nhập/lưu thủ công. Endpoint chỉ nhận phiên đăng nhập đúng quyền, giới hạn 10 lượt/giờ/người trên từng instance; hiện chưa có rate limit phân tán. Không gửi giấy tờ, ảnh hay ghi chú nội bộ vào AI.

Kiểm tra cục bộ: `node scripts/check-editor-workflow.mjs && npm run typecheck && npm run build`. Bản preview không kết nối được Supabase production hoặc AI provider; cần thử thao tác có đăng nhập trên đúng deployment.
