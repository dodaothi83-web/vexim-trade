# Luồng vận hành RFQ — tóm tắt

Tài liệu mô tả **cách luồng RFQ đang chạy trong code hiện tại**, để người vận hành đọc một lần là
làm được. Bối cảnh: nền tảng **không thu hoa hồng đơn hàng**, người mua ký hợp đồng trực tiếp với
nhà cung cấp. Bản ghi `introductions` là mốc lựa chọn/Thời gian bảo hộ 12 tháng, **không phải
bằng chứng đồng ý chia sẻ liên hệ**. Quyền đó lưu theo từng RFQ và người nhận; xem
[quy trình đồng ý/chuyển giao](./rfq-buyer-contact-consent.md).

- Đặc tả gốc: `docs/rfq-foundation.md` · Email: `docs/rfq-email-completion.md`
- Rà soát lỗi còn mở: `docs/rfq-luong-kiem-tra-2026-11.md`

## 1. Có hai luồng khác nhau, đừng lẫn

| | **A. Báo giá (quote)** | **B. Trao đổi với NCC (chat)** |
| --- | --- | --- |
| Điểm vào | `/rfq` (hoặc từ trang sản phẩm/NCC, có thể chỉ định sẵn NCC) | Nút “Chat with supplier” trên trang sản phẩm |
| Số NCC | Mở: NCC phù hợp do Vexim chọn; đích danh: NCC Buyer chỉ định | Đúng NCC đang chat |
| Liên hệ người mua | Checkbox chia sẻ riêng; chỉ NCC thực sự nhận RFQ thấy bản chụp liên hệ đã đồng ý. RFQ đích danh không cấp phép NCC được đề xuất sau | Quyền và nội dung chat riêng, **không tự lộ email Buyer** |
| Vexim ở giữa? | NCC đích danh được gửi trực tiếp khi đủ điều kiện; RFQ mở/nhiều NCC do nhân viên duyệt, gửi, thu báo giá | Trao đổi trực tiếp trong chat |
| Ghi vào CRM | Chỉ RFQ đích danh đúng một NCC tự gắn Buyer sau khi gửi; không gửi email kết nối riêng | Không tạo RFQ mới |

RFQ `supplier_question` cũ vẫn đọc được trong CRM nhưng **không còn nhận câu hỏi mới hay gửi qua luồng RFQ**.
Chính sách ẩn danh cũ không được áp dụng cho các RFQ mới; RFQ cũ không có consent vẫn phải hỏi Buyer trước khi gửi thêm.

## 1b. Form RFQ: một trang, 2 cột, 6 ô bắt buộc + thanh tiến độ

Form báo giá **không còn chia 3 bước**. Một trang duy nhất, bố cục hai cột theo bản thiết kế
đã duyệt: cột trái là nội dung, cột phải là khung **"Your request"** theo dõi tiến độ.

| # | Ô | Vì sao bắt buộc |
| --- | --- | --- |
| 1 | What do you need? (mô tả tự do, tối đa 4.000 ký tự, có bộ đếm) | Nội dung email NCC + chấm điểm spam + ghép NCC |
| 2 | Quantity (+ đơn vị) | Email NCC in "Số lượng"; thiếu là NCC không báo giá được |
| 3 | Destination (gõ để tìm, nhãn ngắn cho vừa cột) | Email NCC nêu thị trường đích |
| 4 | Company | Hồ sơ người mua, xác nhận danh tính |
| 5 | Your name | Email xác nhận + thư cho NCC |
| 6 | Work email | Nơi trả lời + kiểm tra MX |

Bố cục: khung trang rộng **1120px**, cột phải "Your request" 290px, cột form nhận phần còn
lại. Ba ô số lượng/điểm đến/cảng **không** xếp thành ba cột nữa (hẹp quá, chữ nhãn bị ép):
nhóm này dùng **container query** — container ≥640px thì hàng 1 là Quantity (input tối thiểu
120px) + Unit (130px), hàng 2 là Destination | Port; hẹp hơn thì mỗi ô một hàng. Dùng
container query thay breakpoint màn hình để cột form co giãn đúng theo bề rộng thật của nó.

