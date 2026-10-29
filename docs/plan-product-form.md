# Danh sách việc: form sản phẩm NCC, CRM và buyer

Cập nhật theo mã đang có trong nhánh. `[x]` chỉ đánh dấu phần đã được xây và kiểm thử trong phạm vi ghi rõ; không có nghĩa là cả tính năng đã sẵn sàng cho NCC. `[ ]` là việc còn thiếu hoặc chưa được thử đầy đủ.

## Nguyên tắc giữ nguyên

- [x] Giữ nguyên sản phẩm thật, ID, URL đã index, ảnh và dữ liệu đang công khai. Không tự xóa, chuyển đổi hoặc ghi dữ liệu thật khi chưa được anh đồng ý.
- [x] Giữ hiển thị cũ của sản phẩm hai grade. Anh sẽ tự xử lý thủ công bằng nút nhân bản sau khi form mới hoàn tất; không làm script, chạy SQL hay sao lưu riêng cho việc tách này.
- [x] Không có trường NCC nhập tên tiếng Anh. Luồng dự kiến vẫn là tên Việt, AI dịch, nhân viên kiểm tra và sửa khi duyệt; tên và giá đã duyệt phải tiếp tục hiển thị khi có bản chờ.
- [x] Không bật form mới cho NCC khi chưa thử xong staging và chưa được anh đồng ý. Không thêm đơn vị bao/thùng hay trường trọng lượng bao/thùng.

## Form NCC một trang

