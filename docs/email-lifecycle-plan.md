# Vòng đời email — dịch vụ trước, marketing sau

Trạng thái: **đợt 1 đã triển khai trong mã** (thư nhắc nhà cung cấp hoàn thiện hồ sơ xác minh). Đợt 2 và 3 là kế hoạch, chưa có mã.

Tài liệu liên quan: [notification-email-audit.md](notification-email-audit.md) (khoảng trống outbox/retry/delivery), [notification-phase2.md](notification-phase2.md) (email quyết định theo mốc nghiệp vụ), [cron-setup.md](cron-setup.md).

## 1. Nguyên tắc

1. **Chỉ gửi khi có lý do gắn với việc người nhận đang làm.** Không email "sản phẩm tương tự", không khuyến mãi theo mùa, không gửi hàng loạt theo hành vi duyệt web.
2. **Email giao dịch luôn gửi; email dịch vụ theo sự kiện gửi có giới hạn; email marketing mặc định không gửi.** Ba lớp này không trộn vào nhau.
3. **Nhà cung cấp trước, người mua sau.** Nhà cung cấp có tài khoản, có việc phải làm và trao đổi này là dịch vụ. Người mua chỉ có một email trong CRM, nên nội dung phải thật dày mới đáng gửi.
4. **Uy tín tên miền là tài sản.** Vexim gửi cả báo giá và ack RFQ từ `veximtrade.com`; một đợt thư bị đánh spam sẽ kéo theo email giao dịch vào spam.
5. **AI, dữ liệu tự khai và việc NCC tải tệp không tạo huy hiệu.** Email cũng không được ngụ ý điều đó.

## 1b. Địa chỉ gửi

- Thư **dịch vụ tự động** cho nhà cung cấp dùng `SERVICE_FROM_ADDRESS` (`lib/config.ts`), mặc định
  `hello@veximtrade.com`, đổi bằng `EMAIL_SERVICE_FROM`. Không dùng `sales@`: hộp thư bán hàng bị
  bộ lọc xếp vào nhóm hộp thư đại trà nên thư dễ rơi vào tab Quảng cáo.
- Thư **giao dịch cho người mua** vẫn đi từ địa chỉ cá nhân của nhân viên phụ trách
  (`lib/email/sender.ts`), vì đó là người mua đang trao đổi.
- Chỉ nhận local-part của `MAIL_DOMAIN`; đặt domain khác trong `EMAIL_SERVICE_FROM` sẽ bị bỏ qua
  để không làm hỏng việc gửi (Resend chỉ gửi được từ domain đã verify).

## 1c. Văn phong thư

Áp dụng cho mọi thư tiếng Việt gửi nhà cung cấp:

- Không dùng gạch dài `—`, mũi tên `→`, dấu ngoặc kép cong, emoji trong câu. Đây là các dấu hiệu
  khiến thư đọc như văn bản máy và cũng dễ bị bộ lọc chấm điểm xấu.
- Tiêu đề nêu việc và con số, không dùng nhãn máy kiểu `[Thông báo]`, không viết hoa toàn bộ.
- Thân thư nói ba việc: đang có gì, cần làm gì, ai làm. Câu ngắn, không mở bài dài.
- Không dùng "chúng tôi", "quý khách", "kính mong"; Vexim gọi người nhận là "bạn" và tự xưng "Vexim".
- Mỗi thư có một lý do nhận thư và một cách từ chối (trả lời thư, hoặc nút hủy khi đợt 2 xong).
### 1d. Tiêu đề và mạch thư

- Mã RFQ **đặt ở cuối tiêu đề**, dạng `Quotation for Cashew Kernels W320, CIF Gothenburg (Ref RFQ-20261101-00042)`.
  Không đặt mã trong ngoặc vuông ở đầu: hộp thư trên điện thoại chỉ hiện khoảng 40 ký tự
  đầu, nên phần người mua cần thấy là mặt hàng và điều kiện giao, không phải mã đơn.
- Một đơn dùng **một mã duy nhất** là mã RFQ (`lib/rfq/index.ts`); mã nội bộ `VXT-…`
  (`shortCode()`) chỉ còn là phương án dự phòng khi hồ sơ người mua chưa có RFQ.
- Thư tự động gửi kèm `Message-ID` do Vexim đặt (`lib/email/threading.ts`), dạng
  `<rfq.rfq-20261101-00042.3@veximtrade.com>`, lưu vào `email_messages.rfc_message_id`.
  Từ thư thứ hai trở đi, hệ thống gắn `In-Reply-To` và `References` trỏ tới các thư trước
  trong cùng mạch, nên Gmail/Outlook gom cả quá trình thành một chuỗi. Chỉ thư đã tới nơi
  (`sent`/`simulated`) mới được nối vào; bản nháp và thư gửi lỗi không tính.