Ô "What do you need?" **bắt đầu trống**, không điền sẵn tiêu đề sản phẩm: người mua tự mô tả
nhu cầu bằng lời của họ. `source_product_id` vẫn được gửi làm dấu vết "đến từ trang sản phẩm
nào"; chỉ khi đổi danh mục mới bỏ liên kết này (tránh gán sai sản phẩm).

Banner nhà cung cấp chỉ định dùng **tên ngắn** — tên hiển thị → tên thương mại → tên pháp
nhân đã hạ kiểu chữ và bỏ tiền tố "Công ty TNHH / CP / Co., Ltd" (`supplierShortName()` trong
`lib/public/supplier-name.ts`), không bày tên giấy phép viết hoa toàn bộ lên đầu form.

Cộng thêm **hai ô đồng ý riêng** bắt buộc: xử lý yêu cầu và chia sẻ bản chụp liên hệ với NCC thực sự nhận RFQ; không
tính vào thanh tiến độ. Khung bên phải hiện thanh tiến độ `N/6 required` và 6 dòng đánh dấu
ô nào đã điền, để người mua biết còn thiếu gì **trước** khi bấm gửi. Trên mobile khung này
đứng trước form.

**Port (optional)** nằm ngay cạnh quốc gia: cảng giúp desk chọn tuyến và giúp NCC báo giá
sát hơn, nhưng không bắt buộc vì nhiều người mua chỉ biết quốc gia.

Mọi thứ còn lại nằm trong mục **"Add details (optional)"** — đóng mặc định, tự mở khi URL đã
điền sẵn `grade` hoặc khi người mua đến từ link yêu cầu mẫu: category, grade/spec, incoterm
(mặc định "Not sure yet"), **Shipment month** (thay cho ngày cần chính xác — người mua thường
chỉ biết tháng; dùng ô chọn tháng của trình duyệt `<input type="month">`, giá trị `YYYY-MM`).
Lưu ý đã chấp nhận: placeholder của ô này do **ngôn ngữ máy người dùng** quyết định, không do
trang — máy tiếng Việt hiện "---- năm ----", máy tiếng Anh hiện "---- month ----". Đã thử thay
bằng ô chọn tự dựng và quyết định quay lại ô gốc vì thao tác chọn tháng quen thuộc hơn., tần suất mua, bao bì/nhãn, chứng chỉ (chip chọn nhanh: HACCP, BRCGS,
ISO 22000, FSSC 22000, Halal, Kosher, Organic), samples/inspection/video call, giá mục tiêu
kèm đơn vị và ô chia sẻ, điện thoại, website, loại hình, ghi chú. Dữ liệu vẫn được gửi đủ
như trước, chỉ khác là không bắt người mua nhìn thấy.

**Giá mục tiêu mặc định là riêng tư.** `specs.share_target_price` mặc định `false`; email cho
NCC chỉ ghi "Người mua chưa đồng ý chia sẻ giá mục tiêu. Vui lòng chào giá tốt nhất." Người
mua phải tự tick "Share my target price with suppliers" thì con số mới được in. Lý do: nếu
NCC thấy trần giá, họ sẽ chào đúng bằng trần. Email nội bộ cho desk thì luôn thấy giá, kèm
nhãn "(internal)" và ghi chú "not shared with suppliers" khi người mua chưa đồng ý.

Cuối form có ô tuỳ chọn **"Send me occasional sourcing updates from Vexim (optional)"**
(`marketing_opt_in`, mặc định tắt) — tách khỏi consent xử lý yêu cầu, đúng nguyên tắc đồng ý
riêng cho từng mục đích.