- [x] Đã xây component năm phần dùng các trường, font và màu hiện có; bố cục nhãn bên trái, mobile đưa nhãn lên trên. Đã thử component với dữ liệu giả trên desktop và mobile, không tràn trang và thanh thao tác luôn trong tầm nhìn. Tiêu đề, mục lục và khung preview được căn chỉnh theo ảnh mẫu anh cung cấp, chưa nối vào trang thật.
- [x] Đã xây khung “Buyer sẽ thấy” cập nhật tên, grade, giá, MOQ và Incoterm theo dữ liệu đang nhập; nhãn Volume pricing chỉ xuất hiện khi có nhiều tier và bật hiện giá. Danh sách “Các phần” có trạng thái và liên kết cuộn trong component. Chưa nối vào trang thật.
- [x] Ô số của form dùng font mono nội bộ và số thẳng cột; phần giá trong preview buyer giữ font của site, không dùng mono.
- [x] Đã xây mô hình nháp thiếu thông tin, kiểm tra khi gửi, điều phối phiên bản và nền tảng lưu nháp riêng tư; đã kiểm thử bằng fixture và PGlite, chưa triển khai.
- [x] Đã xây nền tảng ảnh nháp tách biệt khỏi ảnh công khai, chọn thứ tự và ảnh chính riêng cho bản nháp, kiểm tra quyền và snapshot ảnh lúc gửi. Snapshot ảnh mới ghi kích thước và SHA-256 của ảnh chính và ảnh thu nhỏ; có kiểm thử đọc và so khớp byte. Ảnh mới dùng namespace riêng, các hàm ghi/xóa thông thường của app không được ghi đè hoặc xóa; route công khai vẫn yêu cầu media buyer đã duyệt. Đây không bảo vệ khỏi người có quyền Storage trực tiếp; cần kiểm tra chính sách, quyền và phục hồi trên staging. Ảnh cũ chưa có hash phải được xử lý riêng. Chưa nối upload, gửi duyệt và transaction duyệt vào trang thật.
- [x] Adapter dùng action tải ảnh riêng tư và snapshot ảnh cũ có kiểm tra quyền/schema, không gọi endpoint ảnh cũ; chặn gửi duyệt ngay trước khi lưu hoặc sao chép ảnh khi chức năng chưa sẵn sàng. Đã thử mock, chưa nối vào trang NCC thật.
- [x] Phiên form buộc tải lại sau kết quả lưu ảnh hoặc gửi duyệt không xác định, tránh tiếp tục sửa khi server có thể đã nhận bản gửi.
- [ ] Nối cùng một form năm phần vào tạo mới và sửa sản phẩm NCC, giữ các trường hiện có, URL và dữ liệu cũ.
- [x] Đã xây action tải ảnh riêng tư có kiểm tra NCC, quyền sở hữu và phiên bản trước khi ghi; đã nối adapter, chưa nối form thật. Khung ảnh nháp có ô thêm ảnh, nhãn ảnh chính và nút gỡ theo ảnh mẫu; đã kiểm tra trạng thái khóa và giới hạn 8 ảnh bằng SSR.
- [x] Đã thử thành phần trình duyệt giảm ảnh đầu vào đến 8 MB xuống dưới 2,5 MB cho mỗi request, khóa form khi xử lý và giữ nguyên tệp gốc; ảnh thực tế được mã hóa WebP hợp lệ trong Chromium. Server vẫn tự kiểm tra và xử lý ảnh.
- [x] SQL64 có thao tác thay tham chiếu ảnh cũ bằng ảnh riêng tư trong đúng vị trí kể cả khi đã đủ 8 ảnh, kiểm tra snapshot và quyền, không sửa ảnh công khai. Đã xây helper, action NCC và session sao chép riêng tư theo ảnh được chọn trước khi gửi, kiểm tra quyền, đường dẫn và bytes; nếu một phần hoặc chưa rõ kết quả phải tải lại. Anh đã chạy SQL66; kiểm tra chỉ đọc thấy hàm staging dùng `product-form-images/` nhưng hai ràng buộc bảng vẫn dùng `products/`. Kiểm tra chỉ đọc xác nhận SQL67–68 đã phản ánh trên production và hàm kiểm tra trả về sẵn sàng; chưa thử luồng hoàn chỉnh trên staging riêng. Chưa nối adapter thật và chưa có khóa Storage giữa các lần đọc.
- [ ] Hoàn thiện tải ảnh riêng tư, khôi phục sau tải lại, thay ảnh và ảnh chính; xử lý lỗi mạng và tệp mồ côi an toàn. Cần thử đường truyền thực tế trên hosting và thiết bị trước khi nối. Ảnh đã công khai không đổi trước khi duyệt.
- [ ] Hoàn thiện lưu nháp, gửi duyệt, khóa/khôi phục phiên và thông báo chờ duyệt thực tế. Kiểm tra cạnh tranh giữa các phiên, ảnh, dữ liệu và bản duyệt.
- [x] Đã xây gợi ý dịch từ bản gửi riêng tư, không sửa bản đã duyệt và không gửi giá cho AI; cảnh báo nếu tên dịch chứa grade chuẩn hoặc grade tự nhập. Action kiểm tra quyền và đối chiếu lại bản gửi sau khi AI trả lời. Đã nối màn CRM, chưa lưu hay duyệt bản dịch.
- [ ] Hoàn thiện dịch tên Việt sang Anh bằng AI, cho admin sửa/duyệt và kiểm soát cả grade chuẩn lẫn grade tự nhập trong tên. Không thay bản tiếng Anh đã duyệt khi bản mới đang chờ.
- [ ] Thử đầy đủ trên điện thoại và desktop, chụp màn hình thực tế các màn chính.

## Bảng giá theo số lượng

