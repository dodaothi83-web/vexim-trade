# Rà soát luồng RFQ — Vexim Trade CRM

Ngày rà soát: 02/11/2026 · Nhánh: `arena/99894df2-vexim-trade` · Phạm vi: toàn bộ luồng RFQ
công khai → hộp RFQ back-office → ghép & gửi nhà cung cấp → báo giá → trình người mua → chốt NCC,
kèm email, cron SLA, phân quyền, migration và các script kiểm tra.

## 1. Tóm tắt

Luồng RFQ đã khá hoàn chỉnh: tách rõ hai nghiệp vụ (báo giá có nhân viên trung gian và câu hỏi
trực tiếp cho NCC), chống spam nhiều lớp, email ẩn danh đúng chính sách, Reply-To định tuyến
được kiểm chứng cả hai chiều (khi gửi và khi nhận), cron SLA idempotent, ranh giới quyền
`rfq.view` / `rfq.manage` rõ ràng. Các script kiểm tra hồi quy cho RFQ cũng có chất lượng tốt.

Tuy vậy có **1 lỗi chặn triển khai**, **8 lỗi mức cao** ảnh hưởng trực tiếp tới dữ liệu/tài chính,
và một nhóm sai lệch giữa tài liệu đặc tả với code. Bên dưới là chi tiết, các mục **đã sửa**
được đánh dấu rõ, phần còn lại cần bạn quyết định về nghiệp vụ.

| Mức | Số mục | Ảnh hưởng |
| --- | --- | --- |
| P0 — chặn triển khai | 2 | Migration RFQ không tạo gì cả; mã RFQ có thể trùng và làm submit 500 |
| P1 — sai dữ liệu / nghiệp vụ / bảo mật | 8 | Mất bản ghi đồng ý chia sẻ liên hệ, SLA sai giờ, chống spam không hiệu lực thật, mất dữ liệu khi >1000 dòng |
| P2 — chất lượng, nhất quán | 9 | Sao lưu/ghi chú mất dấu người thao tác, copy lẫn ngôn ngữ, UI hiển thị sai biểu tượng |

## 2. P0 — chặn triển khai

### P0-1. `supabase/migrations/20261016_rfq_foundation.sql` là một dòng comment rỗng nghĩa (ĐÃ SỬA)

Toàn bộ 24.644 byte của file bị dán vào dưới dạng **chuỗi đã escape**: mọi xuống dòng là `\n`
(2 ký tự) và mọi nháy kép là `\"`. Kết quả: file có **0 ký tự xuống dòng thật**.

Vì dòng đầu là `-- ====...` và không có newline nào, Postgres coi **toàn bộ file là một comment**:

```
$ python3 -c "print(open('supabase/migrations/20261016_rfq_foundation.sql','rb').read().count(b'\n'))"
0
```

Đây là file duy nhất trong 104 migration bị như vậy. Nghĩa là trên một DB cũ (đã có `schema.sql`
phiên bản trước), bước "chạy migration RFQ" báo thành công nhưng **không tạo** `rfqs`,
`rfq_matches`, `rfq_attachments`, `introductions`, `categories`, view whitelist… → toàn bộ luồng
RFQ chết ở lần submit đầu tiên. Trên DB cài mới bằng `schema.sql` thì không lộ ra, nên lỗi rất dễ lọt.

**Đã sửa**: khôi phục newline và nháy kép thật (nội dung SQL không đổi, 514 dòng, không còn
backslash nào). Kèm script chặn tái phát (xem P2-9).

> Lưu ý khi chạy: file này vẫn giữ bộ trạng thái RFQ cũ (`qualified/matching/quoting/...`) và được
> `20261017_rfq_reply_notify.sql` sửa lại ngay sau đó. Hai file phải chạy đúng thứ tự.

### P0-2. Mã RFQ sinh từ hai múi giờ khác nhau → chèn trùng, submit trả 500 (ĐÃ SỬA)

`lib/rfq/submit.ts` cũ:

```ts
const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // ngày UTC
const today = (await store.listRfqs()).filter((r) => r.code.startsWith(prefix));
const seq = today.length + 1;
const code = generateRfqCode(seq);   // ← ngày theo giờ máy chủ
```