Lý do sửa: bản 3 bước trước đây có lỗi chặn — `validateStep(2)` kiểm company/name/email/consent
trong khi các ô đó chỉ render ở bước 3, nên bấm "Continue" ở bước 2 không đi tiếp được và
**không hiện thông báo lỗi nào**. Giờ có một hàm validate duy nhất cho mỗi chế độ, kiểm đúng
những ô đang hiển thị, cuộn và focus tới ô lỗi đầu tiên. `scripts/check-rfq-form-compact.mjs`
giữ luật này, đồng thời chặn việc đưa giá mục tiêu ra ngoài mục chi tiết hoặc đổi mặc định
chia sẻ.

### Hai trạng thái của form

**A. Mở từ trang sản phẩm** (`?category=…&suppliers=…&product_id=…&grade=…`)

Server đọc lại sản phẩm (`lib/public/rfq-product-context.ts`) và chỉ dựng thẻ
**"You are asking about"** khi sản phẩm đã qua cổng công bố: nằm trong danh sách buyer-ready
của danh mục, đúng nhà cung cấp đã chỉ định, danh mục đã publish. Mọi trường hợp khác trả
`null` và form rơi về trạng thái B — không đoán, không hiện dữ liệu chưa duyệt.

Thẻ hiện: ảnh buyer-shareable · tên sản phẩm · tên ngắn nhà cung cấp (link hồ sơ) · **tên các
bước xác minh đã duyệt** ("✓ Documents checked"), không dùng cách đếm "x/3 approved" ·
grade · MOQ · giá tham khảo + incoterm + ngày cập nhật · cảng xuất · chip chứng nhận kèm link
"See certificates" · đóng gói và lead time trong `<details>`. Không có popover.

Khi có thẻ:
- ô mô tả thành **"Your requirements"** và **không bắt buộc** — tên sản phẩm do server dựng;
- dòng đầu checklist là **"Product"** và tự tick, nên vẫn là `N/6 required`;
- gợi ý dưới các ô: MOQ của nhà cung cấp, cảng đích so với cảng xuất, incoterm của giá tham khảo.

**B. Vào từ menu** — không có thẻ; ô **"What do you need?"** vẫn bắt buộc như trước.

Thanh chuyển hai trạng thái trong bản thiết kế là công cụ của canvas, **không** đưa vào
production.

### product_text lấy từ đâu

`source_product_id` được xác thực theo `product_id` (khớp sản phẩm buyer-ready + đúng nhà
cung cấp + đúng danh mục), **không so khớp tên người mua gõ**. Nhờ vậy:

- mở từ trang sản phẩm: `product_text` = tên sản phẩm (server dựng) + phần người mua viết
  thêm, cách nhau bằng dấu chấm. Không cần gõ lại tên sản phẩm;
- vào từ menu: vẫn bắt buộc mô tả;
- `specs.product_ref = { id, name }` giữ dấu vết sản phẩm đã xác thực để desk đối chiếu khi
  người mua sửa mô tả.

Câu hỏi cho NCC nay qua chat riêng, không gửi RFQ `supplier_question` mới.

## 2. Luồng A — báo giá, từ đầu đến cuối

