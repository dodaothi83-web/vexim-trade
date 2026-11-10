# Vận hành RFQ: giao dịch trong tài khoản, email chỉ thông báo

> Tài liệu vận hành cho **luồng portal-only mới**. Không dùng các mô tả gửi báo giá,
> trả lời RFQ qua email hoặc nhân viên nhập báo giá thay NCC trong tài liệu lịch sử.
> Xem [đặc tả RFQ giai đoạn đầu](./rfq-foundation.md),
> [email RFQ cũ](./rfq-email-completion.md) và
> [giao RFQ đích danh cũ](./rfq-targeted-delivery.md) chỉ để đọc lịch sử.

## 1. Chọn đúng luồng

| | Đích danh (direct) | Tìm nguồn (sourcing) | Câu hỏi NCC cũ |
| --- | --- | --- | --- |
| Điểm vào | RFQ từ trang sản phẩm/NCC, có NCC được người mua chọn | Form RFQ chung không chọn NCC; hoặc yêu cầu tìm nguồn được Vexim chuyển thành RFQ | Chỉ giữ lịch sử; câu hỏi mới dùng Chat with supplier |
| Ai điều phối? | **Buyer và đúng NCC đã chọn**, Vexim không xử lý giao dịch | Vexim chọn NCC, mời, trao đổi và công bố báo giá | Không nhận RFQ câu hỏi mới |
| Ai thấy liên hệ buyer? | NCC đã chọn, thực sự được mời, có consent RFQ hợp lệ | Chỉ Vexim; NCC được mời không thấy liên hệ trực tiếp | Không mở thêm quyền từ dữ liệu cũ |
| Mạch trao đổi | Buyer ↔ từng NCC trong trang báo giá của NCC đó | Buyer ↔ Vexim (theo RFQ) **và** từng NCC ↔ Vexim (theo match); các mạch tách nhau | Mạch buyer–NCC cũ, nếu có, chỉ đọc |
| Giá | NCC nộp → tự công bố bản của chính mình | NCC nộp nháp → nhân viên xem và công bố | Không tạo báo giá mới |
| CRM | Nhân viên xem để hỗ trợ/tranh chấp, **không** phân công, mời, sửa giá hay chốt thay | `rfq.manage` được thêm NCC, mời, công bố, chốt; `rfq.view` chỉ đọc | Chỉ đọc |

RFQ đích danh **không tự rơi về hàng tìm nguồn hoặc email** nếu NCC thiếu cổng hay gửi
lỗi. Nếu giao dịch trực tiếp không thành, buyer tạo **RFQ tìm nguồn MỚI** qua form chung.
Báo giá, câu trả lời và quyết định được lưu trên cổng; thư chỉ dẫn về trang cần đăng nhập.

## 2. Form, xác thực và consent

- Buyer phải đăng nhập bằng email đã xác minh. Form `/rfq` một trang, hai cột: yêu cầu,
  số lượng, điểm đến, công ty, người liên hệ, email; ô cảng và các chi tiết khác là tuỳ chọn.
  Có thanh tiến độ `N/6 required`, honeypot, challenge, MX check, chấm spam và giới hạn
  5 RFQ/giờ theo buyer đăng nhập; IP/UA là lớp chặn sớm. Câu hỏi NCC không đi qua form này.
- Từ trang sản phẩm: server chỉ hiện thẻ sản phẩm khi danh mục và sản phẩm đã công bố,
  buyer-ready và đúng NCC. `source_product_id` được kiểm theo ID, không theo tên tự gõ;
  `product_text` là tên sản phẩm đã xác thực cộng yêu cầu tự viết. Từ menu, buyer tự mô tả.
  NCC chọn không hợp lệ hoặc chưa có cổng **published + approved + active** → báo lỗi,
  không âm thầm đổi thành tìm nguồn.
- Hai ô đồng ý độc lập: xử lý yêu cầu và chuyển thông tin **đúng phạm vi đang chọn**.
  Direct lưu bản chụp liên hệ + `rfq_contact_v2` cho NCC buyer đã chọn. Sourcing lưu bản
  chụp + `rfq_mediated_v1` để Vexim điều phối; NCC chỉ nhận thông tin yêu cầu, **không** nhận
  email/điện thoại/website buyer. Chỉ dùng bản chụp consent trong `rfqs.specs`, không dùng
  `buyers.hide_buyer_from_supplier`, `introductions` hoặc hồ sơ CRM để suy ra quyền.
  Trường hợp lịch sử `confirmed_by_buyer` phải liệt kê rõ ID NCC được người mua xác nhận.