- Tiền tố đếm theo **ngày UTC**, mã sinh ra theo **ngày máy chủ**. Trong khung 00:00–07:00 giờ
  Việt Nam hai bên lệch một ngày, nên số thứ tự quay lại từ đầu và **đè lên mã đã dùng trong
  ngày** (chỉ sau vài lần submit). `rfqs.code` có unique index → insert lỗi → server action ném
  lỗi, người mua thấy trang lỗi và **mất yêu cầu vừa điền**.
- Cách đếm `length + 1` cũng không an toàn: hai người submit cùng lúc nhận cùng `seq`; và
  `listRfqs()` không phân trang nên PostgREST chỉ trả tối đa 1000 dòng — qua mốc đó số đếm sai,
  sinh trùng mã.

**Đã sửa**: thêm `rfqDayKey()` (Asia/Ho_Chi_Minh) dùng chung cho cả tiền tố và mã; số thứ tự lấy
`max(seq trong ngày) + 1` và có vòng lặp bỏ qua mã đã tồn tại.

**Còn lại (khuyến nghị, chưa làm vì cần đổi schema)**: vẫn là "đọc rồi ghi", không nguyên tử. Cách
bền nhất là `sequence` theo ngày trong DB, hoặc bắt lỗi unique-violation (`23505`) rồi thử lại 3
lần. Hiện tại rủi ro còn lại rất thấp nhưng không bằng 0.

## 3. P1 — sai dữ liệu, nghiệp vụ và bảo mật

### P1-1. Chống spam báo giá gần như không hoạt động trên production

`lib/rfq/submit.ts:143`:

```ts
const rl = rateLimit(`rfq:${fp}`, { windowMs: 60 * 60 * 1000, max: 5 });
```

`lib/rfq/rate-limit.ts` là **Map trong bộ nhớ tiến trình**. Trên Vercel/serverless, mỗi lambda
một bộ nhớ riêng và bị huỷ liên tục → giới hạn thực tế gần như không tồn tại; restart/deploy là
reset sạch. Thêm nữa, khoá là `sha256(IP + User-Agent)` nên chỉ cần đổi UA là có bucket mới.

Đáng chú ý: hệ thống **đã có** rate limit phân tán (Upstash) ở
`lib/rfq/supplier-question-rate-limit.ts`, nhưng chỉ dùng cho câu hỏi trực tiếp. Luồng báo giá —
luồng gửi email nhiều hơn, tốn kém hơn — lại dùng bộ nhớ.

Ngoài ra tài liệu `docs/rfq-foundation.md` ghi "3 RFQ/24h/email; 10 RFQ/24h/IP" nhưng code là
5 RFQ/**giờ**/IP+UA. Tức là cũng chưa có giới hạn theo **email người mua**.

**Khuyến nghị**: dùng chính module Upstash sẵn có cho cả hai luồng, thêm bucket theo email
(băm email, không lưu thô), và coi trạng thái `degraded` là `needs_review` như đang làm với câu hỏi.

### P1-2. SLA tính bằng giờ đồng hồ, không phải giờ làm việc

`docs/rfq-foundation.md` quy định 9:00–18:00, Thứ 2–Thứ 6, `Asia/Ho_Chi_Minh`, và SLA là
4 giờ làm việc / 24 giờ làm việc. Nhưng:

- `app/api/cron/rfq-sla/route.ts:67,84` dùng `ageHours = (now - created_at) / 3.6e6` → giờ thực.
- `app/crm/rfqs/page.tsx:58-59,81-82` cũng dùng hiệu thời gian thực.

Hệ quả: RFQ gửi 17:30 Thứ Sáu sẽ cảnh báo "chưa phân công" lúc 21:30 Thứ Sáu (ngoài giờ làm
việc); RFQ gửi 19:00 Thứ Sáu bị tính là quá hạn ngay sáng Thứ Bảy, trong khi thực tế chưa có
giờ làm việc nào trôi qua. Ngược lại, RFQ gửi 17:00 Thứ Năm chỉ còn 1 giờ làm việc trước hạn
nhưng hệ thống lại báo còn 20 giờ.