- [x] Đã xây parser, kiểm tra và biểu diễn v2 chính xác theo gam và cent, giữ đơn vị gốc kg/tấn; không suy đoán dữ liệu giá cũ.
- [x] Đã kiểm thử các quy tắc số tier, MOQ, thứ tự số lượng và giá, tỷ lệ, giá ngoài ngưỡng là cảnh báo, giá dùng dấu phẩy hoặc chấm, và consent khi bật công khai.
- [x] Đã xây component nhập bảng giá và bản xem trước buyer. Các đường v2 cũ vẫn là thử nghiệm, chưa phải luồng form cuối.
- [x] Form năm phần hiển thị Incoterm và địa điểm ở dòng riêng phía trên bảng tier có đơn vị và preview khoảng giá, công tắc hiện giá trước cảnh báo và consent theo ảnh mẫu; lỗi tier, địa điểm và consent hiện tại trường. Ô số và giá liên kết đến lỗi tương ứng cho trình đọc màn hình. Cảnh báo giá ngoài ngưỡng chỉ hiển thị cho nhân viên, không chặn gửi. Đã thử component với dữ liệu giả ở 375px và 1200px, chưa nối trang thật.
- [x] Kiểm tra lại thuộc tính theo cấu hình danh mục khi gửi và khi rà soát; không âm thầm bỏ thông số không hợp lệ hoặc giá trị bị ẩn theo điều kiện. Giá trị ẩn được hiển thị để NCC chủ động xóa; lỗi server được đưa về phần liên quan trong form.
- [ ] Nối bảng giá vào form mới và luồng duyệt an toàn, kiểm tra lại toàn bộ quy tắc bản chốt từ UI đến server và database.
- [ ] Bảo đảm giá đã duyệt tiếp tục hiện khi có giá mới chờ duyệt; duyệt phải nguyên tử và phát hiện thay đổi đồng thời của tên, grade, giá và ảnh.
- [x] Đã xây helper tạo dữ liệu sửa nháp từ sản phẩm cũ một grade mà không đoán tier, MOQ, đơn vị hay năng lực; báo phần grade_rows, thông số, chứng nhận và năng lực cũ cần giữ/kiểm tra. Từ chối nhiều grade hoặc grade mơ hồ, chưa nối form hay duyệt.
- [ ] Hoàn thiện xử lý sản phẩm cũ cần người xác nhận, không tự chọn giá trong khoảng giá cũ, không tự chuyển đơn vị bao/thùng; bảo đảm thông tin cũ chưa biểu diễn được không bị mất khi duyệt.

## Nhân bản cho grade khác

- [x] Đã xây và kiểm thử hàm tạo dữ liệu nháp độc lập từ form hiện có hoặc sản phẩm cũ nhiều grade: giữ nội dung chung, xóa grade/tier cũ và yêu cầu xác nhận công khai giá mới. Các thuộc tính cũ chưa biểu diễn được và chứng nhận CRM được báo để xử lý riêng, không tự bỏ qua. Hàm chưa tạo sản phẩm, chưa sao chép ảnh và chưa nối giao diện.
- [ ] Xây nút “Nhân bản cho grade khác” và luồng tạo bản nháp độc lập với sản phẩm gốc. Không đổi sản phẩm gốc hoặc tự công khai bản mới.
- [x] Đã xây helper sao chép ảnh vào nháp riêng cho nút nhân bản: kiểm tra quyền, chủ đường dẫn và ảnh gốc; không ghi đè hay xóa ảnh gốc, báo tải lại nếu kết quả không chắc chắn. Chỉ thử bằng dữ liệu giả, chưa nối UI hoặc sao chép ảnh thật.
- [ ] Hoàn thiện sao chép dữ liệu, ảnh và các liên kết được phép; khôi phục sau sao chép dở, không dùng chung đường dẫn ảnh gây nhầm quyền sở hữu hoặc xóa nhầm.
- [ ] Cho anh chọn/nhập grade và kiểm tra giá, MOQ của bản mới. Không tự suy đoán chuyển khoảng giá cũ thành tier. Kiểm thử thủ công với fixture nhiều grade trước khi anh dùng cho sản phẩm thật.

## CRM

