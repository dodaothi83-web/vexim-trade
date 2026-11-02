# Luồng vận hành RFQ — tóm tắt

Tài liệu mô tả **cách luồng RFQ đang chạy trong code hiện tại**, để người vận hành đọc một lần là
làm được. Bối cảnh: nền tảng **không thu hoa hồng đơn hàng**, người mua ký hợp đồng trực tiếp với
nhà cung cấp; bản ghi `introductions` giữ vai trò *bằng chứng người mua đã đồng ý chia sẻ liên hệ*
và *mốc Thời gian bảo hộ 12 tháng*.

- Đặc tả gốc: `docs/rfq-foundation.md` · Email: `docs/rfq-email-completion.md`
- Rà soát lỗi còn mở: `docs/rfq-luong-kiem-tra-2026-11.md`

## 1. Có hai luồng khác nhau, đừng lẫn

| | **A. Báo giá (quote)** | **B. Câu hỏi sản phẩm (supplier question)** |
| --- | --- | --- |
| Điểm vào | `/rfq` (hoặc từ trang sản phẩm/NCC, có thể chỉ định sẵn NCC) | Nút "Hỏi nhà cung cấp" ở trang sản phẩm → `/rfq?intent=question` |
| Số NCC | 1 hoặc nhiều | **đúng 1** |
| Liên hệ người mua | Ẩn danh với NCC cho tới khi người mua đồng ý Giới thiệu | **Chia sẻ ngay** (tên, công ty, email) — người mua tick đồng ý |
| Vexim ở giữa? | Có: nhân viên sàng lọc, gửi, thu báo giá, so sánh | Không: email đi thẳng, NCC trả lời thẳng vào email người mua |
| Kết quả | `matching → quoted → sampling → won/lost` | `matching` (đã gửi) hoặc `needs_review` |
| Có tính SLA báo giá? | Có | **Không** (được loại khỏi cron) |
| Ghi vào CRM | Bình thường | Bình thường, nhưng chỉ để kiểm duyệt/hỗ trợ gửi |

Phân biệt trong code bằng `rfq.specs.inquiry_kind === "supplier_question"` (hoặc
`source_page === "/rfq?intent=question"`). Luồng B không bao giờ dùng nút "Gửi yêu cầu báo giá".

## 1b. Form RFQ: một trang, 7 ô bắt buộc

Form báo giá **không còn chia 3 bước**. Một trang duy nhất, và chỉ 7 ô hiện ra:

| # | Ô | Vì sao bắt buộc |
| --- | --- | --- |
| 1 | What do you need? (mô tả tự do) | Nội dung email NCC + chấm điểm spam + ghép NCC |
| 2 | Quantity | Email NCC in "Số lượng"; thiếu là NCC không báo giá được |
| 3 | Destination | Email NCC nêu thị trường đích |
| 4 | Company | Hồ sơ người mua, xác nhận danh tính |
| 5 | Your name | Email xác nhận + thư cho NCC |
| 6 | Work email | Nơi trả lời + kiểm tra MX |
| 7 | Consent | Điều kiện pháp lý để xử lý và chia sẻ yêu cầu |

Mọi thứ còn lại (category, grade, tần suất mua, giá mục tiêu, incoterm, ngày cần, bao bì,
chứng chỉ, samples/inspection/video call, điện thoại, quốc gia, website, loại hình, ghi chú)
nằm trong mục **"Add details"** — đóng mặc định, tự mở khi URL đã điền sẵn `grade` hoặc khi
người mua đến từ link yêu cầu mẫu. Dữ liệu vẫn được gửi đủ như trước, chỉ khác là không bắt
người mua nhìn thấy.

Lý do sửa: bản 3 bước trước đây có lỗi chặn — `validateStep(2)` kiểm company/name/email/consent
trong khi các ô đó chỉ render ở bước 3, nên bấm "Continue" ở bước 2 không đi tiếp được và
**không hiện thông báo lỗi nào**. Giờ có một hàm validate duy nhất cho mỗi chế độ, kiểm đúng
những ô đang hiển thị, cuộn và focus tới ô lỗi đầu tiên.

Chế độ **câu hỏi trực tiếp** giữ nguyên một màn hình 4 ô như cũ.

## 2. Luồng A — báo giá, từ đầu đến cuối

