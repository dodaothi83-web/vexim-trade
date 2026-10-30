# Kế hoạch tách sản phẩm cũ có hai grade

**DỪNG:** Anh đã chọn tự xử lý một sản phẩm bằng nút “Nhân bản cho grade khác” sau khi form mới hoàn tất. Không tiếp tục xây script, không chạy SQL hoặc sao lưu riêng cho việc tách này. Sản phẩm hai grade vẫn hiển thị nguyên trạng. Nội dung bên dưới chỉ lưu lại lịch sử đánh giá, không phải hướng dẫn thực thi.

## Quyết định của chủ dữ liệu

- Grade ở dòng đầu giữ ID và URL gốc, không chuyển hướng.
- Grade dòng thứ hai là sản phẩm mới với ID và URL riêng; sao chép ảnh, mô tả, điều khoản và chứng nhận, dùng đúng khoảng giá của dòng grade thứ hai và giữ trạng thái như sản phẩm gốc.
- RFQ cũ giữ liên kết với sản phẩm gốc; RFQ xác định rõ grade thứ hai được gắn sang sản phẩm mới.
- Sản phẩm mới phải vào sitemap khi thỏa điều kiện index và hiển thị công khai.

## Trạng thái

Chưa tách sản phẩm, chưa sao chép tệp, chưa sửa RFQ, chưa chạy migration. `lib/products/legacy-grade-split-plan.ts` chỉ lập kế hoạch từ dữ liệu được truyền vào; `lib/products/legacy-grade-split-baseline.ts` so sánh lại snapshot và kiểm kê liên quan trước khi thực thi. `lib/products/legacy-split-media-copy.ts` và adapter Supabase là phần chuẩn bị sao chép ảnh, chưa nối vào route, job hay script thực thi. Kiểm thử dùng fixture cục bộ, không tạo sản phẩm thật. Đây không phải lệnh chuyển đổi hay snapshot/backup database. Cần hoàn thành quy trình thực thi nguyên tử, kiểm thử staging và đối chiếu trước khi gửi script cho chủ dữ liệu. Anh sẽ sao lưu database và tự chạy script khi sẵn sàng.

Kiểm kê chỉ đọc ngày 29/10/2026 cho trường hợp đã báo: 2 dòng grade theo thứ tự 500 g/L và 550 g/L; 6 ảnh buyer thuộc sản phẩm; không có RFQ liên kết trực tiếp qua `source_product_id`; không có chứng nhận ghi ID đó trong mảng phạm vi sản phẩm; không có revision bảng giá mới. Đây là số liệu tại thời điểm đọc, có thể thay đổi. RFQ cũ không có `source_product_id` cần được rà riêng, không được tự gắn chỉ dựa vào tên tự do. Phạm vi chứng nhận supplier hoặc bằng chứng khác chưa được kết luận từ số đếm này.

## Ràng buộc Supabase Free

