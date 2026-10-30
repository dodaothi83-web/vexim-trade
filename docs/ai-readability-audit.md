# Rà soát mức độ AI đọc được của website Vexim Trade

Ngày rà soát: 19 tháng 10 năm 2026. Phạm vi: mã nguồn trong kho và đối chiếu trực tiếp với bản đang chạy tại https://www.veximtrade.com. Mục tiêu đánh giá khả năng các hệ thống AI như ChatGPT, Perplexity, Gemini và Google AI thu thập, hiểu và trích dẫn dữ liệu nhà cung cấp của Vexim khi buyer tìm nguồn hàng.

## Kết luận tóm tắt

Khung kỹ thuật đã sẵn sàng ở mức khá tốt, nút thắt nằm ở dữ liệu. Nếu hôm nay có nhà cung cấp thật được công khai, AI đã đọc và hiểu được hồ sơ đó. Nhưng hiện sitemap công khai chỉ có 1 danh mục và chưa có nhà cung cấp hay sản phẩm nào, nên AI chưa có gì để trích dẫn về nhà cung cấp cụ thể của Vexim.

| Hạng mục | Đánh giá | Ghi chú ngắn |
| --- | --- | --- |
| Quyền truy cập của bot | Tốt, có điều kiện | Production mở cho mọi bot, chưa có quy tắc riêng cho bot AI |
| Dữ liệu có cấu trúc | Khá tốt | Đủ Organization, Product, ItemList, FAQPage; thiếu thuộc tính giao dịch trong schema |
| Nội dung dạng chữ | Tốt | Trang render phía máy chủ, đọc được toàn văn không cần chạy JavaScript |
| Sitemap và khả năng khám phá | Trung bình | Cơ chế đúng nhưng dữ liệu đầu vào gần như trống |
| Tín hiệu riêng cho AI | Chưa có | Chưa có llms.txt, chưa có chính sách bot AI tường minh |
| Độ tin cậy của dữ kiện | Tốt | Không bịa giá, không bịa điểm đánh giá, huy hiệu gắn theo kiểm tra thật |

## 1. Quyền truy cập của bot

- File robots trên bản đang chạy cho phép mọi bot truy cập toàn bộ trang công khai, chỉ chặn các khu vực nội bộ như khu vực quản trị, RFQ và API, đồng thời khai báo sitemap. Đã kiểm tra trực tiếp tại https://www.veximtrade.com/robots.txt ngày 19 tháng 10 năm 2026.
- Hệ thống không có quy tắc riêng theo tên bot AI. Các bot như GPTBot, OAI-SearchBot, ClaudeBot hay PerplexityBot hiện được vào theo quy tắc chung cho mọi bot. Điều này có lợi cho việc được AI trích dẫn nhưng chưa phải một chính sách chủ động.
- Toàn bộ khả năng hiển thị phụ thuộc vào một biến cấu hình bật tắt index trên production. Middleware gắn thẻ noindex cho toàn site khi biến này tắt. Bản đang chạy đã bật đúng, nhưng đây là điểm phải kiểm tra sau mỗi lần triển khai lại hoặc đổi môi trường.
- Rủi ro cần lưu ý: bot phục vụ trả lời và trích dẫn cho người dùng khác với bot thu thập dữ liệu huấn luyện. Hiện cả hai nhóm đều được vào như nhau. Nếu sau này muốn chặn nhóm huấn luyện mà vẫn được AI trích dẫn, phải tách quy tắc theo đúng tên bot, không chặn chung chung.

## 2. Dữ liệu có cấu trúc

Các trang công khai đã nhúng dữ liệu có cấu trúc dạng JSON-LD:

- Trang chủ: Organization và WebSite của Vexim.
- Trang nhà cung cấp: Organization kèm địa chỉ, BreadcrumbList, và ItemList liệt kê sản phẩm kèm đường dẫn trang sản phẩm. Khối dữ liệu này chỉ xuất hiện khi hồ sơ đạt điều kiện hiển thị cho máy tìm kiếm: không phải dữ liệu mẫu, có ít nhất một sản phẩm và phần giới thiệu đủ dài. Đây là cơ chế chống trang rỗng rất đúng.
- Trang sản phẩm: Product với tên, ảnh, mô tả tiếng Anh và brand trỏ về trang nhà cung cấp. Chủ đích không khai báo giá bán và điểm đánh giá vì giá trên nền tảng là giá tham khảo qua RFQ, không phải chào bán trực tiếp. Nguyên tắc này nên giữ nguyên.
- Trang danh mục: BreadcrumbList, ItemList sản phẩm và FAQPage từ bộ câu hỏi thường gặp của danh mục.
- Bài viết: BlogPosting kèm tác giả và nhà xuất bản.

