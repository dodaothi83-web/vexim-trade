# Rà soát thông báo & email — 17/10/2026

> Đây là ảnh chụp trước đợt 2. Các khoảng trống về email quyết định NCC/sản phẩm/chứng nhận/xác minh và thông báo portal đã được xử lý tiếp trong [notification-phase2.md](notification-phase2.md). Các khoảng trống về outbox, retry và delivery vẫn còn.

Phạm vi: đọc mã của nhánh PR #5, chạy bài kiểm tra offline và kiểm tra GET công khai của webhook Resend. Không đăng nhập production Supabase/Resend, không gửi email thật, không xác nhận đã áp dụng migrations, cron hay deploy. “Đã gửi” trong mã nghĩa là **API Resend chấp nhận**, không phải người nhận đã nhận thư.

## Kết luận

**Chưa đủ để xem là hoàn tất cho mọi chức năng.** Luồng RFQ đã có nhiều email và dashboard NCC có thông báo, nhưng quyết định về hồ sơ NCC/sản phẩm/chứng nhận chủ yếu chỉ hiện khi người dùng chủ động vào lại trang. Một số email khởi tạo không có nhật ký/trạng thái gửi bền vững. Cấu hình production cần kiểm tra trực tiếp.

| Sự kiện | Hiện có | Khoảng trống/giới hạn |
| --- | --- | --- |
| Tạo tài khoản NCC | Supabase Auth gửi xác nhận email; app truyền redirect `/login`, từ chối URL override loopback trên bản deploy (`app/api/supplier-signup/route.ts`). | Site URL / Redirect URLs / template ở Supabase là cấu hình **ngoài mã**; email đã đi về localhost theo báo cáo thực tế, chưa xác minh đã sửa. |
| NCC nộp hồ sơ doanh nghiệp | Email cho admin và sourcing đang hoạt động (`lib/supplier-portal/notify.ts`); CRM giữ hàng chờ kể cả email lỗi; form NCC có cảnh báo nếu email nội bộ chưa gửi. | Không có hàng đợi/retry hoặc nhật ký riêng cho email nội bộ gửi lỗi. |
| Staff duyệt quyền NCC/yêu cầu bổ sung | Ghi `onboarding_status`, `onboarding_note`, audit; NCC thấy trạng thái/nội dung khi mở `/supplier/portal`. | **Không có email hay thông báo chủ động** cho NCC khi staff ra quyết định; NCC chưa được duyệt không có trung tâm thông báo dashboard. |
| NCC gửi sản phẩm để xét duyệt | CRM có hàng chờ review; NCC thấy trạng thái trên danh sách/chi tiết sản phẩm. Staff duyệt/từ chối lưu note/audit (`app/crm/products/[slug]/edit/review-actions.ts`). | **Không gửi email/badge thông báo cho staff lúc nộp, hoặc cho NCC khi duyệt/yêu cầu sửa.** Phải chủ động kiểm tra trang. Duyệt nội dung không tự công khai sản phẩm (đúng chính sách). |
| NCC nộp chứng nhận | Email cho admin/sourcing; CRM có trạng thái `pending`; nộp không tự duyệt/công bố (`app/api/supplier-portal/certificates/route.ts`). | Kết quả gửi email nội bộ bị bỏ qua (chỉ catch exception); staff duyệt/yêu cầu sửa/từ chối/công bố chưa email/thông báo chủ động cho NCC; trạng thái chỉ hiện trên trang chứng nhận. |
| Đánh giá giấy tờ/xác thực nhà máy/lịch sử giao hàng | Dashboard NCC (sau khi quyền cổng đã duyệt) suy ra thông báo trả hồ sơ/duyệt từng đánh giá và đã liên hệ theo yêu cầu; có đánh dấu đã đọc (`lib/supplier-portal/dashboard.ts`). | Không có email cho NCC khi thay đổi trạng thái; trước khi mở quyền cổng chỉ có nội dung chờ/bổ sung hồ sơ, không có trung tâm thông báo. |
| Buyer nộp RFQ | Lưu DB trước; buyer nhận ack (trừ spam), hộp nội bộ nhận email; RFQ vẫn ở CRM nếu gửi lỗi (`lib/rfq/submit.ts`, `lib/email/rfq.ts`). | Ack/email nội bộ không có bản ghi gửi bền vững và không kiểm tra kết quả `transport`; màn hình có thể bảo “Kiểm tra email” dù Resend lỗi. Cần theo dõi/retry và lời nhắn theo kết quả thực. |
| Staff gửi RFQ cho NCC | Email ẩn danh từ địa chỉ nhân viên, Reply-To định tuyến qua Vexim; chỉ đánh dấu lời mời và sinh thông báo trong portal khi API Resend trả `sent` (`lib/rfq/outreach.ts`). | Không có xác nhận phát tới hộp thư NCC (delivery event); gửi thành công nhưng ghi match/timeline thất bại có rủi ro gửi lại trùng. |
| Gửi shortlist cho buyer | Email và timeline, chuyển RFQ sang `quoted`; **đã sửa trong PR** để không xuất `internal_note` và không coi email chỉ mô phỏng là đã gửi (`lib/rfq/outreach.ts`). | Cần kiểm tra email shortlist **đã gửi trước bản sửa** nếu có ghi chú nội bộ; không thể thu hồi thư cũ. Gửi thành công nhưng ghi trạng thái DB thất bại vẫn có nguy cơ gửi trùng khi thử lại. |
| Buyer bắt đầu gửi mẫu / mất đơn | Email buyer có bản ghi `buyer_status_update`, chống gửi trùng theo RFQ + giai đoạn; thất bại có thể retry (`lib/rfq/buyer-notify.ts`). | Bản `draft` bị kẹt (ví dụ request chết sau khi ghi claim) hiện trả `pending` vô hạn; chưa có cơ chế hồi phục có kiểm soát. Không xử lý sự kiện bounced/delivered. |
| SLA RFQ | Cron có mốc chưa phân công và gần hết hạn; **đã sửa trong PR** để chỉ đánh dấu cảnh báo sau khi Resend nhận thật, giữ cả hai dấu mốc nếu cùng chạy và trả HTTP 503 khi có lỗi. | Phải cấu hình `CRON_SECRET` và lịch gọi bên ngoài; chưa kiểm tra job live. Lỗi DB sau khi email đã được chấp nhận vẫn có thể khiến lần gọi sau gửi lại. |
| Email CRM (manual/stage), phản hồi inbound | Có Resend transport, các thư tự soạn/giai đoạn được ghi vào `messages`; inbound qua webhook Svix + Receiving API, thông báo chủ sở hữu và lọc phạm vi Hộp thư. | `email.received` có xử lý; webhook **chưa** xử lý sent/delivered/bounced/complained. Nhật ký `sent` chỉ chứng minh API chấp nhận. Nếu webhook nhận thư lưu thành công nhưng email báo nội bộ lỗi, không có hàng đợi retry notification. |