- Cách viết này đã có tiền lệ ở `lib/email/service-inquiry.ts`. Bài kiểm tra
  `scripts/check-supplier-reminders.mjs` chặn hồi quy trên thư nhắc hồ sơ, còn
  `scripts/check-email-copy.mjs` quét cả 9 tệp soạn thư (`lib/email/**`, `lib/rfq/outreach.ts`,
  `lib/rfq/buyer-notify.ts`, `lib/rfq/supplier-question.ts`, `lib/supplier-portal/notify.ts`,
  `lib/supplier-portal/reminders.ts`) để chặn `—`, `–`, `→`, emoji, “chúng tôi”, “Kính gửi”,
  “Trân trọng”, “Anh/Chị”. Cả hai chạy trong `npm run check:email-lifecycle`.

## 2. Ba lớp email

| Lớp | Ví dụ | Có nút hủy nhận? | Cần consent marketing? |
| --- | --- | --- | --- |
| Giao dịch | ack RFQ, báo giá/shortlist, quyết định duyệt/từ chối hồ sơ, xác nhận tài khoản | Không (thư hệ quả của việc người nhận vừa làm) | Không |
| Dịch vụ theo sự kiện | nhắc hoàn thiện hồ sơ, chứng nhận sắp hết hạn, hồ sơ bị trả | Chỉ cần "trả lời thư này" + tôn trọng yêu cầu | Không, nhưng chỉ gửi cho tài khoản đang hoạt động và chỉ nhắc việc họ đã bắt đầu/yêu cầu |
| Marketing / bản tin | bản tin tuần cho buyer, gợi ý nhà cung cấp mới | Bắt buộc 1-click + trang tùy chọn | Có, mặc định không đăng ký |

## 3. Đợt 1 — đã có trong mã (thư dịch vụ cho nhà cung cấp)

| Sự kiện | Người nhận | Điều kiện | Giới hạn | Mã |
| --- | --- | --- | --- | --- |
| Hồ sơ xác minh còn bước dở | Tài khoản NCC đang hoạt động của đúng `supplier_id` | Cổng đã được duyệt; cấp đó NCC đã tự bắt đầu (có đợt kiểm/hồ sơ nháp/bị trả) hoặc đã tự gửi yêu cầu kiểm định; **không** nhắc khi đang `submitted`/`pending_review` | 1 thư/14 ngày/NCC, tối đa 6 thư/NCC, tối đa 40 thư/lượt | `lib/supplier-portal/reminders.ts`, `app/api/cron/supplier-reminders/route.ts`, gộp trong `app/api/cron/rfq-sla/route.ts` |
| Chứng nhận sắp hết hạn | Tài khoản NCC | Có `valid_until`, chưa từng nhắc mốc đó | Mốc 60/30/7/1 ngày, mỗi mốc 1 lần | `lib/certificate-service.ts` → `notifySupplierCertificateExpiry` (đã có từ trước) |
| Quyết định duyệt/trả hồ sơ, sản phẩm, chứng nhận | Tài khoản NCC | Sau khi DB đã đổi trạng thái | 1 thư/quyết định | `lib/supplier-portal/notify.ts` (đợt 2 trước đây) |

Ghi chú triển khai:

- Mỗi lần gửi được ghi vào `email_messages` với `kind = 'supplier_reminder'`, `direction = 'supplier'`, `created_by = null`. Chống trùng đọc từ chính bảng này (`store.listMessagesOfKind`), chỉ tính thư `sent`/`simulated`.
- Phải chạy `supabase/migrations/20261101_supplier_progress_reminders.sql` **trước khi deploy**: migration chỉ mở rộng CHECK `email_messages_kind_check`, không thêm bảng/cột. Nếu chưa chạy, cron trả `failed` (không gửi sai, nhưng không chống trùng được).
- Không cần thêm cron job: `/api/cron/rfq-sla` đã gọi kèm. Muốn tách lịch thì trỏ thêm một job vào `/api/cron/supplier-reminders` với cùng `CRON_SECRET`.
- Thư tiếng Việt, một CTA, không có link hủy nhận giả: hướng dẫn trả lời thư. Đây là giới hạn có chủ đích cho tới khi có hạ tầng ở đợt 2.
- Kiểm thử offline: `npm run check:email-lifecycle`.

