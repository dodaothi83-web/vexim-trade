# Vexim Trade – CRM phòng Sale Xuất khẩu

Hệ thống quản lý buyer / nhà cung cấp cho phòng sale xuất khẩu, có **pipeline theo trạng thái của
từng buyer** và **tự động gửi email cập nhật tiến độ** cho buyer + nhà cung cấp mỗi khi đổi trạng thái.

- **Giao diện:** Next.js 16 (App Router) + Tailwind CSS 4
- **Database:** Supabase (Postgres)
- **Email:** Resend — domain `veximtrade.com`
- **Ngôn ngữ:** giao diện tiếng Việt · email gửi buyer tiếng Anh · email gửi NCC tiếng Việt

---

## Chạy thử ngay (không cần cấu hình gì)

```bash
npm install
npm run dev      # http://localhost:3000
```

Khi chưa có biến môi trường, app tự chạy ở **chế độ demo**:

| Thành phần | Chế độ demo | Chế độ thật |
| --- | --- | --- |
| Dữ liệu | file `data/local-db.json` (kèm 8 buyer + 5 NCC mẫu) | Supabase |
| Email | tạo nội dung + lưu vào **Nhật ký email**, không gửi ra ngoài | gửi thật qua Resend |

Thanh “Kết nối” ở cuối menu trái luôn cho biết đang ở chế độ nào.

---

## Nối Supabase + Resend

1. **Supabase** → SQL Editor → chạy toàn bộ [`supabase/schema.sql`](supabase/schema.sql).
2. **Supabase** → Project Settings → API → copy `Project URL` và `service_role` key.
3. **Resend** → API Keys → tạo key.
4. Copy `.env.example` thành `.env.local` và điền:

```env
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
RESEND_API_KEY=re_...
EMAIL_FROM=sales@veximtrade.com
EMAIL_FROM_NAME=Vexim Trade
```

5. Khởi động lại app. Các email đang ở trạng thái “demo” có thể bấm **Gửi lại** trong Nhật ký email.

---

## Pipeline

Trạng thái được định nghĩa tại [`lib/pipeline.ts`](lib/pipeline.ts) — sửa mảng `STAGES` là đổi được
toàn bộ pipeline (nhớ sửa ràng buộc `check` của cột `buyers.stage` trong SQL).

| # | Trạng thái | Email |
| --- | --- | --- |
| 1 | Khách mới | buyer + NCC (nếu đã gắn) |
| 2 | Đã liên hệ | buyer + NCC |
| 3 | Báo giá & gửi mẫu | buyer + NCC |
| 4 | Đàm phán | buyer + NCC |
| 5 | Chốt PI & cọc | buyer + NCC |
| 6 | Đang sản xuất | buyer + NCC |
| 7 | Đang giao hàng | buyer + NCC |
| 8 | Hoàn tất | buyer + NCC |
| — | Mất đơn / Hoãn | **không gửi**, chỉ ghi nhận nội bộ |

### Quy tắc gửi email

1. **Buyer luôn nhận** nếu có email (kèm CC).
2. **Nhà cung cấp chỉ nhận khi đã được gắn vào đơn** và có email.
   Ở giai đoạn hỏi hàng / báo giá thường chưa chọn NCC — khi đó hệ thống báo rõ
   *“Chưa gắn nhà cung cấp — email chỉ gửi tới buyer”* và vẫn gửi bình thường cho buyer.
3. Trạng thái **Mất đơn / Hoãn** không gửi email tự động.
4. **Bảo mật 2 chiều:**
   - Email gửi buyer **không bao giờ** chứa tên / email / giá của nhà cung cấp.
   - Email gửi NCC **mặc định ẩn danh buyer** (chỉ nêu “Khách hàng thị trường {quốc gia}”).
     Có công tắc *“Ẩn danh buyer trong email gửi NCC”* ở từng buyer nếu khách cho phép công khai.

### Nội dung khác nhau cho từng người nhận

Cùng một lần đổi giai đoạn, hệ thống sinh **hai email hoàn toàn khác nhau**:

| | Gửi buyer | Gửi nhà cung cấp |
| --- | --- | --- |
| Ngôn ngữ | Tiếng Anh | Tiếng Việt |
| Tiêu đề | Riêng cho từng giai đoạn | Riêng cho từng giai đoạn |
| Nội dung | Tiến độ đơn hàng, bước kế tiếp | Việc xưởng phải làm |
| Khối đặc biệt | “WHAT HAPPENS NEXT” | “VIỆC CẦN LÀM” + thời hạn phản hồi |
| Thông tin đơn | Không có thông tin NCC | Ẩn danh buyer (mặc định) |

### Tự động thông báo cho nhà cung cấp

- **Khi nhân viên gán một buyer vào nhà cung cấp**, hệ thống tự gửi cho NCC một email
  **“Buyer mới được kết nối”** kèm thông tin đơn + khối “VIỆC CẦN LÀM” (hạn 2 ngày).
- **Sau đó, mỗi lần đổi giai đoạn**, NCC tiếp tục nhận email cập nhật tiến độ.
- Buyer không thấy thông tin NCC; NCC mặc định chỉ thấy “khách hàng thị trường {quốc gia}”.

### Hai cách đổi trạng thái

- **Dropdown** ngay trên bảng Buyer hoặc trên thẻ ở trang Pipeline (kéo-thả cũng được).
- **Mặc định là gửi ngay**: chọn giai đoạn là hệ thống tự gửi email cho buyer và NCC.
- Tắt công tắc **“Tự động gửi khi đổi giai đoạn”** (góc phải màn hình) nếu muốn hệ thống hiện
  hộp xác nhận người nhận + cho phép thêm ghi chú riêng trước khi gửi. Công tắc này chỉ thêm
  bước xác nhận, không thay đổi nội dung email.