**Khuyến nghị**: một helper `businessHoursBetween(from, to)` (TZ Hà Nội, T2–T6, 9–18, trừ ngày
lễ nếu có) dùng chung cho cả cron và danh sách; đây là thay đổi hành vi nên mình **chưa tự sửa**.

### P1-3. "72 giờ không phản hồi → no_response + cảnh báo" chưa được cài đặt

Tài liệu yêu cầu match gửi NCC quá 72 giờ làm việc không phản hồi thì tự chuyển
`no_response` và cảnh báo. Tìm trong toàn repo: **không có chỗ nào tự set `no_response`** —
`response_due_at` chỉ được ghi khi gửi (`lib/rfq/outreach.ts:255`) và chỉ được **đọc** để hiển thị
hạn phản hồi ở cổng NCC (`lib/supplier-portal/dashboard.ts:64`). Nghĩa là match treo mãi ở
`sent_to_supplier`, CRM không có tín hiệu "NCC im lặng", và báo cáo "Đã phản hồi" của NCC thiếu
mẫu số chủ động.

**Khuyến nghị**: thêm nhánh vào cron hiện có (`/api/cron/rfq-sla`) xử lý `response_due_at < now`
và chưa `supplier_replied_at`, đánh dấu `no_response` + gửi cảnh báo cho người phụ trách;
giữ nguyên tắc idempotent và "chỉ ghi cờ sau khi Resend nhận thật" như `sendSlaAlert`.

### P1-4. Chọn NCC qua luồng "sampling" không ghi bản ghi Giới thiệu (ĐÃ SỬA)

`lib/rfq/outreach.ts` `selectSupplier()` ghi bản ghi `introductions` (thời điểm Giới thiệu +
thời gian bảo hộ 12 tháng). Bản ghi này **không phải căn cứ thu hoa hồng** — nền tảng không
thu hoa hồng đơn hàng — nhưng vẫn cần cho hai việc:

- **Bằng chứng đồng ý chia sẻ liên hệ.** Chính sách bảo mật và copy trên form cam kết email/
  điện thoại/công ty của người mua chỉ được chia sẻ *sau khi người mua đồng ý*. Bản ghi Giới
  thiệu là chỗ duy nhất lưu "đã có đồng ý, chia sẻ cho NCC nào, lúc nào" — thiếu nó thì không
  chứng minh được đã tuân thủ cam kết đó.
- **Mốc Thời gian bảo hộ 12 tháng** theo Điều 1.6 và Điều 7 Thỏa thuận nhà cung cấp, dùng khi
  đối soát/tranh chấp về "thương vụ kết nối" (mức phí hiện hành là 0 đồng, nhưng mốc thời gian
  vẫn được định nghĩa trong hợp đồng đang áp dụng).

Vấn đề là `app/crm/rfqs/[id]/compose-action.ts` `markSamplingAction()` (đường đi rất hay dùng:
chốt NCC để gửi mẫu) lại chỉ `updateRfqMatch(selected)` rồi gửi email, **không** ghi Introduction
và không chuyển các NCC còn lại sang `not_selected`. Hai đường chốt cùng một NCC cho ra hai kết
quả dữ liệu khác nhau, trong đó đường phổ biến hơn lại không để lại dấu vết.

**Đã sửa**: tách `recordSupplierSelection(rfq, match)` trong `lib/rfq/outreach.ts` và dùng cho cả
hai đường, nên mọi lần chốt NCC đều có cùng hệ quả dữ liệu.

> Mức độ ưu tiên: khi phí dịch vụ đang là 0 đồng và không có hoa hồng, đây là lỗi **tuân thủ và
> đối soát** (thiếu bằng chứng đồng ý của người mua), không phải lỗi thất thu. Mình vẫn xếp P1
> nhưng nếu bạn muốn hạ xuống P2 thì chỉ cần đổi thứ tự xử lý.

### P1-5. Đính kèm RFQ ghi xuống đĩa cục bộ và im lặng khi thất bại (ĐÃ SỬA một phần)

`app/crm/rfqs/[id]/upload-action.ts` ghi file vào `data/rfq-files` bằng `fs/promises`. Comment
trong file cũng thừa nhận đây là "local dev / MVP". Trên Vercel filesystem chỉ đọc → upload lỗi;
tệ hơn, mọi nhánh lỗi (`sai kích thước`, `thiếu file`, `không có quyền`) đều `return` **không báo
gì**, nên nhân viên tưởng đã đính kèm được. Bản ghi còn ghi `bucket: "local"`, lệch với bucket
`rfq-attachments` trong migration/schema, và `uploaded_by: null` (mất dấu người tải).