- Giá mục tiêu mặc định riêng tư (`specs.share_target_price=false`); chỉ hiện cho NCC khi
  người mua chủ động bật chia sẻ. Ghi chú CRM, access token và tệp nội bộ không nằm trong
  projection cổng NCC. Đăng ký marketing là lựa chọn riêng, mặc định tắt.
- Direct bị đánh dấu nghi spam **bị từ chối trước khi lưu**, không giữ lại chờ nhân viên.
  Sourcing có thể vào `needs_review` hoặc cách ly `spam`; không tự mời NCC khi chưa duyệt.

## 3. Giao RFQ và báo giá

**Direct:** `submitRfq()` lưu RFQ + các match `proposed`. Chỉ khi *tất cả* NCC được chỉ
định còn published, cổng approved, tài khoản active và đúng consent, hệ thống mới chuyển
lời mời vào cổng của từng NCC (`sent_to_supplier_at`). Preflight migration/cổng thất bại
thì không dùng email để thay thế; RFQ đã lưu sẽ được cron thử lại. Sau khi lời mời được
lưu, email có link có thể gửi lỗi mà NCC vẫn mở được RFQ. Từng NCC chỉ đọc lời mời,
báo giá và mạch của mình. CRM không gán quan hệ Buyer–NCC hoặc cho nhân viên chuyển
RFQ này sang sourcing.

**Sourcing:** nhân viên có `rfq.manage` lập shortlist và mời NCC qua cổng, chỉ NCC
published + approved + active và có consent theo RFQ. Liên hệ buyer nằm ở Vexim; nội
dung yêu cầu hiển thị trong cổng NCC được lọc liên hệ. Không có NCC “chỉ có email” hay
đường gửi mời báo giá kèm Reply-To. Buyer có thể hỏi Vexim ngay khi RFQ còn mở; NCC
được mời có mạch riêng với Vexim trước khi công bố giá. Vexim không chuyển nguyên văn
mạch buyer sang NCC; nhân viên không được đưa liên hệ buyer vào mạch NCC.

**Giá:** NCC điền đơn giá, tiền tệ/đơn vị, Incoterm, lead time và lời nhắn hiển thị cho
buyer trong cổng approved. Ghi chú nội bộ NCC tách riêng, chỉ hiện trong timeline CRM.
Lưu nháp dùng compare-and-set theo `updated_at`; bản thay đổi ở tab khác không bị ghi đè.
Direct tự công bố đúng **giá NCC vừa nộp** nếu có grant; sourcing giữ `quoted` chờ nhân viên
xem và bấm “Công bố báo giá”. Nhân viên **không nhập/sửa giá thay NCC**. RPC
`publish_rfq_quotes` kiểm đúng phiên bản nháp, lưu `rfq_quote_versions` bất biến và outbox
cùng transaction; phiên bản cũ còn xem được khi bản sửa vẫn là nháp. Buyer xem báo giá
đã công bố theo từng NCC tại `/buyer/account/requests/[id]` và
`/buyer/account/requests/[id]/offers/[matchId]`; không thấy bản nháp của NCC.

Buyer trao đổi chọn mẫu/chốt với Vexim trong mạch tìm nguồn; nhân viên ghi nhận lựa chọn
trên CRM, match khác thành `not_selected`, ghi `introductions` cho mốc đối soát 12 tháng
(**không phải consent liên hệ**). Trạng thái `sampling`/`lost` gửi thông báo link-only;
`lost` bắt buộc lý do. Direct không có nút nhân viên chốt: buyer và NCC tự trao đổi qua
mạch riêng, cần Vexim thì tạo RFQ mới.

## 4. Mạch tin, quyền và lịch sử

- Tin RFQ chỉ văn bản, tối đa 2.000 ký tự, **12 tin / 10 phút / người gửi / mạch**; không
  gửi file qua mạch này. Chỉ buyer sở hữu RFQ, NCC sở hữu match đã mời/cổng approved,
  hoặc nhân viên đủ quyền mới gọi được action tương ứng. Mỗi action kiểm lại quyền và
  trạng thái; SQL RPC kiểm lại channel, consent và match dưới lock.
- Direct: mỗi NCC có một mạch buyer–NCC; staff chỉ đọc để hỗ trợ. Sourcing: một mạch
  buyer–Vexim theo `rfq_id`, mỗi NCC một mạch NCC–Vexim theo `match_id`. Staff `rfq.view`
  đọc/đánh dấu đã đọc; chỉ `rfq.manage` được gửi trong mạch Vexim. Người mua không được
  vào mạch NCC, NCC khác không được xem mạch hoặc giá nháp của nhau.