```
NGƯỜI MUA (đã đăng nhập bằng email đã xác minh)
  │  Form một trang: sản phẩm/số lượng/quốc gia/công ty + thanh tiến độ
  │  + honeypot + challenge chống bot + hai ô đồng ý (xử lý và chia sẻ liên hệ)
  ▼
submitRfq()  lib/rfq/submit.ts
  ├─ rate limit theo IP+UA ................................ 5 lượt/giờ (xem cảnh báo §7)
  ├─ xác thực sản phẩm / nhà cung cấp người mua chọn (theo id, không theo tên)
  ├─ chấm điểm spam:  <40 new │ 40–99 needs_review │ ≥100 spam
  │     (thiếu challenge +60, honeypot +100, link +25, công ty +15, SĐT +10,
  │      webmail +5, nội dung < 20 ký tự +20 — bỏ khi đã có sản phẩm/NCC xác thực)
  ├─ chặn MX domain, tuỳ chọn chặn webmail, bắt buộc hai ô đồng ý
  ├─ upsert Buyer theo email (không ghi đè NCC CRM, stage/owner/ghi chú/CC cũ)
  ├─ tạo rfqs + mã RFQ-YYYYMMDD-XXXXX + access_token + liên hệ/consent riêng trong specs
  ├─ ghi audit_log
  ├─ nếu người mua đã chỉ định NCC → tạo match "proposed"; đúng một NCC (từ trang
  │   sản phẩm hoặc trang NCC) và RFQ "new" → chuyển thẳng tới đúng NCC đó cùng liên hệ đã đồng ý.
  │   NCC có cổng approved đang hoạt động: cổng nhận lời mời khi match đã lưu; email chỉ thông báo.
  │   NCC chỉ có email: chỉ đánh dấu đã gửi khi Resend trả sent; lỗi/mô phỏng thì vẫn proposed.
  │   Sau khi đã gửi RFQ một NCC, Buyer chưa có NCC CRM mới được tự gắn bằng CAS, không email kết nối.
  │   RFQ bị giữ lại: khi nhân viên duyệt sang Mới / Đang xử lý thì chuyển tiếp như trên.
  └─ email: xác nhận cho người mua (kèm link riêng) + báo hộp thư nội bộ
       │  (spam: KHÔNG gửi xác nhận cho người mua, chỉ báo nội bộ)
       ▼
CRM  /crm/rfqs  — hộp thư, tab theo trạng thái
  │  • Phân công người phụ trách  → tự chuyển new/needs_review → in_progress
  │  • "Cần duyệt" (needs_review): đọc rồi hoặc xử lý tiếp, hoặc đánh dấu spam
  │  • Đề xuất NCC (chỉ NCC published; chưa được xem liên hệ Buyer)
  ▼
dispatchRfqToSuppliers()  lib/rfq/outreach.ts
  ├─ bắt buộc người gửi là nhân viên thật (tên người, email domain đã cấu hình)
  ├─ chỉ NCC được phép nhận (canInviteSupplier: đã duyệt cổng / NCC cũ do Vexim quản lý)
  ├─ chỉ gửi khi đúng NCC có xác nhận chia sẻ liên hệ; không còn email RFQ ẩn danh
  ├─ email có bản chụp liên hệ Buyer (không kèm CRM/ghi chú/token); Reply-To định tuyến về match
  ├─ hạn phản hồi mặc định 3 ngày (chọn 2/3/5/7) → match.response_due_at
  ├─ khi Resend nhận thật: match proposed → sent_to_supplier ; rfq → matching
  ├─ RFQ đích danh một NCC: gắn Buyer CRM sau khi match đã lưu là sent (nếu Buyer chưa gắn NCC)
  └─ gửi lỗi/mô phỏng thì KHÔNG đánh dấu đã gửi (bấm lại được)
       ▼
NCC có cổng approved: mở /supplier/portal/rfqs → chọn RFQ của mình
  ├─ Có thể hỏi người mua qua mạch tin RFQ đích danh ngay sau khi được mời và có consent.
  ├─ Nhập đơn giá + thời gian giao/Incoterm + **Lời nhắn gửi người mua** (tối đa 1000 ký tự).
  ├─ **Ghi chú nội bộ Vexim** là trường khác, chỉ vào timeline CRM; không bao giờ nằm
  │   trong phiên bản báo giá hoặc mạch tin của người mua.
  ├─ Lưu giá bằng CAS (nếu staff/NCC đã sửa ở tab khác, phải tải lại).
  ├─ RFQ đích danh, đúng NCC và có consent → tự công bố trên tài khoản buyer ngay
  │   sau lưu; email thông báo có thể lỗi mà báo giá vẫn xem được.
  └─ RFQ tìm nguồn → báo giá nháp `quoted`, chờ nhân viên xem và bấm "Công bố báo giá".

NCC chỉ có email: trả lời qua Reply-To → webhook lib/mail/inbound.ts kiểm tra người gửi,
lưu timeline, đánh dấu thời điểm phản hồi đầu. Staff đọc thư rồi nhập giá vào CRM (không
đọc giá tự động từ email). RFQ đích danh hợp lệ tự công bố; tìm nguồn vẫn chờ staff.
       ▼
publish_rfq_quotes() — RPC / local store, staff xác nhận đúng phiên bản nháp đã xem
  ├─ chỉ nhận match thuộc RFQ, đã mời, trạng thái `quoted`, giá > 0 và updated_at
  │   khớp bản staff/supplier vừa duyệt (nháp thay đổi trong lúc xác nhận → bỏ qua).
  ├─ một transaction: lưu rfq_quote_versions (append-only), đổi match thành
  │   presented_to_buyer + sent_to_buyer_at, ghi outbox rfq_portal_alerts,
  │   rfq → quoted / first_response_at. Gửi lại không nhân đôi phiên bản.
  └─ người mua đăng nhập /buyer/account/requests/[id] để so sánh báo giá công bố;
      mỗi NCC có trang riêng /offers/[matchId], lịch sử phiên bản và mạch hỏi đáp.
      Bản sửa `quoted` chưa công bố KHÔNG thay giá/buyer note của phiên bản cũ.
       ▼
Buyer hoặc NCC nhắn văn bản (tối đa 2000 ký tự, 12 tin/10 phút/mỗi bên/mỗi match)
  ├─ chỉ tài khoản buyer sở hữu RFQ và NCC sở hữu đúng match; staff xem từng mạch
  │   trong CRM. Các NCC khác không được đọc. Trạng thái đóng chỉ đọc, không gửi mới.
  ├─ consent riêng RFQ/NCC bắt buộc; sourcing chỉ bắt đầu khi staff công bố match.
  ├─ tin nhắn KHÔNG tự sửa đơn giá hoặc điều kiện báo giá chính thức.
  ├─ đánh dấu đã đọc khi mở trang đến sự kiện thực sự hiển thị, không đánh dấu tin tương lai.
  └─ outbox trì hoãn email tin nhắn 10 phút; nếu đã đọc thì bỏ qua thư. Email là
      đường nhắc, không phải đường phân quyền hay điều kiện công bố.
       ▼
Người mua chọn một NCC  →  "Chọn nhà cung cấp này"
  ├─ match → selected, các match khác → not_selected
  ├─ ghi introductions (mốc lựa chọn/bảo hộ 12 tháng, không phải consent RFQ)
  ├─ email cho NCC đã được gửi RFQ và có consent, kèm liên hệ đã xác nhận; không gửi cho NCC chỉ đề xuất
  └─ rfq → won
     (hoặc đi đường "Chuyển sang sampling" → rfq → sampling + email báo người mua)
```