Đồng thời có lỗ hổng đường dẫn: `path.join(UPLOAD_DIR, rfqId)` với `rfqId` lấy trực tiếp từ form,
không kiểm định dạng UUID → `rfq_id=../../..` ghi file ra ngoài thư mục.

**Đã sửa**: kiểm `rfqId` đúng UUID + `path.resolve()` phải nằm trong thư mục cho phép.

**Còn lại**: chuyển sang Supabase Storage (`storage.from('rfq-attachments')`, signed URL 15 phút
như đặc tả), ghi `uploaded_by` từ session, và trả lỗi cho người dùng thay vì im lặng.

### P1-6. Danh sách người mua / RFQ bị cắt ở 1000 dòng → trùng người mua, mất RFQ cũ

`lib/db/supabase.ts` `listBuyers()` và `listRfqs()` không phân trang. PostgREST mặc định trả tối
đa 1000 dòng. Hai chỗ dựa vào "đọc hết rồi lọc":

- `lib/rfq/submit.ts:230`: tìm người mua theo email → sau 1000 người mua, khách cũ **không khớp**
  → tạo **hồ sơ người mua trùng**, lịch sử RFQ bị chia đôi, báo cáo theo khách sai.
- `app/crm/rfqs/page.tsx`: tải toàn bộ RFQ rồi lọc theo tab trong bộ nhớ → quá 1000 RFQ thì
  **số đếm trên từng tab sai** và RFQ cũ biến mất khỏi hộp thư.

**Khuyến nghị**: thêm `getBuyerByEmail()` (query có index) vào store thay vì quét danh sách;
danh sách RFQ lọc/đếm phía DB (`.eq("status", …)` + `count`), phân trang thật.

### P1-7. `presentShortlistToBuyer` không có chống gửi lặp

`notifyBuyerRfqStatus` có "claim" bằng unique index `email_messages_buyer_status_once_idx` (rất
tốt). Nhưng `presentShortlistToBuyer` (`lib/rfq/outreach.ts:292`) không có cơ chế tương tự: bấm
hai lần, hoặc hai nhân viên cùng bấm, sẽ **gửi hai email so sánh cho người mua** và ghi
`first_response_at` hai lần.

**Khuyến nghị**: dùng lại đúng mẫu claim (draft → sent/failed) với một `stage` mới, hoặc một
cột `shortlist_sent_at` có unique index trên `rfqs`.

### P1-8. Chọn NCC xong là RFQ thành `won` và người mua đọc "Order confirmed"

`lib/rfq/outreach.ts:406` đặt `status: "won"` ngay khi chốt NCC; trang trạng thái công khai
(`app/(public)/rfq/status/[token]/page.tsx:48`) dịch `won` thành **"Order confirmed — Your order
has been confirmed with the chosen supplier"**. Chọn NCC để gửi mẫu chưa phải đơn hàng đã xác
nhận, lại càng không phải việc Vexim được phép khẳng định thay người mua. Rủi ro: người mua hiểu
sai cam kết; nội bộ báo cáo "thành công" sớm.

**Khuyến nghị**: hoặc thêm trạng thái `selected` trước `won`, hoặc đổi sang copy trung tính
("Supplier selected — we are preparing the sample / next steps") cho tới khi có xác nhận đơn.

## 4. P2 — chất lượng và tính nhất quán

**P2-1 (ĐÃ SỬA) — biểu tượng SLA ở hộp thư RFQ không bao giờ hiện đúng.** `app/crm/rfqs/page.tsx`
tra `slaIcons[sl.label]` mà khoá là tiếng Anh (`"unassigned 4h+"`, `"response due"`) còn
`slaInfo()` trả nhãn tiếng Việt (`"chưa phân công 4h+"`, `"hồi đáp sắp trễ"`) → luôn rơi về đồng
hồ mặc định. Đã đổi khoá cho khớp và bổ sung mục còn thiếu.

