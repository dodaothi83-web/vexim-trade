# Kế hoạch tách sản phẩm cũ có hai grade

## Quyết định của chủ dữ liệu

- Grade ở dòng đầu giữ ID và URL gốc, không chuyển hướng.
- Grade dòng thứ hai là sản phẩm mới với ID và URL riêng; sao chép ảnh, mô tả, điều khoản và chứng nhận, dùng đúng khoảng giá của dòng grade thứ hai và giữ trạng thái như sản phẩm gốc.
- RFQ cũ giữ liên kết với sản phẩm gốc; RFQ xác định rõ grade thứ hai được gắn sang sản phẩm mới.
- Sản phẩm mới phải vào sitemap khi thỏa điều kiện index và hiển thị công khai.

## Trạng thái

Chưa tách sản phẩm, chưa sao chép tệp, chưa sửa RFQ, chưa chạy migration. `lib/products/legacy-grade-split-plan.ts` chỉ lập kế hoạch từ dữ liệu được truyền vào, không kết nối database hoặc storage. Kiểm thử dùng fixture cục bộ, không tạo sản phẩm thật. Đây không phải lệnh chuyển đổi hay snapshot/backup database. Cần hoàn thành quy trình thực thi nguyên tử, kiểm thử staging và đối chiếu trước khi chủ dữ liệu chạy bất kỳ bước production nào.

Kiểm kê chỉ đọc ngày 29/10/2026 cho trường hợp đã báo: 2 dòng grade theo thứ tự 500 g/L và 550 g/L; 6 ảnh buyer thuộc sản phẩm; không có RFQ liên kết trực tiếp qua `source_product_id`; không có chứng nhận ghi ID đó trong mảng phạm vi sản phẩm; không có revision bảng giá mới. Đây là số liệu tại thời điểm đọc, có thể thay đổi. RFQ cũ không có `source_product_id` cần được rà riêng, không được tự gắn chỉ dựa vào tên tự do. Phạm vi chứng nhận supplier hoặc bằng chứng khác chưa được kết luận từ số đếm này.

## Nguyên tắc triển khai an toàn

1. Đối chiếu sản phẩm, trạng thái, URL và thứ tự `grade_rows` hiện tại. Nếu dữ liệu đã thay đổi so với bản được duyệt, dừng và lập kế hoạch lại. Giữ nguyên ID cũ cho grade đầu, giữ đường dẫn cũ và RFQ mặc định. Grade thứ hai có ID mới do bước thực thi cấp và kiểm tra không trùng. Không tự chuyển khoảng giá thành một giá hay tạo tier số lượng từ giá thấp/cao.
2. Lưu nguyên bản từng dòng grade và các trường cũ cần bảo toàn. Sao chép đầy đủ mô tả, rich text, điều khoản, chứng nhận, các trường hiện có, ngôn ngữ và quyền hiển thị; không xóa, reset hoặc thay sản phẩm gốc. Cần rà nội dung và tên đang nhắc nhiều grade, vì sao chép nguyên văn có thể gây hiểu nhầm. Không tự tạo bản dịch hoặc tự sửa dữ liệu đã duyệt.
3. Mỗi ảnh mới cần bản sao byte riêng trong `products/<ID mới>/...`, metadata và ID ảnh riêng, ánh xạ đúng ảnh đại diện, thumbnails, thứ tự và trạng thái. Không dùng chung storage path: public media tra cứu theo đường dẫn và thao tác xóa có thể ảnh hưởng ảnh gốc. Kiểm tra số lượng, hash, quyền và khả năng đọc trước khi cho phép công khai. Xử lý lỗi, retry và dọn file mồ côi có kiểm soát; tuyệt đối không xóa file gốc.
4. Với chứng nhận phạm vi sản phẩm, chỉ bổ sung ID mới vào cùng mức phạm vi đã được duyệt/đề nghị cho sản phẩm gốc sau khi đối chiếu chứng nhận thực tế. Không biến chứng nhận chỉ được đề nghị thành đã duyệt, không mở công khai chứng nhận nội bộ. Kiểm tra tài liệu và scope supplier liên quan, không chỉ trường chứng nhận dạng text.
5. Với RFQ liên kết trực tiếp bằng `source_product_id`, chỉ gợi ý chuyển khi `specs.grade` khớp chính xác grade thứ hai; giữ nguyên nếu là grade đầu. Giá trị không rõ, cả hai grade, text tự do hoặc RFQ không có liên kết định danh cần rà thủ công và giữ nguyên trong khi chờ. Một gợi ý không tự thay RFQ. Bước chuyển thực tế cần đối chiếu ID, grade và `updated_at` dưới khóa và lưu audit. Không đổi mô tả gốc hay lịch sử trao đổi.
6. Chỉ công khai sau khi ảnh và các điều kiện buyer hợp lệ. Giữ trạng thái như bản gốc theo chỉ dẫn, đồng thời kiểm tra supplier, category, quyền công khai, nguồn ảnh và phạm vi chứng nhận. Sitemap hiện lấy danh sách sản phẩm public theo category và ID; test fixture kiểm tra cả URL cũ và URL mới. Cần kiểm tra sitemap thực tế sau triển khai, không ép đưa sản phẩm không đủ điều kiện vào sitemap.
7. Phải có bản đối chiếu trước/sau cho ID/URL, giá từng grade, hình ảnh, nội dung, chứng nhận, trạng thái, RFQ và sitemap. Bước ghi cần idempotency, chống trùng, khóa và kiểm tra đầy đủ snapshot, rollback database khi lỗi, kiểm soát đồng thời, nhật ký và kế hoạch phục hồi. Sao chép object storage không cùng giao dịch với PostgreSQL: chưa được coi là an toàn chỉ vì database rollback được.

Preview buyer hiện cố ý giữ projection cũ cho sản phẩm nhiều grade chưa ánh xạ. Không bỏ lớp bảo vệ này cho tới khi bước tách và đối chiếu hoàn tất. SQL62/63 vẫn chưa sẵn sàng, không chạy lúc này.