- [x] Đã nối hàng chờ CRM và màn xem bản gửi dành cho admin/reviewer: so sánh form với bản duyệt liên kết đúng revision giá, hiện ảnh, gợi ý tên tiếng Anh và yêu cầu chỉnh sửa. Kiểm thử quyền, ảnh, dữ liệu cũ chưa rõ và action bằng mock; chưa có thao tác duyệt/công bố, chưa thử staging.
- [x] Đã xây kiểm tra bản gửi khi duyệt: đối chiếu dữ liệu giá v2, HTML an toàn, chính sách hiện tại và tên tiếng Anh không chứa grade chuẩn hoặc grade tự nhập; chặn dữ liệu grade cũ nhiều dòng, sai kiểu hoặc mâu thuẫn. Đã thử helper SQL65 khóa/đối chiếu snapshot, chính sách và ảnh bằng PGlite; helper server chuẩn bị dữ liệu từ snapshot và kiểm tra byte ảnh mới. Đây chưa phải transaction duyệt nguyên tử; metadata production xác nhận helper SQL65 đã hiện diện.
- [x] Đã xây và nối bảng so sánh các trường, tier của hai snapshot form vào CRM; dữ liệu cũ không biểu diễn được và cam kết cũ chưa rõ được đánh dấu chưa biết, không tự suy đoán. Màn duyệt hiện ảnh và tên Anh riêng; chưa có công bố.
- [ ] Dùng lại form NCC để tạo và sửa sản phẩm trong CRM, đồng thời giữ các trường chỉ có ở CRM và dữ liệu cũ.
- [ ] Hoàn thiện màn duyệt: xác nhận và lưu tên tiếng Anh đã sửa, kiểm tra chính sách hiện tại, đối chiếu bytes ảnh và duyệt nguyên tử. Tên gợi ý trên màn chỉ xem, chưa lưu hay công bố.
- [x] Đã xây helper chuẩn bị bản sao ảnh riêng cho công bố, kiểm tra hash ảnh gốc và bản sao, không đổi ảnh gốc hoặc tạo media công khai; lỗi sau ghi yêu cầu tải lại và đối soát. Đã thử bằng dữ liệu giả; chưa nối transaction hay dùng Storage thật.
- [ ] Hoàn thiện transaction duyệt/từ chối có phân quyền, khóa và đối chiếu phiên bản cùng snapshot ảnh; không công khai dữ liệu hoặc ảnh đang chờ.
- [ ] Kiểm thử tạo, sửa, gửi, duyệt và yêu cầu sửa, bao gồm nhiều phiên đồng thời và lỗi kết nối.

## Buyer

- [x] Đã xây và kiểm thử thành phần thẻ sản phẩm, bảng giá và projection từ revision được duyệt trong đường preview; grade tự nhập bị loại khỏi bộ lọc grade chuẩn.
- [x] Đã xây trình đọc mã bản duyệt, mã revision giá và consent theo đúng revision được duyệt; preview buyer sử dụng consent của form mới, giữ chính sách cũ khi chưa có form và dừng an toàn nếu liên kết lệch. Đã thử bằng fixture; chưa nối buyer thật hoặc transaction duyệt.
- [x] Đã có guard giữ nguyên projection cũ cho sản phẩm nhiều grade hoặc grade cũ không đúng định dạng. SQL65 cũng từ chối đưa sản phẩm có nhiều grade hoặc cấu trúc grade mơ hồ vào bước chuẩn bị duyệt một grade; đã thử PGlite và xác nhận guard chính hiện diện trên production.
- [x] Đã thiết kế bảng thứ tự ảnh được duyệt, helper và trình đọc server chọn tối đa 8 ảnh mà không xóa media cũ hay phá URL ảnh cũ; preview buyer và PDP dùng thứ tự manifest, bản duyệt hoặc manifest lệch thì không fallback. Đã thử PGlite và mock; chưa có transaction ghi manifest hoặc cutover buyer thật.
- [ ] Nối thẻ, trang chi tiết, bộ lọc và storefront vào dữ liệu mới sau khi luồng duyệt hoàn chỉnh, không làm mất khả năng đọc sản phẩm cũ.
- [ ] Kiểm tra thẻ cố định chiều cao, grade riêng khỏi tên, giá/MOQ kg hoặc MT, Volume pricing, ngày cập nhật, OEM/ODM/mẫu và bộ lọc.
- [x] Đã thêm chuyển hướng 308 từ đường dẫn danh mục cũ sang danh mục hiện tại khi sản phẩm đổi danh mục, chỉ khi sản phẩm đích thực sự công khai; không đổi ID hay xóa liên kết. Đã thử helper và typecheck, cần thử tuyến thực tế trên staging.
- [ ] Kiểm thử trang chi tiết không lặp giá, grade, MOQ, Incoterm; kiểm tra URL, sitemap, ảnh, RFQ và hiển thị sản phẩm hai grade vẫn như cũ.