## 4. Đợt 2 — hạ tầng đồng ý & khả năng phát (bắt buộc trước mọi email marketing)

Chưa triển khai. Đây là điều kiện tiên quyết, không phải tính năng phụ.

| Hạng mục | Yêu cầu |
| --- | --- |
| Danh sách chặn | Bảng `email_suppressions` (email, lý do, nguồn, thời điểm); mọi lần gửi marketing kiểm tra trước |
| Hủy nhận 1-click | Endpoint có token, header `List-Unsubscribe` + `List-Unsubscribe-Post` (Gmail/Yahoo yêu cầu cho bulk sender) |
| Trang tùy chọn | `/preferences/[token]`: chọn chủ đề (báo giá, nhà cung cấp mới, giá thay đổi) và tần suất; không cần tài khoản buyer |
| Bounce/complaint | Mở rộng `app/api/webhooks/resend/route.ts` xử lý `email.delivered`/`bounced`/`complained` → tự thêm vào danh sách chặn |
| Tên miền phụ | Gửi marketing bằng subdomain riêng để reputation của hộp thư dịch vụ không bị lây |
| Footer pháp lý | Tên pháp nhân + địa chỉ bưu chính (CAN-SPAM) + lý do nhận thư |
| Đo lường | Đếm mở/click tối thiểu; không dùng pixel theo dõi cá nhân nếu chưa có consent |

Căn cứ pháp lý khi bật bất kỳ email marketing nào: EU cần opt-in (không có ngoại lệ B2B thống nhất; Đức/Áo vẫn bắt buộc), Mỹ cần cơ chế hủy nhận + địa chỉ người gửi, Việt Nam (Nghị định 91/2020) cần đồng ý trước và cơ chế từ chối. Lấy mức chặt nhất.

## 5. Đợt 3 — bản tin cho người mua (chỉ khi đủ điều kiện)

| Sự kiện | Người nhận | Điều kiện |
| --- | --- | --- |
| Báo giá mới cho RFQ của họ | Buyer có RFQ đang mở | Đã gửi shortlist hoặc có match `quoted`; không lộ ghi chú nội bộ |
| Giá thay đổi ở sản phẩm đang theo dõi | Buyer đã đăng ký theo dõi | Cần bảng theo dõi + lịch sử giá; chưa có |
| Nhà cung cấp mới đã xác minh trong danh mục quan tâm | Buyer đã đăng ký nhận | Chỉ dùng đợt kiểm `approved`; gộp bản tin tuần |

Điều kiện mở đợt 3 (theo thứ tự, đủ cả ba mới bật):

1. Catalog đủ dày theo mục tiêu trong [marketing-supplier-aida.md](marketing-supplier-aida.md) — 12 sản phẩm/6 nhà cung cấp mỗi danh mục, ít nhất 2/3 danh mục.
2. Ít nhất 50 buyer thật trong CRM có email hợp lệ và có nguồn rõ ràng.
3. Có ít nhất 3–5 RFQ/tuần để bản tin có mục "báo giá mới" thật.

Chưa đủ thì bản tin tuần sẽ rỗng và tự mất người nhận sau vài số.

## 6. Không làm

- Email "sản phẩm tương tự"/"nhà cung cấp phù hợp" dựa trên hành vi duyệt web: hiện `supplier_traffic_daily` và `vexim_site_traffic_daily` chỉ là bộ đếm tổng hợp theo ngày, **không lưu danh tính người xem**. Muốn cá nhân hóa phải thêm tracking cá nhân → cần consent banner và có rủi ro pháp lý, chưa đáng ở quy mô hiện tại.
- Email khuyến mãi theo mùa kiểu Alibaba: không có lý do tồn tại khi số nhà cung cấp đã xác minh còn ít.
- Bán vị trí trong email/bản tin: trái với cách xếp hạng đang công bố.

## 7. Việc còn lại của đợt 1

- Outbox/retry bền vững và webhook `delivered/bounced/complained` vẫn là khoảng trống chung (xem [notification-email-audit.md](notification-email-audit.md)). Nhắc NCC hiện dựa vào ghi nhật ký best-effort: ghi lỗi thì lần sau có thể nhắc lại (chấp nhận hơn là chặn cả lượt cron).
- Chưa có trang để NCC tự tắt thư nhắc. Hiện chỉ tiếp nhận qua trả lời thư; khi có đợt 2 thì thêm công tắc vào trang tùy chọn của tài khoản NCC.
- Không có email tự động mời NCC làm thêm L2/L3 khi họ chưa hề yêu cầu — đó là việc bán hàng, phải do nhân viên chủ động liên hệ.