**P2-2 (ĐÃ SỬA) — `setRfqStatusAction` nhận mọi chuỗi trạng thái.** `app/crm/rfqs/actions.ts` có
`validateRegularStatus()`, nhưng bản inline dùng ở trang chi tiết không kiểm tra gì. Trên
Supabase, ràng buộc `rfqs_status_check` chặn; ở local store thì ghi được rác, làm dữ liệu hai môi
trường lệch nhau. Đã thêm allowlist khớp constraint.

**P2-3 (ĐÃ SỬA) — trang trạng thái có `case "new":` lặp hai lần** (`app/(public)/rfq/status/[token]/page.tsx`).
Code chết, gây nhầm khi thêm trạng thái mới.

**P2-4 (ĐÃ SỬA) — ghi chú nội bộ luôn ký tên "Sale".** `app/crm/rfqs/[id]/note-action.ts` hard-code
`const author = "Sale"` (kèm TODO). Ghi chú RFQ là bằng chứng khi đối soát với người mua, nên đã
lấy tên/email từ session.

**P2-5 — hai đường phân công hành xử khác nhau.** `assignRfqFormAction` (trang chi tiết) chỉ
`updateRfq(assigned_to)`, không audit, không chuyển `new → in_progress`; còn
`assignRfqInlineAction` (trang danh sách) làm cả hai. Cùng một thao tác, hai kết quả. Nên gộp về
một action.

**P2-6 — `updateMatchQuoteAction` không kiểm tra số.** `Number(price)` với `"abc"` ra `NaN` (Supabase
sẽ lỗi, local thì lưu null), không audit, không thông báo cho nhân viên phụ trách khi có báo giá
mới. Nên validate `> 0`, `lead_time_days` nguyên dương, và ghi audit.

**P2-7 — copy lẫn ngôn ngữ trên form công khai.** Form và email cho người mua là tiếng Anh, nhưng
lỗi từ server vẫn tiếng Việt: "Quá nhiều yêu cầu. Vui lòng thử lại sau 1 giờ.", "Tên miền email
không có bản ghi MX…", "Bạn cần đồng ý với chính sách bảo mật." (`lib/rfq/submit.ts`). Người mua
nước ngoài sẽ gặp câu không đọc được ngay tại bước quan trọng nhất. Repo đã có
`check-buyer-email-language` cho email — nên mở rộng cho cả thông báo lỗi.

**P2-8 — chấm điểm spam lệch đặc tả.** `lib/rfq/index.ts` cho webmail `+25` (đặc tả: `+5`) và
`challenge_missing` `+60`. Vì ngưỡng `needs_review` là 40, một người dùng thật bị chặn script
challenge (adblock, mạng công ty) sẽ **luôn** vào diện duyệt tay dù mọi thứ khác sạch. Tham số
`website` được truyền vào `scoreSpam()` nhưng không dùng (chết). Nên chốt lại thang điểm và ghi
vào tài liệu, hoặc tách "challenge fail" thành tín hiệu riêng thay vì cộng điểm.

**P2-9 — thiếu cổng chặn cho migration/mã RFQ (ĐÃ THÊM).** Thêm
`scripts/check-rfq-migration.mjs` + `npm run check:rfq`, và đưa vào CI (`.github/workflows/ci.yml`,
job "Luồng RFQ"): chặn file `.sql` bị escape thành một dòng và kiểm tra `rfqDayKey()` / mã RFQ
theo giờ Hà Nội.

**P2-10 — form RFQ công khai không có đính kèm.** Bảng `rfq_attachments` + bucket
`rfq-attachments` đã có trong migration và đặc tả, nhưng form 3 bước không có input file; chỉ CRM
tải lên được. Hoặc bổ sung, hoặc ghi rõ trong đặc tả là ngoài phạm vi GĐ 2.