- Khi `won`, `lost` hoặc `spam`, mạch chỉ đọc. Tin buyer–NCC từ RFQ sourcing **cũ** vẫn đọc
  được bởi đúng người được phép, nhưng không thể gửi thêm (trigger SQL chặn cả server cũ).
  Không copy lịch sử đó sang mạch NCC–Vexim hoặc lộ cho NCC khác.
- Dấu đã đọc chỉ tiến tới sự kiện đã hiển thị trong chính mạch đó, không đánh dấu tin tương
  lai; CRM chỉ đánh dấu mạch đã cuộn tới, không đánh dấu mọi NCC khi mở trang.

## 5. Email là nhắc việc, không phải kênh giao dịch

| Sự kiện | Email được phép chứa | Nguồn chuẩn / chống lặp |
| --- | --- | --- |
| Buyer gửi RFQ | Mã RFQ + link tài khoản; sourcing báo nhân viên bằng link CRM | RFQ đã lưu; direct không vào hộp phân công |
| Mời NCC | Mã RFQ + link cổng; không kèm liên hệ, giá, nội dung yêu cầu hay Reply-To RFQ | Chỉ sau khi match được mời thật; lỗi email không rút lời mời |
| NCC công bố/direct hoặc Vexim công bố/sourcing | Thông báo có giá mới + link tài khoản, **không có bảng giá** | `rfq_portal_alerts` gắn phiên bản bất biến |
| Tin mạch chưa đọc | Link đúng mạch, **không kèm tin/giá/liên hệ** | Outbox chờ 10 phút, bỏ qua nếu đã đọc |
| Direct: NCC từ chối hoặc quá hạn phản hồi | Buyer: thông báo + link tài khoản. NCC: một thư nhắc trước hạn 24 giờ + link cổng | `buyer_status_update` theo `direct_declined:<match>` / `direct_no_response:<match>`; nhắc NCC theo `direct_due:<match>` |
| Chọn NCC, gửi mẫu, đóng mất đơn | Thông báo trạng thái và link, không kèm liên hệ buyer/giá/lý do chi tiết | `buyer_status_update` chống gửi lặp theo giai đoạn; mail lỗi không hủy dữ liệu |

Địa chỉ Reply-To RFQ/sourcing cũ (`rfq+…`, `buyer+…`, `sourcing+…`) **không nhận cập nhật
giao dịch nữa**. Webhook từ chối gắn các thư gửi tới alias cũ vào RFQ; lịch sử email và
mạch cũ vẫn đọc được. Email hỗ trợ/tài khoản và thư không phải RFQ tiếp tục theo luồng
riêng. Nếu NCC báo giá bằng email: yêu cầu họ đăng nhập cổng và nộp lại; không nhập giá
thay họ. Nếu buyer trả lời thư thông báo: hướng dẫn mở tài khoản/mạch liên quan.

Cron `GET /api/cron/chat-notify` (mỗi 5 phút, `Authorization: Bearer $CRON_SECRET`)
chạy độc lập thông báo chat, `rfq_portal_alerts`, `rfq_mediated_alerts` và
`retryPendingDirectRfqs`. Outbox gộp tin cùng mạch/người nhận, claim bằng CAS; gửi lỗi
thử lại theo backoff 10/20/... phút (tối đa 24 giờ); claim treo >20 phút được lấy lại.
Worker chết sau khi nhà cung cấp mail nhận nhưng trước khi ghi `sent` **có thể tạo một
email nhắc trùng**; không bao giờ nhân đôi bản báo giá vì mail không điều khiển công bố.
Direct retry quét **toàn bộ** RFQ mới có marker `portal_direct_v2` qua phân trang ID,
không cắt ở 50 và không phát lại báo giá/email RFQ lịch sử.

Cron `GET /api/cron/rfq-sla` nhắc nhân viên với **sourcing** chưa phân công sau 4 giờ
hoặc chưa phản hồi sau 20 giờ; không ghi cờ SLA/nhắc phân công direct hay câu hỏi cũ.
Đây là **giờ đồng hồ**, chưa phải giờ làm việc. Với **sourcing**, NCC im lặng chưa tự
thành `no_response`, nhân viên tìm nguồn tự đổi trạng thái khi cần.

Cùng cron này chạy `runDirectRfqFollowUps` cho **direct** (`lib/rfq/direct-followup.ts`),
vì không có nhân viên nào theo dõi luồng này:

- Còn dưới 24 giờ tới `response_due_at` mà NCC chưa báo giá, chưa từ chối, chưa nhắn
  trong mạch: gửi **một** thư nhắc tới tài khoản cổng đang hoạt động.
- Quá `response_due_at`: match chuyển `no_response` (compare-and-set, NCC vẫn báo giá
  được sau đó) và buyer nhận một thư báo chưa có phản hồi.
- NCC bấm từ chối: buyer nhận thư ngay trong action; cron gửi bù nếu lần đầu lỗi.
- Thư mời NCC được ghi vào `email_messages` (`rfq_outreach`, `direct_invite:<match>`).
  Thư ghi nhận `failed` được gửi lại một lần mỗi lượt quét cho tới hạn phản hồi; lời
  mời trong cổng không phụ thuộc vào thư này.

Trang `/buyer/account/requests/[id]` và danh sách RFQ trực tiếp hiện "Nhà cung cấp đã từ
chối" khi mọi NCC được chọn đều từ chối, hoặc "Nhà cung cấp chưa phản hồi" khi không còn
NCC nào đang trong hạn. Chỉ quét RFQ `portal_direct_v2` tạo trong 45 ngày gần nhất; thư
lỗi được thử lại trong 14 ngày. Cron chạy theo ngày thì các mốc trên trễ tối đa một ngày.

## 6. Migration, kiểm thử và sự cố

1. **Áp dụng migration trước khi deploy code mới**, đúng thứ tự:
   `supabase/migrations/20261116_rfq_portal_conversations.sql`, sau đó
   `supabase/migrations/20261117_rfq_vexim_mediation.sql`. Migration sau tạo mạch/outbox
   Vexim, RLS/grants/RPC và chặn tin buyer–NCC mới trên RFQ sourcing; không xóa email,
   tin hoặc báo giá lịch sử. Kiểm tra migration nào đã có trên môi trường trước khi chạy;
   **không chạy `supabase/schema.sql` trên production**.
2. Chạy `npm run check:rfq`, `npm run typecheck`, `npm run build`. Bài kiểm PGlite thực
   thi cả hai SQL trên DB cô lập, kiểm consent/grants/outbox/lịch sử; các regression còn
   kiểm email chỉ chứa link, cổng NCC, >50 RFQ direct, retry và chặn action CRM.
   Các bước này **không áp dụng migration lên Supabase thực tế**.
3. Smoke test sau triển khai trên môi trường được phép: 2 NCC active approved, một
   RFQ direct nhiều NCC, một RFQ sourcing, một NCC chưa approved, một quote sửa,
   hai mạch NCC–Vexim riêng; thử lỗi SMTP/cron và vào trang bằng tài khoản sai.
   Xác nhận NCC chỉ thấy phần mình, không thấy liên hệ buyer ở sourcing và buyer
   không thấy nháp. Theo dõi mã phản hồi cron; lỗi một nhánh trả 503 nhưng các nhánh
   còn lại vẫn chạy.
4. **RFQ direct chưa tới NCC:** kiểm match `proposed`, eligibility tài khoản NCC,
   consent, `direct_delivery_version` và log `direct portal retry`; không bấm nút CRM
   gửi mail hoặc chuyển vào sourcing. **Giá đã lưu nhưng buyer chưa thấy:** kiểm
   match `quoted`, `updated_at`, RPC publish, `rfq_quote_versions` rồi để cron retry
   đúng bản direct mới. Staff không công bố thay cho direct.
5. **Không thấy mạch/giá sourcing:** kiểm migration, match có `sent_to_supplier_at`,
   consent, bảng `rfq_mediated_threads`/`rfq_mediated_messages` và các phiên bản đã
   công bố. **Email không tới:** kiểm `rfq_portal_alerts` hoặc `rfq_mediated_alerts`
   (`status`, `attempts`, `last_error`, `not_before`), account người nhận và log cron.
   Không công bố lại chỉ để thử gửi thư; nội dung vẫn nằm trong tài khoản.

**Giới hạn hiện còn:** hộp RFQ trong CRM và cron SLA còn đọc danh sách RFQ toàn cục
không phân trang. Cấp mã RFQ chỉ đọc mã của ngày hôm đó (`listRfqs({ codePrefix })`) và
thử lại với số kế tiếp khi trùng mã do gửi đồng thời. RFQ direct chưa có quy tắc đóng, nên
`retryPendingDirectRfqs` vẫn đọc mỗi RFQ direct đang mở một lần mỗi 5 phút. Không suy diễn một email đã gửi
là báo giá đã được công bố hay có quyền xem dữ liệu.