**Chốt thất bại:** nút "Đóng mất đơn" **bắt buộc** chọn lý do (`price`, `lead_time`, `quality`,
`no_response`, `buyer_went_elsewhere`, `cancelled`, `other`) → `rfq → lost` + email giải thích cho
người mua. Mỗi giai đoạn (`sampling`, `lost`) chỉ gửi **một** email cho người mua, có cơ chế chống
gửi lặp ở tầng DB.

## 3. Trạng thái: ai/cái gì làm thay đổi

### RFQ

| Trạng thái | Ý nghĩa | Do đâu |
| --- | --- | --- |
| `new` | Vừa nhận, sạch | Hệ thống (submit) |
| `needs_review` | Điểm spam 40–99, cần người đọc | Hệ thống (submit) |
| `in_progress` | Đã có người phụ trách | Nhân viên phân công |
| `matching` | Đã gửi ≥1 NCC | Hệ thống (dispatch) |
| `quoted` | Có ít nhất một phiên bản báo giá đã công bố trong tài khoản người mua | Hệ thống (công bố) |
| `sampling` | Chốt NCC, bắt đầu gửi mẫu | Nhân viên |
| `won` | Người mua chọn NCC / chốt | Nhân viên chọn NCC |
| `lost` | Đóng, có lý do | Nhân viên (bắt buộc lý do) |
| `spam` | Cách ly | Hệ thống hoặc nhân viên |