Điểm còn thiếu so với nhu cầu của AI khi trả lời câu hỏi chọn nhà cung cấp:

- Product chưa khai các thuộc tính giao dịch dưới dạng có cấu trúc như số lượng đặt hàng tối thiểu, thời gian giao hàng, chứng nhận và các thuộc tính theo danh mục như grade, dù các dữ kiện này đã hiển thị dạng chữ trên trang.
- Organization của nhà cung cấp chưa khai năm thành lập và quy mô nhân sự dù hồ sơ đã thu thập hai trường này.
- Mức xác minh hiện chỉ thể hiện bằng huy hiệu và đoạn chữ trên giao diện, chưa có biểu diễn có cấu trúc để máy đối chiếu giữa các nhà cung cấp.

## 3. Nội dung dạng chữ và ngôn ngữ

- Các trang công khai render phía máy chủ. Kiểm tra trực tiếp trang chủ và trang danh mục hạt điều cho thấy toàn bộ nội dung chữ, tiêu đề phân cấp và bảng thông tin đọc được ngay trong HTML, không phụ thuộc JavaScript phía trình duyệt. Đây là điều kiện quan trọng vì nhiều bot AI không chạy JavaScript đầy đủ.
- Nội dung cho buyer dùng tiếng Anh, gồm bản dịch AI có người rà soát cho hồ sơ nhà cung cấp và sản phẩm. Trang danh mục có thêm kiến thức mua hàng cơ bản và câu hỏi thường gặp, đúng loại nội dung AI hay trích dẫn khi buyer hỏi cách mua một mặt hàng.
- Chưa có hreflang. Điều này chấp nhận được ở giai đoạn hiện tại vì nội dung công khai gần như chỉ có một ngôn ngữ cho mỗi nhóm trang.

## 4. Sitemap và tình trạng dữ liệu thực tế

Sitemap tại https://www.veximtrade.com/sitemap.xml ngày 19 tháng 10 năm 2026 gồm: trang chủ, trang giới thiệu cách kiểm chứng, trang dành cho nhà cung cấp, 1 trang danh mục hạt điều, 2 bài viết và các trang pháp lý. Chưa có bất kỳ URL nhà cung cấp hay sản phẩm nào.

Cơ chế sitemap đã đúng: chỉ đưa hồ sơ đạt điều kiện vào sitemap để tránh quảng bá trang rỗng cho máy tìm kiếm. Vấn đề thuần túy là chưa có dữ liệu đầu vào. Đây cũng là lý do chương trình tuyển 10 nhà cung cấp tiên phong là việc quyết định nhất cho khả năng hiển thị trên AI ở thời điểm này, quan trọng hơn mọi tinh chỉnh kỹ thuật.

Ngoài ra, chưa có trang thư mục tổng hợp toàn bộ nhà cung cấp. Hiện buyer và AI đi vào nhà cung cấp qua trang chủ, trang danh mục hoặc đường dẫn trực tiếp tới từng hồ sơ.

## 5. Độ tin cậy của dữ kiện

Đây là điểm mạnh cần giữ. Giá chỉ hiển thị công khai khi nhà cung cấp đồng ý bằng văn bản và còn trong thời hạn xác nhận. Điểm đánh giá trung bình có cổng kiểm soát chỉ xét khi đủ số lượt tối thiểu và hiện không hiển thị ra ngoài. Huy hiệu xác minh chỉ gắn sau kiểm tra thật. Với AI, một nguồn dữ kiện nhất quán và không thổi phồng sẽ được trích dẫn bền hơn nhiều so với nguồn nhiều nhưng mâu thuẫn.

## Việc nên làm theo thứ tự ưu tiên

