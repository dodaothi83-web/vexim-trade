# Đọc đầy đủ dữ liệu catalogue — giai đoạn 1

## Phạm vi

Các đường đọc Supabase cho sản phẩm, nhà cung cấp, danh mục, dữ liệu kiểm tra danh mục, ảnh/tài liệu, xác minh và chứng nhận dùng phân trang theo UUID tăng dần. Danh sách gói tài trợ và báo cáo ngày cũng được đọc đủ; báo cáo có khoá ghép `(push_id, day, event_type)`. Các danh sách không thuộc catalogue/RFQ khác chưa được rà toàn bộ trong thay đổi này.

PostgREST có thể giới hạn số dòng trả về thấp hơn số yêu cầu. Vì vậy không kết thúc khi trang ngắn: tiếp tục đến trang rỗng. Nếu một trang hoặc lô lỗi, hàm đọc báo lỗi thay vì trả danh sách dở dang; tìm kiếm báo khi không tải được hoặc chỉ tải được một phần. Lô `IN` tối đa 80 mã và tối đa bốn lô chạy đồng thời ở mỗi lần đọc. Trật tự phân trang không tiến hoặc trùng khoá được báo lỗi.

Trang chủ và các danh mục trong cùng một yêu cầu chia sẻ catalogue ở máy chủ; sản phẩm, dữ liệu xác minh, ảnh và chứng nhận không còn bị đọc lại cho từng danh mục. Các lời gọi cùng yêu cầu dùng chung dữ liệu ảnh/chứng nhận đang tải và quyết định danh mục của mỗi sản phẩm. Trọng số, tầng xác minh, quy tắc xen kẽ và giới hạn thẻ vẫn giữ như cũ.

Để đọc theo UUID rồi sắp xếp lại, thứ tự tên nguồn hiện dùng so sánh tiếng Việt trong ứng dụng thay vì collation tên của CSDL; hai cách có thể khác. Những thẻ có cùng tầng, điểm và tên công khai vẫn phụ thuộc thứ tự nguồn, nên có thể đổi chỗ; bốn sản phẩm tóm tắt hoặc ảnh trong gallery của một số NCC cũng có thể thay đổi theo thứ tự nguồn. UUID được dùng để ổn định trường hợp hoà. Cần so sánh với dữ liệu staging, nhất là tên có dấu và trùng tên; không coi kiểm thử giả lập là chứng minh thứ tự production giống hệt.

## Giới hạn cần biết

- Keyset tránh việc `OFFSET` bị xê dịch khi thêm/xoá dòng phía trước con trỏ, nhưng nhiều request PostgREST **không phải một transaction snapshot**. Dòng mới xuất hiện trước con trỏ hoặc thay đổi trạng thái trong lúc đọc vẫn có thể làm kết quả khác so với một thời điểm duy nhất; muốn bảo đảm snapshot cần một giải pháp CSDL riêng.
- Catalogue vẫn được đọc và xếp hạng trong bộ nhớ máy chủ. Giai đoạn này loại bỏ rủi ro bị cắt ở giới hạn mỗi phản hồi và giảm đọc lặp, **không chứng minh độ trễ production hoặc khả năng mở rộng vô hạn**. Với dữ liệu lớn cần đo số request, độ trễ, bộ nhớ, kế hoạch truy vấn/index trên staging thực tế; cân nhắc truy vấn/xếp hạng ở CSDL sau khi thống nhất chính sách tìm kiếm.
- Khi một nguồn quan trọng lỗi, một số trang có thể báo lỗi thay vì hiện danh sách rỗng. Không xem đó là kết quả “không có sản phẩm”.
- Nếu một trang catalogue từ Supabase lỗi, không tự thay kết quả của lần đọc đó bằng dữ liệu local. Fallback chung vẫn có thể chọn local trước khi bắt đầu đọc nếu môi trường cho phép: trên staging/production, cấu hình đúng URL và khoá Supabase, đặt `VEXIM_LOCAL_FALLBACK=off`, rồi xác nhận trạng thái dữ liệu là `supabase` và đúng project. Chỉ đặt `off` không đủ: nếu thiếu cấu hình Supabase, ứng dụng hiện vẫn chọn kho local theo chế độ demo.
- Thứ tự khi dữ liệu đang thay đổi liên tục, RLS, các bản migration đã áp, mạng và tải đồng thời chưa được kiểm trên Supabase production.

## Trước khi triển khai

Trên staging có dữ liệu đại diện và được phép sử dụng, so sánh danh sách ID trước/sau theo cùng bộ lọc, kiểm cả các trang và trường hợp tên có dấu/trùng tên. Thử giới hạn phản hồi thấp, lỗi giữa các trang và nhiều yêu cầu đồng thời; đối chiếu RLS cũng như các trường hợp đang có dữ liệu thay đổi. Đo số request, thời gian tải (gồm p50/p95), bộ nhớ và kế hoạch truy vấn/index với dữ liệu và mạng thật; không suy tốc độ production từ số đo giả lập.

## Kiểm thử trong kho mã

- `node --experimental-strip-types --no-warnings scripts/check-catalog-pagination.mjs`: Supabase JS thật gửi tới HTTP giả lập; 2.237 sản phẩm, 1.237 NCC, 3.507 media và 1.260 dòng thống kê; giới hạn phản hồi 137 và 1, nhiều lô, lỗi giữa trang, thứ tự sai, thêm/xoá trong lúc đọc.
- `npm run check:search`: đi qua mọi trang của 1.025 sản phẩm và 1.009 nhà cung cấp, so với thứ tự xếp hạng hiện tại; dữ liệu trong bộ nhớ, không đo mạng thực.
- `node scripts/check-sponsored-phase01-migration.mjs`: migration trên PGlite cách ly, không có kết nối production hay kiểm thử nhiều phiên đồng thời.
- `node --experimental-strip-types --no-warnings scripts/check-sponsored-phase01-actions.mjs` và `node scripts/check-sponsored-store-cas.mjs`: kiểm thao tác, giao diện, lỗi số liệu và compare-and-set với adapter giả lập.