---

## Nhà cung cấp & hồ sơ sản phẩm

Profile NCC trả lời: doanh nghiệp này là ai, liên hệ với ai, phục vụ thị trường nào và
đã được xác minh đến đâu. Trường bắt buộc gọn để NCC dễ tham gia; giấy tờ xác minh bổ
sung sau, trước khi đưa vào danh sách đề xuất.

- **Vai trò**: nhà sản xuất / thương nhân / đại lý / XK trung gian.
- **Trạng thái hồ sơ**: Mới → Đang xác minh → Đã xác minh → Tạm ngưng.
- **Sản phẩm là hồ sơ riêng** liên kết NCC (`supplier_products`): nhóm ngành, quy cách,
  MOQ, công suất/tháng, lead time, bao bì + OEM, chứng nhận, cảng xuất, giá tham khảo
  **có thời hạn** (không tự gửi cho buyer như báo giá chính thức), Incoterm + địa điểm,
  điều khoản thanh toán, khả năng gửi mẫu.

### So khớp RFQ (MVP: bộ lọc + duyệt thủ công)

Trang buyer có nút **“Tìm NCC phù hợp”** mở `/products?buyer=<id>`: hệ thống sắp các sản
phẩm trùng nhóm hàng (tên/nhóm/quy cách) lên trước và gắn badge “khớp nhu cầu”.
Người vận hành duyệt rồi mới gửi yêu cầu báo giá cho NCC — đúng luồng:
**NCC → Sản phẩm/SKU → Báo giá theo từng RFQ → Đơn hàng**.

Lưu ý bảo mật: RFQ gửi NCC mặc định ẩn danh buyer (tôn trọng `hide_buyer_from_supplier`);
chỉ chia sẻ tên/email buyer khi được phép.

## Hộp thư (trình soạn thảo chuẩn Gmail/Zoho)

Menu **Hộp thư** / **Soạn email** — đội ngũ có thể tự viết email cho buyer hoặc NCC:

- Ô **Tới / Cc / Bcc** dạng thẻ (gõ Enter hoặc dấu phẩy để thêm, xoá bằng phím Backspace),
  có gợi ý địa chỉ từ danh sách buyer & NCC.
- **Tiêu đề** + **trình soạn thảo có định dạng**: đậm, nghiêng, gạch chân, cỡ chữ, màu chữ,
  danh sách, canh lề, chèn liên kết, hoàn tác.
- **Đính kèm tệp** (tối đa 10MB), **lưu bản nháp**, **gửi lại**, **xoá**.
- Mở soạn trực tiếp từ trang chi tiết buyer (**Soạn email**) hoặc từ khối nhà cung cấp
  (**Soạn email cho NCC**) — người nhận được **cố định từ hồ sơ**, chỉ việc viết nội dung.
- Mở từ menu (không ngữ cảnh) thì gõ người nhận; hệ thống tự nhận đó là buyer hay NCC.

Toàn bộ email (tự động + tự soạn) nằm chung một **Hộp thư đi**, lọc được theo người nhận
(buyer/NCC) và theo loại (tự động / tự soạn).

## Nội dung email theo giai đoạn

Trang **Nội dung email** liệt kê đầy đủ 8 giai đoạn × 2 người nhận, kèm bản xem trước email
thật với dữ liệu của một đơn cụ thể. Nội dung nằm trong `lib/email/stage-content.ts`, hỗ trợ
placeholder `{product}` `{quantity}` `{spec}` `{country}` `{port}` `{incoterm}` `{shipdate}`.

Mỗi email gửi NCC luôn có khối **“VIỆC CẦN LÀM”** dạng checklist kèm **thời hạn phản hồi**
riêng cho từng giai đoạn (ví dụ giai đoạn *Đang sản xuất* → “Cập nhật trước 16h thứ Sáu hằng tuần”).

## Cấu trúc thư mục

```
app/
  page.tsx                    Tổng quan: KPI, phễu pipeline, việc cần làm, cảnh báo
  pipeline/page.tsx           Board kéo-thả theo trạng thái
  buyers/                     Danh sách, thêm mới, chi tiết, sửa
  suppliers/                  Danh sách, thêm mới, chi tiết, sửa
  mail/page.tsx               Hộp thư đi + bản nháp
  mail/compose/page.tsx       Trình soạn thảo email
  mail/[id]/page.tsx          Xem một email + gửi lại / trả lời / xoá
  templates/page.tsx          Nội dung email theo từng giai đoạn (buyer & NCC)
  settings/page.tsx           Trạng thái kết nối Supabase/Resend, bảng pipeline
  actions.ts                  Toàn bộ server actions (CRUD, đổi trạng thái, gửi email)
components/
  stage-select.tsx            Dropdown trạng thái + hộp xác nhận người nhận
  pipeline-board.tsx          Board kéo-thả
  compose-mail.tsx            Trình soạn thảo kiểu Gmail/Zoho
  rich-editor.tsx             Khung soạn thảo có định dạng
  mailbox.tsx                 Danh sách hộp thư
lib/
  pipeline.ts                 Danh sách giai đoạn của pipeline
  email/stage-content.ts      NỘI DUNG email riêng cho buyer và cho NCC theo từng giai đoạn
  email/templates.ts          Sinh HTML email buyer (EN) và NCC (VI)
  email/send.ts               Gửi qua Resend (kèm Cc/Bcc/đính kèm) + lưu hộp thư
  db/                         Tầng dữ liệu: tự chọn Supabase hoặc kho local
supabase/schema.sql           Script tạo bảng
```

## Lệnh

```bash
npm run dev        # chạy dev (0.0.0.0:3000)
npm run build      # build production
npm start          # chạy bản build
npm run typecheck  # kiểm tra TypeScript
```