## Migration và các bước anh thử

- [x] Anh đã xác nhận chạy SQL53, SQL54, SQL55, SQL56 và SQL61. Không sửa lại các migration đã chạy.
- [x] Kiểm tra chỉ đọc metadata ngày 29/10/2026 trên dự án `veximtrade`: các hàm chính và cột `product_context` thuộc SQL57–60 đã hiện diện; bucket `vexim-media` không công khai, chưa có policy trên `storage.objects`. Đây là bằng chứng tại thời điểm kiểm tra, không khẳng định lịch sử chạy hay so khớp toàn bộ nội dung migration.
- [ ] Đối chiếu toàn bộ migration SQL57–60 khi lập danh sách triển khai cuối cùng, kể cả môi trường staging.
- [x] Anh báo đã chạy SQL. Kiểm tra metadata chỉ đọc trên `veximtrade` thấy các bảng nháp, bản gửi, ảnh nháp, manifest và helper duyệt đã hiện diện; bốn bảng mới đang có 0 dòng tại thời điểm kiểm tra. Đây không xác nhận toàn bộ lịch sử hoặc từng dòng migration.
- [x] Anh xác nhận chạy SQL66; kiểm tra chỉ đọc thấy nội dung hàm staging trùng SQL66, hàm context duyệt trùng SQL65, cả hai chỉ cho service role thực thi. Không có ảnh nháp tại thời điểm kiểm tra, nhưng hai ràng buộc bảng vẫn dùng đường dẫn cũ `products/`. Không sửa migration SQL66 đã chạy.
- [x] Anh báo đã chạy và kiểm thử. Kiểm tra chỉ đọc trên `veximtrade` xác nhận hàm SQL67 có nội dung trùng bản trong repo, cả hai ràng buộc dùng namespace mới, hàm sẵn sàng trả về true; số nháp, bản gửi và ảnh nháp đều bằng 0 tại thời điểm kiểm tra. SQL68 đã được phản ánh trong schema. Sau này nếu sửa hàm staging phải cập nhật kiểm tra bằng migration mới.
- [ ] Chưa xác định được dự án staging riêng trong danh sách kết nối; chưa xem đây là kiểm thử luồng NCC/CRM/buyer end-to-end và chưa bật form mới.
- [ ] Hoàn thiện và kiểm thử các migration bổ sung và transaction duyệt trước khi đưa danh sách chạy cuối cùng. Không chạy lại SQL62–68 chỉ để sửa khác biệt; phải thử luồng hoàn chỉnh trên staging riêng trước khi bật.
- [x] Anh đồng ý dùng dự án Supabase Free riêng làm staging, chỉ với dữ liệu giả và không sao chép dữ liệu thật. Kiểm tra 29/10/2026 có một dự án đang hoạt động và một dự án không hoạt động; hạn mức thực tế phải được Supabase xác nhận khi tạo.
- [ ] Chuẩn bị dự án staging riêng khi luồng và migration đã sẵn sàng. Anh tự chạy SQL; không dùng dữ liệu thật và không đụng dự án production.
- [ ] Viết thứ tự chạy migration, điều kiện tiên quyết và kiểm tra sau chạy. Anh là người chạy migration; em không tự chạy trên database của anh.
- [ ] Sau khi staging sẵn sàng, hướng dẫn anh thử tạo nháp thiếu thông tin, tải ảnh, nhập tier, gửi duyệt, duyệt CRM, xem buyer và sửa lại giá/tên.
- [ ] Gửi ảnh chụp thực tế desktop/mobile và các bước kiểm thử rõ ràng sau khi luồng hoàn tất; chỉ đề nghị bật cho NCC sau khi staging đạt và anh chấp thuận.

Ngoài phạm vi đợt này: giá ưu đãi có thời hạn và email nhắc 30 ngày.