**P2-11 (ĐÃ SỬA) — copy còn hứa "hoa hồng".** `app/crm/team/page.tsx` ghi phụ đề
"tính theo người mua đang phụ trách · **hoa hồng sẽ bổ sung khi có dữ liệu thanh toán**" — trái với
mô hình hiện tại (nền tảng không thu hoa hồng đơn hàng) và trái với chính bộ tài liệu pháp lý
(`docs/chuong-trinh-nha-cung-cap-tien-phong/README.md` yêu cầu "không dùng khái niệm hoa hồng đơn
hàng"). Đã đổi thành "nền tảng không thu hoa hồng đơn hàng". Nên rà thêm các tài liệu chào bán
(`docs/de-an-dang-ky-tmdt/`, `docs/chuong-trinh-nha-cung-cap-tien-phong/`) theo đúng nguyên tắc đã
ghi trong README của chương trình.

**Ghi chú vận hành:** cổng `npm run check:copy` **đang đỏ sẵn trên `main`** vì một câu 144 ký tự ở
`app/crm/categories/categories-manager.tsx:1484` (không liên quan RFQ). `scripts/check-permissions.mjs`
cũng còn 4 cảnh báo thiếu guard ở module quantity-pricing (cũng có trước). Cả hai không do lần
rà soát này gây ra, nhưng sẽ làm CI đỏ cho PR bất kỳ.

## 5. Những gì đã sửa trong lần rà soát này

| File | Thay đổi |
| --- | --- |
| `supabase/migrations/20261016_rfq_foundation.sql` | Khôi phục `\n`/`\"` thành ký tự thật → migration chạy được (P0-1) |
| `lib/rfq/index.ts` | Thêm `RFQ_TIME_ZONE`, `rfqDayKey()`, `generateRfqCode(seq, dayKey)` (P0-2) |
| `lib/rfq/submit.ts` | Sinh mã theo một múi giờ, `max(seq)+1`, chống trùng mã (P0-2) |
| `lib/rfq/outreach.ts` | Tách `recordSupplierSelection()` dùng chung; sửa chú thích: bản ghi Giới thiệu là bằng chứng đồng ý chia sẻ liên hệ, không phải căn cứ hoa hồng (P1-4) |
| `app/crm/rfqs/[id]/compose-action.ts` | Luồng sampling tạo Introduction + `not_selected` cho NCC khác (P1-4) |
| `app/crm/rfqs/[id]/upload-action.ts` | Chặn path traversal, kiểm UUID (P1-5) |
| `app/crm/rfqs/actions-inline.ts` | Allowlist trạng thái (P2-2) |
| `app/crm/rfqs/page.tsx` | Khoá biểu tượng SLA khớp nhãn (P2-1) |
| `app/crm/rfqs/[id]/note-action.ts` | Ghi chú lấy tác giả từ session (P2-4) |
| `app/crm/team/page.tsx` | Bỏ câu "hoa hồng sẽ bổ sung" ở phụ đề KPI (P2-11) |
| `app/(public)/rfq/status/[token]/page.tsx` | Bỏ `case "new"` trùng (P2-3) |
| `scripts/check-rfq-migration.mjs`, `package.json`, `.github/workflows/ci.yml` | Cổng chặn hồi quy (P2-9) |
| `scripts/check-supplier-{question,dashboard}.mjs` | Cập nhật mock theo helper mới |

Kiểm chứng đã chạy: `npx tsc --noEmit` (sạch), `npm run check:rfq` (7 bộ kiểm tra RFQ + cổng
migration đều qua), `npm run check:email-lifecycle` (qua).

## 6. Cần bạn quyết định trước khi mình sửa tiếp

1. **SLA giờ làm việc** (P1-2): có cần trừ ngày lễ Việt Nam không, và hạn phản hồi 24 giờ có
   được tính "trong giờ làm việc" như tài liệu không? Đây là thay đổi hành vi nên chờ bạn chốt.
2. **`won` khi chốt NCC** (P1-8): thêm trạng thái `selected`, hay chỉ đổi copy cho người mua?
   (Đổi enum cần migration + cập nhật `RfqStatus`.)
3. **Chống spam báo giá** (P1-1): dùng Upstash cho cả luồng báo giá và giới hạn theo email có
   được không (cần biến môi trường đã có sẵn cho câu hỏi trực tiếp)?
4. **Lưu báo giá** (P2-6): có cần gửi email thông báo cho nhân viên phụ trách khi NCC báo giá,
   hay chỉ hiển thị trong CRM?

Nếu bạn muốn, mình có thể tiếp tục làm gọn theo thứ tự P1-1 → P1-3 → P1-6 → P1-7 trong các lượt sau.