```
NGƯỜI MUA (không cần đăng nhập)
  │  Form 3 bước: sản phẩm/số lượng → điều kiện giao → công ty
  │  + honeypot + challenge chống bot + consent
  ▼
submitRfq()  lib/rfq/submit.ts
  ├─ rate limit theo IP+UA ................................ 5 lượt/giờ (xem cảnh báo §7)
  ├─ chấm điểm spam:  <40 new │ 40–99 needs_review │ ≥100 spam
  ├─ chặn MX domain, tuỳ chọn chặn webmail, bắt buộc consent
  ├─ upsert hồ sơ người mua theo email (giữ nguyên stage/owner cũ)
  ├─ tạo rfqs + mã RFQ-YYYYMMDD-XXXXX + access_token
  ├─ ghi audit_log
  ├─ nếu người mua đã chỉ định NCC → tạo sẵn match "proposed" (KHÔNG tự gửi email)
  └─ email: xác nhận cho người mua (kèm link riêng) + báo hộp thư nội bộ
       │  (spam: KHÔNG gửi xác nhận cho người mua, chỉ báo nội bộ)
       ▼
CRM  /crm/rfqs  — hộp thư, tab theo trạng thái
  │  • Phân công người phụ trách  → tự chuyển new/needs_review → in_progress
  │  • "Cần duyệt" (needs_review): đọc rồi hoặc xử lý tiếp, hoặc đánh dấu spam
  │  • Thêm NCC vào shortlist (chỉ NCC published)
  ▼
dispatchRfqToSuppliers()  lib/rfq/outreach.ts
  ├─ bắt buộc người gửi là nhân viên thật (tên người, email domain đã cấu hình)
  ├─ chỉ NCC được phép nhận (canInviteSupplier: đã duyệt cổng / NCC cũ do Vexim quản lý)
  ├─ email ẨN DANH: không có tên/email/công ty người mua
  ├─ Reply-To = rfq+{mã}-m{matchId}@domain   ← để hồi âm về đúng match
  ├─ hạn phản hồi mặc định 3 ngày (chọn 2/3/5/7) → match.response_due_at
  ├─ match: proposed → sent_to_supplier ; rfq: → matching
  └─ gửi lỗi thì KHÔNG đánh dấu đã gửi (bấm lại được)
       ▼
NCC trả lời bằng email (Reply-To ở trên)
  ▼
Webhook thư đến  lib/mail/inbound.ts
  ├─ xác thực: match thuộc đúng RFQ + người gửi đúng NCC đó (hoặc đã từng được gửi)
  ├─ lưu vào email_messages, gắn vào timeline của RFQ (không lẫn khách khác)
  └─ ghi supplier_replied_at (chỉ lần đầu)
       ▼
Nhân viên ĐỌC THƯ RỒI NHẬP BÁO GIÁ TAY  (hệ thống không tự đọc giá từ email)
  ├─ giá / tiền tệ / đơn vị / incoterm / thời gian giao
  └─ match → quoted
       ▼
presentShortlistToBuyer()   ← nút "Gửi bảng so sánh"
  ├─ chỉ gửi khi có ≥1 match đã có giá
  ├─ email tiếng Anh, bảng NCC + giá + incoterm + lead time (không lộ liên hệ NCC)
  ├─ match → presented_to_buyer ; rfq → quoted ; ghi first_response_at
  └─ gửi lỗi thì ném lỗi, KHÔNG đánh dấu đã trình
       ▼
Người mua chọn một NCC  →  "Chọn nhà cung cấp này"
  ├─ match → selected, các match khác → not_selected
  ├─ ghi introductions (đồng ý chia sẻ + mốc bảo hộ 12 tháng)
  ├─ email cho NCC được chọn (vẫn ẩn danh người mua)
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
| `quoted` | Đã gửi bảng so sánh cho người mua | Hệ thống (shortlist) |
| `sampling` | Chốt NCC, bắt đầu gửi mẫu | Nhân viên |
| `won` | Người mua chọn NCC / chốt | Nhân viên chọn NCC |
| `lost` | Đóng, có lý do | Nhân viên (bắt buộc lý do) |
| `spam` | Cách ly | Hệ thống hoặc nhân viên |

### Match (một NCC trong một RFQ)

`proposed` → `sent_to_supplier` → `quoted` → `presented_to_buyer` → `selected` / `not_selected`
Nhánh phụ: `declined` (NCC từ chối), `no_response` (im lặng — **hiện chưa tự chuyển**, xem §7).

## 4. Ai được làm gì

| Việc | admin | sale | viewer | NCC (cổng riêng) |
| --- | :-: | :-: | :-: | :-: |
| Xem hộp RFQ, chi tiết, timeline | ✓ | ✓ | ✓ (chỉ đọc) | — |
| Phân công, đổi trạng thái, thêm NCC, gửi email | ✓ | ✓ | — | — |
| Nhập báo giá, gửi bảng so sánh, chốt NCC | ✓ | ✓ | — | — |
| Xem danh sách RFQ được chuyển cho mình | — | — | — | ✓ (chỉ của mình) |
| Trả lời báo giá | — | — | — | ✓ (bằng email, không thấy liên hệ người mua) |

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
| Gửi NCC | NCC | Yêu cầu báo giá **ẩn danh** + hạn phản hồi + các mục cần chào | Một lần/một match |
| Nhắc NCC | NCC | Nhắc phản hồi (nút thủ công, chỉ khi đã gửi) | Thủ công |
| Bảng so sánh | Người mua | So sánh NCC theo giá/incoterm/lead time | **Chưa có** (xem §7) |
| Chốt NCC | NCC | "Vexim đã chọn hồ sơ của bạn", vẫn ẩn danh | Chỉ gửi nếu đã từng mời |
| Sang sampling / đóng lost | Người mua | Cập nhật trạng thái + bước tiếp theo / lý do | Unique index theo `(rfq, stage)` |
| Câu hỏi sản phẩm | NCC | Câu hỏi + liên hệ người mua, Reply-To = email người mua | Một lần/một match |
| Câu hỏi sản phẩm | Người mua | Đã gửi / đang duyệt / chưa gửi được | — |
| Câu hỏi lỗi hoặc bị duyệt tay | Hộp thư nội bộ | Cần kiểm duyệt / cần hỗ trợ gửi | — |

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
3. **Rate limit báo giá nằm trong bộ nhớ** (mất khi serverless scale) → chống spam thực tế yếu.
4. **Bảng so sánh chưa chống bấm 2 lần** → có thể gửi trùng email cho người mua.
5. **Chọn NCC là RFQ thành `won`**, trong khi trang người mua hiển thị "Order confirmed" — chưa
   phải đơn hàng đã xác nhận.
6. Danh sách người mua/RFQ **không phân trang** → từ 1000 bản ghi trở lên sẽ tạo hồ sơ người mua
   trùng và tab RFQ đếm sai.