### Match (một NCC trong một RFQ)

`proposed` → `sent_to_supplier` → `quoted` (nháp) → `presented_to_buyer` (đã công bố) → `selected` / `not_selected`
Sửa giá sau công bố: `presented_to_buyer` → `quoted` (bản mới chờ công bố; bản cũ vẫn hiển thị) → `presented_to_buyer` (phiên bản kế).
Nhánh phụ: `declined` (NCC từ chối), `no_response` (im lặng — **hiện chưa tự chuyển**, xem §7).

## 4. Ai được làm gì

| Việc | admin | sale | viewer | NCC (cổng riêng) |
| --- | :-: | :-: | :-: | :-: |
| Xem hộp RFQ, chi tiết, timeline | ✓ | ✓ | ✓ (chỉ đọc) | — |
| Phân công, đổi trạng thái, thêm NCC, gửi email | ✓ | ✓ | — | — |
| Nhập báo giá, công bố RFQ tìm nguồn, chốt NCC | ✓ | ✓ | — | — |
| Xem danh sách RFQ được chuyển cho mình | — | — | — | ✓ (chỉ của mình) |
| Báo giá, sửa giá; hỏi đáp trong RFQ của mình | — | — | — | ✓ (cổng approved; liên hệ buyer chỉ khi có consent riêng) |

Nguyên tắc email: thư cho **NCC** gửi từ email cá nhân của nhân viên thật (không dùng hộp chung
`sales@`); thư cho **người mua** gửi từ địa chỉ công ty với Reply-To `buyer+{mã}@domain` để hồi âm
tự gắn vào đúng RFQ.

## 4b. AI chỉ là phần thêm — không bao giờ trên đường critical

**Quy tắc bất biến:** AI lỗi, treo, trả rác hay chưa cấu hình thì RFQ **vẫn phải lưu, vẫn phải
gửi email, vẫn trả về link theo dõi**. Không có ngoại lệ.

Thứ tự thực thi trong `submitRfq()`:

```
validate → rate limit → spam score → MX → lưu buyer → lưu RFQ → audit → email → [after()] → response
                                                                              ↑
                                                     AI chạy SAU khi response đã gửi xong
```

Cơ chế bảo vệ, theo thứ tự từ ngoài vào trong:

| Lớp | File | Nếu lớp này hỏng |
| --- | --- | --- |
| `try/catch` tại chỗ gọi | `lib/rfq/submit.ts` | Không throw ra ngoài; RFQ đã lưu từ trước đó |
| `scheduleRfqEnrichment()` không throw | `lib/rfq/enrich.ts` | Thiếu `after()` → bỏ qua lần trích xuất |
| `after()` của Next | `lib/rfq/enrich.ts` | Tác vụ chạy sau response, lỗi chỉ ghi log |
| `enrichRfqAfterSubmit()` bọc toàn bộ | `lib/rfq/enrich.ts` | Trả `{ applied: false }` |
| `extractRfqFields()` bọc toàn bộ + timeout cứng + AbortController | `lib/rfq/ai-extract.ts` | Trả `{ ok: false, reason }` |

Thêm các ràng buộc dữ liệu:

- **Mặc định tắt.** Cần cả `RFQ_AI_EXTRACT=true` và `OPENAI_API_KEY`.
- **Chỉ điền ô trống.** Không ghi đè bất cứ gì người mua đã nhập hoặc nhân viên đã sửa.
- **Chạy một lần.** Có `specs.ai_extract` là bỏ qua, không gọi lại model.
- **Whitelist + ép kiểu.** JSON rác, khoá lạ, ngày không tồn tại, giá không phải số → bị loại.
- **Không gửi PII.** Email/số điện thoại của người mua bị xoá trước khi gọi nhà cung cấp AI.
- **Câu hỏi trực tiếp cho NCC** không chạy trích xuất (không có trường báo giá để điền).
- **Có dấu vết để hoàn tác:** `specs.ai_extract = { ok, reason, model, at, filled, summary }`.

Kiểm chứng tự động: `npm run check:rfq` chạy `scripts/check-rfq-ai-isolation.mjs`, mô phỏng
model ném lỗi, model treo quá timeout, JSON rác, thiếu key, `after()` không khả dụng, store lỗi,
và **module AI ném lỗi đồng bộ ngay khi submit gọi** — tất cả đều phải cho `ok: true` + RFQ đã lưu.

> Lưu ý pháp lý: gửi nội dung RFQ của người mua sang nhà cung cấp AI là một mục xử lý dữ liệu mới.
> Trước khi bật `RFQ_AI_EXTRACT=true` trên production, phải bổ sung mục này vào Chính sách bảo mật
> và nêu rõ đã xoá thông tin liên hệ trước khi gửi.

## 5. Các điểm chạm email (bảng tra nhanh)

| Khi nào | Gửi cho | Nội dung | Chống lặp |
| --- | --- | --- | --- |
| Submit (sạch) | Người mua | Đã nhận + tóm tắt + link trạng thái + "phân công trong 4 giờ làm việc" | — |
| Submit (mọi trường hợp trừ spam) | Hộp thư nội bộ | RFQ mới / cần duyệt / đã cách ly, kèm link CRM | — |
| Gửi NCC | NCC | RFQ + bản chụp liên hệ Buyer đã đồng ý + hạn phản hồi; không có token/ghi chú CRM | Một lần/một match |
| Nhắc NCC | NCC | Liên hệ Buyer đã đồng ý + nhắc phản hồi (nút thủ công, chỉ khi đã gửi) | Thủ công |
| Công bố báo giá | Người mua | Chỉ thông báo có báo giá/bản sửa mới và link tài khoản, **không kèm bảng giá** | Một outbox event cho mỗi phiên bản; lỗi retry |
| Tin nhắn RFQ chưa đọc | Người mua/NCC | Chỉ link vào mạch riêng; **không kèm nội dung, giá hay liên hệ** | Sau 10 phút; đã đọc thì bỏ qua; retry khi lỗi |
| Chốt NCC | NCC | "Vexim đã chọn hồ sơ của bạn" + liên hệ đã đồng ý | Chỉ gửi khi match đã thực sự được mời và có consent |
| Sang sampling / đóng lost | Người mua | Cập nhật trạng thái + bước tiếp theo / lý do | Unique index theo `(rfq, stage)` |
| Câu hỏi sản phẩm cũ | — | Không còn nhận RFQ câu hỏi mới; nút Ask supplier dùng chat riêng | — |

### Triển khai / kiểm tra RFQ portal

1. **Chạy `supabase/migrations/20261116_rfq_portal_conversations.sql` trước khi deploy app.**
   Nó mở rộng `rfq_matches.quote_price` lên 4 chữ số thập phân, tạo phiên bản/tin/outbox,
   RPC và quyền service role. Chỉ backfill giá đã trình trước đây khi match **không** ở
   trạng thái `quoted`: mốc gửi cũ có thể tồn tại bên cạnh bản sửa chưa công bố, không được
   đoán giá cũ hay chuyển ghi chú nội bộ thành lời nhắn người mua. Mốc gửi email cũ
   của bản nháp được lưu riêng ở `legacy_sent_to_buyer_at`, còn `sent_to_buyer_at` xóa để
   không mở mạch tin tìm nguồn khi chưa công bố. Nhân viên xem timeline cũ và công bố
   lại báo giá theo quy trình nếu cần.