## Việc đã chỉnh ngay trong lần rà soát

1. Buyer shortlist không còn chứa `rfq_matches.internal_note` (trước đây cột “Ghi chú Vexim” bị đưa thẳng vào HTML email gửi buyer); chỉ chuyển trạng thái sau `sent` thật.
2. `transport` trong `NODE_ENV=production` trả `failed` khi thiếu Resend thay vì `simulated`; dev vẫn mô phỏng có nhãn rõ.
3. Cảnh báo SLA không tự ghi dấu “đã gửi” nếu transport thất bại/chỉ mô phỏng; cron trả HTTP 503 cho job monitor, giữ cả hai dấu mốc khi hai cảnh báo cùng phát.

Các thay đổi này ở PR, **không khẳng định đã lên website production**.

## Ưu tiên còn lại

- **P1:** gửi thông báo email + thông báo trong portal cho quyết định hồ sơ NCC, sản phẩm, chứng nhận (chỉ sau quyết định staff thật); bổ sung nhắc staff khi sản phẩm mới vào hàng chờ. Dùng trạng thái lưu trong DB làm nguồn sự thật và thiết kế dedupe/retry, không tự duyệt.
- **P1:** lưu trạng thái gửi cho ack RFQ và mail nội bộ; thông báo đúng khi không gửi được; cơ chế retry cho `draft` buyer status bị kẹt và cho email đã gửi nhưng ghi DB lỗi, tránh gửi trùng.
- **P2:** xử lý webhook delivered/bounced/complained để phân biệt “Resend chấp nhận” với “đã phát đến hộp thư”; kiểm tra và cấu hình cron thật, inbound route, sender domain, Supabase Site URL/Redirect URLs trên đúng project.

## Bằng chứng kiểm tra

Các script offline đạt: `check-rfq-email`, `check-mail-visibility`, `check-supplier-self-registration`, `check-supplier-dashboard`, `check-certificate-workflow`, `check-supplier-products`, `check-rfq-sla-notification`, `check-email-transport`. `npm run typecheck` và build được chạy trên nhánh. GET công khai `https://www.veximtrade.com/api/webhooks/resend` tại lúc rà soát trả `webhookSecretSet: true`, `resendConfigured: true`; chỉ là cờ cấu hình, **không chứng minh** webhook đang nhận/Resend đang phát email thật. Không dùng token, key hoặc gửi email thử đến địa chỉ bên ngoài trong lần rà soát này.