- Không yêu cầu nâng cấp, không dùng Supabase Branching, PITR hoặc backup tự động của gói trả phí. Kiểm thử logic bằng dữ liệu giả trong PGlite; đây không phải kiểm thử đồng thời hoặc RLS/storage của Supabase thật.
- Nếu cần staging Supabase thật, chỉ dùng một project riêng khi tài khoản còn suất Free và chủ dữ liệu đồng ý. Không tự tạo project, không giả định còn suất hoặc sao chép dữ liệu thật sang đó. Kiểm tra cấu hình và bảo mật trước khi dùng dữ liệu thử; không hướng staging vào database đang phục vụ khách.
- Trước khi thực thi, hướng dẫn anh tạo bản sao database độc lập và kiểm tra phục hồi trên môi trường cách ly. Supabase CLI có thể xuất roles, schema và data trên Free, nhưng cần đối chiếu các thành phần thực tế và quyền khôi phục; không coi fixture, snapshot kế hoạch hay một file xuất bảng là bản sao đầy đủ.
- Backup database không chứa byte của ảnh/tệp trong Storage. Sao lưu Storage riêng và xác minh tệp có thể đọc được. Bộ sao chép tính tổng byte gốc và số byte cần thêm theo preflight, bao gồm thumbnail; đây không phải kiểm tra quota khả dụng và không tính thay đổi đồng thời. Trước khi chạy cần tự đối chiếu quota Storage hiện tại vì bản sao ảnh sẽ dùng thêm dung lượng; không giả định đủ chỗ. Không đưa dữ liệu, khóa, mật khẩu hoặc chuỗi kết nối vào Git hay chat.
- Tài liệu tham khảo: [Supabase pricing](https://supabase.com/pricing), [database backups](https://supabase.com/docs/guides/platform/backups), [backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Các bảng dự kiến liên quan

Đây là danh sách **dự kiến**, chưa phải hướng dẫn chạy hoặc danh sách cuối cùng. Khi script thực sự sẵn sàng sẽ gửi lại danh sách chính xác, phân biệt bảng đọc và bảng có thể thay đổi, bao gồm ảnh hưởng gián tiếp qua trigger và Storage API.

| Bảng | Vai trò dự kiến |
| --- | --- |
| `public.supplier_products` | Cập nhật dòng grade đầu trên sản phẩm gốc; tạo sản phẩm grade thứ hai. Giữ ID gốc. |
| `public.media_assets` | Tạo metadata ảnh mới theo đường dẫn và ID mới, không thay hoặc xóa ảnh cũ. |
| `public.certificates` | Chỉ cập nhật phạm vi liên kết nếu có chứng nhận liên quan sau đối chiếu. |
| `public.rfqs` | Chỉ cập nhật `source_product_id` của RFQ đã xác nhận rõ grade thứ hai. |
| `public.audit_log` | Ghi nhật ký tách và các thay đổi liên quan. |
| `storage.objects` | Metadata do Storage API quản lý khi sao chép ảnh. Không sửa trực tiếp bảng này bằng SQL. |

Các bảng revision tên/giá, yêu cầu tạo sản phẩm, bản nháp/gửi duyệt mới nếu có và bảng sponsored sẽ cần **kiểm tra chỉ đọc** trước tách. Nếu có bản ghi liên quan hoặc xuất hiện quan hệ sản phẩm chưa biết, phải dừng và rà soát thay vì tự chuyển hay bỏ qua. Kiểm kê database thực tế ngày 29/10/2026 chưa thấy các revision/yêu cầu/sponsored gắn sản phẩm này, nhưng cần kiểm tra lại ngay trước thao tác. Danh sách có thể đổi nếu schema hoặc script đổi.

CSV là bản đối chiếu hữu ích nhưng **không phải backup database đầy đủ**: không chứa đầy đủ schema, constraint, trigger, quyền, hàm và các thành phần khác. CSV metadata Storage cũng không chứa byte ảnh. Cần bản sao database đầy đủ, bản sao ảnh Storage riêng và kế hoạch khôi phục đã thử trên môi trường cách ly. Không xuất CSV nhạy cảm vào repo hoặc chia sẻ thông tin đăng nhập qua chat.

## Nguyên tắc triển khai an toàn

1. Đối chiếu sản phẩm, trạng thái, URL và thứ tự `grade_rows` hiện tại. Nếu dữ liệu đã thay đổi so với bản được duyệt, dừng và lập kế hoạch lại. Giữ nguyên ID cũ cho grade đầu, giữ đường dẫn cũ và RFQ mặc định. Grade thứ hai có ID mới do bước thực thi cấp và kiểm tra không trùng. Không tự chuyển khoảng giá thành một giá hay tạo tier số lượng từ giá thấp/cao.
2. Lưu nguyên bản từng dòng grade và các trường cũ cần bảo toàn. Sao chép đầy đủ mô tả, rich text, điều khoản, chứng nhận, các trường hiện có, ngôn ngữ và quyền hiển thị; không xóa, reset hoặc thay sản phẩm gốc. Cần rà nội dung và tên đang nhắc nhiều grade, vì sao chép nguyên văn có thể gây hiểu nhầm. Không tự tạo bản dịch hoặc tự sửa dữ liệu đã duyệt.
3. Mỗi ảnh mới cần bản sao byte riêng trong `products/<ID mới>/...`, metadata và ID ảnh riêng, ánh xạ đúng ảnh đại diện, thumbnails, thứ tự và trạng thái. Không dùng chung storage path: public media tra cứu theo đường dẫn và thao tác xóa có thể ảnh hưởng ảnh gốc. Bộ sao chép đã kiểm thử chỉ đọc trước tất cả tệp, kiểm tra tham chiếu và SHA-256, ghi không ghi đè, xác minh lại, và retry một bản sao dở dang. Bộ này không tự xóa tệp hoặc tạo metadata, không sử dụng fallback ổ đĩa và chưa chứng minh an toàn trên Supabase thực tế. Không tự xóa file gốc; file sao chép dở dang chỉ được xử lý sau khi xác định chắc chắn không có dữ liệu tham chiếu. Giao dịch database vẫn phải đối chiếu lại tham chiếu và snapshot.
4. Với chứng nhận phạm vi sản phẩm, chỉ bổ sung ID mới vào cùng mức phạm vi đã được duyệt/đề nghị cho sản phẩm gốc sau khi đối chiếu chứng nhận thực tế. Không biến chứng nhận chỉ được đề nghị thành đã duyệt, không mở công khai chứng nhận nội bộ. Kiểm tra tài liệu và scope supplier liên quan, không chỉ trường chứng nhận dạng text.
5. Với RFQ liên kết trực tiếp bằng `source_product_id`, chỉ gợi ý chuyển khi `specs.grade` khớp chính xác grade thứ hai; giữ nguyên nếu là grade đầu. Giá trị không rõ, cả hai grade, text tự do hoặc RFQ không có liên kết định danh cần rà thủ công và giữ nguyên trong khi chờ. Một gợi ý không tự thay RFQ. Bước chuyển thực tế cần đối chiếu ID, grade và `updated_at` dưới khóa và lưu audit. Không đổi mô tả gốc hay lịch sử trao đổi.
6. Chỉ công khai sau khi ảnh và các điều kiện buyer hợp lệ. Giữ trạng thái như bản gốc theo chỉ dẫn, đồng thời kiểm tra supplier, category, quyền công khai, nguồn ảnh và phạm vi chứng nhận. Sitemap hiện lấy danh sách sản phẩm public theo category và ID; test fixture kiểm tra cả URL cũ và URL mới. Cần kiểm tra sitemap thực tế sau triển khai, không ép đưa sản phẩm không đủ điều kiện vào sitemap.
7. Phải có bản đối chiếu trước/sau cho ID/URL, giá từng grade, hình ảnh, nội dung, chứng nhận, trạng thái, RFQ và sitemap. Bộ so sánh baseline đã kiểm thử việc phát hiện thay đổi sản phẩm, thứ tự grade, ảnh, RFQ, chứng nhận, category và mã/đường dẫn đích bị chiếm, không giữ access token RFQ. Nó là kiểm tra chỉ đọc, không tự khóa hay bảo đảm danh sách được tải đủ. Bước ghi vẫn cần idempotency, chống trùng, tải danh sách đầy đủ và so sánh lại dưới khóa, xử lý cả bản ghi mới thêm đồng thời, rollback database khi lỗi, nhật ký và kế hoạch phục hồi. Khóa theo hàng không đủ nếu chứng nhận mới được thêm vào mảng phạm vi đồng thời; phải thiết kế và thử mức cách ly/khóa thích hợp trên PostgreSQL thật. Sao chép object storage không cùng giao dịch với PostgreSQL: chưa được coi là an toàn chỉ vì database rollback được.

Preview buyer hiện cố ý giữ projection cũ cho sản phẩm nhiều grade chưa ánh xạ. Không bỏ lớp bảo vệ này cho tới khi bước tách và đối chiếu hoàn tất. SQL62/63 vẫn chưa sẵn sàng, không chạy lúc này.