2. Chạy `npm run check:rfq` hoặc `npm run check:rfq-portal` (PGlite thực thi SQL thật,
   kiểm phân quyền, backfill, phiên bản, CAS, consent, rate limit và outbox; không ghi production).
3. Đảm bảo cron `GET /api/cron/chat-notify` chạy mỗi 5 phút với `Authorization: Bearer
   $CRON_SECRET`. Cron xử lý chat và outbox RFQ độc lập; lỗi transport không thu hồi phiên
   bản đã công bố. Lần gửi mới có thể thử ngay; nếu thất bại, cron lấy lại theo backoff
   10 phút, 20 phút... tối đa một ngày. Claim treo >20 phút được retry; thư có thể trùng
   nếu nhà cung cấp email nhận nhưng worker chết trước khi ghi thành công.
4. Nếu báo giá buyer không hiện: kiểm tra `rfq_quote_versions` + match.status trước,
   không kiểm tra mail sent. Nếu tin không gửi: kiểm consent/đã mời/trạng thái và giới hạn
   tần suất. Nếu email không tới: xem `rfq_portal_alerts.status`, `last_error`, `not_before`
   và log cron; **không bấm công bố lại chỉ để thử gửi mail**. Với báo giá đích danh lỗi
   ở bước công bố, staff kiểm bản nháp trong CRM rồi dùng nút công bố.
5. Không gửi tài liệu đính kèm qua mạch RFQ hiện tại (chỉ văn bản); nếu cần trao đổi file,
   liên hệ Vexim theo cách cũ. Không sao chép nội dung tin nhắn riêng sang email thông báo.

## 6. SLA và cron

Cron `GET /api/cron/rfq-sla` (header `Authorization: Bearer $CRON_SECRET`), chạy mỗi giờ, **idempotent**
— không gửi lại cùng một cảnh báo; chỉ ghi cờ sau khi Resend nhận thật (gửi lỗi thì lần sau thử lại).

| Cảnh báo | Điều kiện | Cờ chống lặp |
| --- | --- | --- |
| Chưa phân công | RFQ chưa có `assigned_to`, tuổi ≥ 4 giờ | `specs.sla_unassigned_alerted_at` |
| Sắp trễ hạn phản hồi | Chưa có `first_response_at`, tuổi ≥ 20 giờ | `specs.sla_due_alerted_at` |

Cron này còn chạy kèm: nhắc chứng nhận NCC sắp hết hạn và nhắc NCC hoàn thiện hồ sơ xác minh.
RFQ **câu hỏi trực tiếp** và RFQ `spam` được loại khỏi mọi cảnh báo SLA báo giá.

## 7. Những chỗ code đang lệch mô tả ở trên

Đã ghi chi tiết trong `docs/rfq-luong-kiem-tra-2026-11.md`; ở đây chỉ nêu phần ảnh hưởng vận hành:

1. **SLA đang tính bằng giờ đồng hồ**, không phải giờ làm việc 9–18 T2–T6 như tài liệu → cảnh báo
   có thể nổ ngoài giờ hoặc sáng Thứ Bảy.
2. **NCC im lặng không tự thành `no_response`** — người phụ trách phải tự đổi trạng thái.
3. **Lớp chặn IP/UA cho submit RFQ vẫn nằm trong bộ nhớ** và không đồng bộ giữa các lambda;
   lớp chính theo buyer đăng nhập đếm RFQ trên dữ liệu dùng chung. Chặn tin nhắn portal là
   12 tin/10 phút ở DB, không phụ thuộc bộ nhớ tiến trình.
4. Danh sách người mua/RFQ **không phân trang** → từ 1000 bản ghi trở lên sẽ tạo hồ sơ người mua
   trùng và tab RFQ đếm sai.