Ưu tiên 0, không cần viết code: nạp dữ liệu thật qua chương trình nhà cung cấp tiên phong. Mỗi ngành trọng điểm cần 3 đến 5 hồ sơ đầy đủ gồm giới thiệu đạt độ dài tối thiểu, sản phẩm có ảnh thật và thuộc tính rõ ràng. Đây là yếu tố quyết định phần lớn khả năng xuất hiện trong câu trả lời AI.

Ưu tiên 1, thay đổi kỹ thuật nhỏ:

- Bổ sung file llms.txt ở thư mục gốc, liệt kê ngắn gọn các trang quan trọng cho AI: trang chủ, các trang danh mục, trang cách kiểm chứng, trang dành cho nhà cung cấp và danh sách hồ sơ nhà cung cấp đã công khai.
- Bổ sung thuộc tính giao dịch dạng có cấu trúc vào schema Product khi dữ kiện có thật: số lượng đặt hàng tối thiểu, thời gian giao hàng, chứng nhận và thuộc tính riêng của danh mục.
- Bổ sung năm thành lập và quy mô nhân sự vào schema Organization của nhà cung cấp khi hồ sơ có hai dữ kiện này.
- Tách quy tắc bot AI trong robots theo hướng cho phép tường minh các bot phục vụ tìm kiếm và trích dẫn. Việc chặn hay mở bot thu thập dữ liệu huấn luyện là quyết định chính sách dữ liệu, cần chủ quản chốt trước khi áp dụng.

Ưu tiên 2, làm theo thời gian:

- Mở rộng nội dung hướng dẫn mua hàng theo từng ngành như hai bài viết hiện có, vì đây là nguồn AI trích dẫn khi buyer hỏi cách nhập một mặt hàng từ Việt Nam.
- Cân nhắc trang thư mục nhà cung cấp khi số lượng hồ sơ đủ lớn để trang không bị loãng.
- Định kỳ tự kiểm tra bằng cách đặt câu hỏi mua hàng mẫu trên các công cụ AI phổ biến và ghi lại Vexim có được nhắc tới hay không, kết hợp dữ liệu Google Search Console.

## Đã triển khai gói ưu tiên 1 (ngày 19 tháng 10 năm 2026)

- File llms.txt tại địa chỉ /llms.txt, sinh tự động và giữ gọn: trang cốt lõi, danh mục đang đăng và tối đa 100 hồ sơ nhà cung cấp đạt điều kiện hiển thị cho máy tìm kiếm.
- Schema Product bổ sung additionalProperty cho MOQ, thời gian giao hàng và các thuộc tính theo danh mục đã qua kiểm tra hợp lệ, cùng hasCertification cho chứng nhận đã duyệt, còn hạn và áp đúng sản phẩm. Vẫn không khai báo offers và aggregateRating.
- Schema Organization của nhà cung cấp bổ sung foundingDate và numberOfEmployees, chỉ khi vòng kiểm tra giấy tờ đã được phê duyệt.
- robots.txt khai báo tường minh từng bot AI theo hai nhóm: bot phục vụ tìm kiếm và trích dẫn (OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User) và bot thu thập dữ liệu huấn luyện (GPTBot, ClaudeBot, anthropic-ai, CCBot, Google-Extended, Applebot-Extended, Meta-ExternalAgent, cohere-ai). Cả hai nhóm đều được phép truy cập nội dung công khai và vẫn bị chặn khỏi khu vực nội bộ.
- Script kiểm tra sau deploy: `npm run check:ai-crawl -- [địa chỉ website]`. Script báo lỗi và thoát mã 1 nếu robots.txt chặn toàn bộ website, trang chủ bị gắn noindex hoặc thiếu dữ liệu có cấu trúc, và kiểm tra thêm llms.txt. Chạy script này sau mỗi lần deploy production trước khi coi việc triển khai là hoàn tất.

## Giới hạn của đợt rà soát này

Rà soát dựa trên mã nguồn và nội dung HTML công khai của bản đang chạy. Đợt này chưa đo được tần suất bot AI thực tế đã vào website, việc đó cần quyền truy cập nhật ký máy chủ hoặc công cụ phân tích lưu lượng, và chưa kiểm chứng được thứ hạng hiển thị thực tế trong câu trả lời của từng hệ thống AI.
