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
| Đăng nhập | mật khẩu nội bộ (scrypt), tạo quản trị đầu tiên ở `/setup` | Supabase Auth |

Lần đầu chạy sẽ thấy trang `/login` → bấm tạo **quản trị viên đầu tiên** (xem
[Tài khoản & phân quyền](#tài-khoản--phân-quyền)). Khối “Kết nối” ở cuối menu trái luôn cho biết
đang ở chế độ nào.

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
AUTH_SECRET=<chuỗi ngẫu nhiên 64 ký tự hex — xem mục Tài khoản & phân quyền>
```

5. Khởi động lại app. Các email đang ở trạng thái “demo” có thể bấm **Gửi lại** trong Nhật ký email.

### Kiểm tra kết nối Supabase

```bash
npm run check:supabase
```

Script sẽ đọc `.env.local`, in ra dự án đang trỏ tới, kiểm tra DNS → HTTPS → REST API
rồi soi từng bảng của `supabase/schema.sql`:

| Kết quả | Nghĩa là |
| --- | --- |
| **KẾT LUẬN: Supabase sẵn sàng** | Sẽ dùng dữ liệu thật khi chạy app |
| **KẾT LUẬN: còn N bảng chưa có** | Kết nối OK nhưng chưa chạy `supabase/schema.sql` |
| **Không kết nối được Supabase** | Máy chạy app không ra được Internet tới Supabase (xem bên dưới) |

### Khi máy chạy app không kết nối được Supabase

Một số môi trường (sandbox/preview, máy sau tường lửa, VPN chặn) chỉ cho ra Internet tới
một số domain nhất định — Supabase sẽ bị chặn. Khi đó app **không sập**, mà:

- tạm chuyển sang kho local `data/local-db.json` (chỉ với lỗi mạng — lỗi SQL vẫn báo nguyên);
- ghi rõ trạng thái ở **khối “Kết nối” cuối menu trái** và ở trang **Cài đặt**, để không ai
  nhầm dữ liệu tạm là dữ liệu thật (không dùng băng cảnh báo trên đầu trang nữa);
- tự thử lại Supabase sau 60 giây và ngay lần tải trang kế tiếp, khỏi phải khởi động lại app.

Điều khiển bằng biến `VEXIM_LOCAL_FALLBACK`: `auto` (mặc định — bật ở dev/sandbox, tắt ở
production), `on`, hoặc `off`.

---

## Tài khoản & phân quyền

Mọi trang trong CRM đều yêu cầu đăng nhập. Lần đầu mở app khi **chưa có tài khoản nào**, trang
`/login` sẽ mời bạn tạo **quản trị viên đầu tiên** ở `/setup` (tài khoản này luôn có vai trò
`admin`); sau đó `/setup` tự chuyển về `/login`.

### Bốn vai trò

Định nghĩa tại [`lib/auth/permissions.ts`](lib/auth/permissions.ts) — sửa `MATRIX` là đổi được quyền.

| Vai trò | Xem | Thêm / sửa |
| --- | --- | --- |
| **Quản trị** (`admin`) | tất cả | tất cả, gồm người dùng & phân quyền |
| **Kinh doanh** (`sale`) | buyer, NCC, sản phẩm, media, hộp thư | buyer (kể cả đổi trạng thái), media, soạn/gửi email |
| **Thu mua** (`sourcing`) | buyer, NCC, sản phẩm, media, hộp thư | NCC, sản phẩm, media |
| **Chỉ xem** (`viewer`) | buyer, NCC, sản phẩm, media (chỉ phần chia sẻ buyer), hộp thư | không |

Riêng **giấy tờ nội bộ** (media `audience = internal`, ví dụ giấy xác minh nhà máy) chỉ **Quản trị**
và **Thu mua** thấy; người khác không thấy trong danh sách và tải trực tiếp sẽ bị trả `403`.

Quyền được chốt **2 lớp**: giao diện ẩn nút không có quyền, và mọi server action / API đều kiểm tra
lại ở phía máy chủ (`guard(...)` trong `app/actions.ts`), nên gọi tay cũng không vượt được.

### Đăng nhập

- **Supabase Auth là chính**: app gọi `signInWithPassword` khi kết nối được Supabase.
- Tài khoản Supabase **phải có dòng tương ứng trong bảng `app_users`** mới vào được (bảng này giữ
  vai trò). Chưa có thì báo “Tài khoản Supabase này chưa được cấp quyền trong app…”.
- Khi máy chạy app **không kết nối được Supabase** (sandbox/preview, tường lửa), app tự dùng
  **mật khẩu nội bộ** đã băm bằng scrypt trong `app_users.password_hash` — chỉ với lỗi mạng; sai
  mật khẩu hay email chưa xác nhận thì bị từ chối như thường, không có đường vòng.
- Phiên lưu trong cookie `vxt_session` (HttpOnly, SameSite=Lax, hạn 7 ngày, ký HMAC-SHA256 bằng
  `AUTH_SECRET`). Không đặt `AUTH_SECRET` thì app sinh khoá riêng ở `data/auth-secret` (đừng dùng
  cách này khi chạy nhiều máy chủ).
- Mỗi lần tải trang, phiên được đối chiếu lại với bảng `app_users`: **khoá tài khoản hoặc đổi vai
  trò có hiệu lực ngay**, không phải chờ cookie hết hạn.

Tạo `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Quản lý người dùng

Vào **Cài đặt → Người dùng & phân quyền** (chỉ `admin`):

- tạo tài khoản mới (email, tên, vai trò, mật khẩu ban đầu ≥ 8 ký tự có chữ và số);
- đổi vai trò, khoá / mở khoá, đặt lại mật khẩu, xoá tài khoản;
- khi có mạng, tài khoản được tạo kèm bên **Supabase Auth**; mật khẩu đặt lại cũng được đẩy sang đó.

Chốt an toàn: không tự hạ quyền / tự khoá / tự xoá chính mình, và không thể xoá quản trị viên
đang hoạt động cuối cùng.

> **Đã có dữ liệu từ trước?** Bảng `app_users` được thêm sau, nên hãy chạy lại
> [`supabase/schema.sql`](supabase/schema.sql) một lần nữa — script viết theo kiểu `if not exists`,
> chạy lại không mất dữ liệu. Kiểm tra nhanh bằng `npm run check:supabase`.

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

### Hình ảnh & tài liệu (media)

Mỗi sản phẩm và mỗi hồ sơ NCC có khối **Hình ảnh & tài liệu**: kéo-thả tệp để tải lên
(ảnh hoặc PDF), hoặc dán **link video**. Video không tải tệp lên — chỉ lưu link.

| Loại | Nhận gì | Giới hạn | Mặc định |
| --- | --- | --- | --- |
| **Ảnh** | JPG / PNG / WebP | 8MB (đã nén sẵn ở trình duyệt) | Chia sẻ buyer |
| **Catalogue / bảng thông số** | PDF | 15MB | Chia sẻ buyer |
| **Chứng nhận** | PDF hoặc ảnh, có ngày hết hạn | 15MB | Chia sẻ buyer |
| **Giấy tờ nội bộ** | PDF hoặc ảnh | 15MB | **Nội bộ — khoá cứng** |
| **Video** | Link YouTube / Drive | — | Chia sẻ buyer |

- Ảnh được **nén và tạo ảnh xem trước ngay trên trình duyệt** (cạnh dài ≤ 1600px, kèm
  thumbnail 400px) trước khi gửi lên, nên tệp nhẹ và không cần xử lý ảnh ở server.
  Server vẫn kiểm tra lại bằng **magic bytes** (không tin đuôi tệp) và giới hạn dung lượng.
- Mỗi tệp có **trạng thái riêng: Chưa xác minh → Đã kiểm tra → Hết hạn** (kèm `expires_on`);
  quá ngày hết hạn thì hệ thống tự coi là hết hạn dù trạng thái lưu là gì.
- **Tách theo đối tượng**: `Chia sẻ buyer` vs `Nội bộ`. Giấy tờ nội bộ **không thể** chuyển
  sang chia sẻ buyer, và luôn nằm ở khối riêng trên trang chi tiết NCC.
- **Không bắt buộc khi tạo hồ sơ**, nhưng sản phẩm chỉ bật được **“Sẵn sàng gửi buyer”** khi
  đã có ít nhất 1 ảnh hoặc catalogue ở chế độ *Chia sẻ buyer* và chưa hết hạn. Xoá tệp cuối
  cùng thì cờ này tự tắt. Video luôn là tuỳ chọn.

**Nơi lưu tệp:** có cấu hình Supabase → bucket `vexim-media` (tạo sẵn khi chạy
`supabase/schema.sql`, đặt tên khác qua `SUPABASE_MEDIA_BUCKET`). Chưa cấu hình hoặc máy
chạy app không tới được Supabase → lưu tạm vào `data/media/` (đã nằm trong `.gitignore`),
giống cách tầng dữ liệu tự chuyển sang kho local. Tệp được phục vụ qua
`/api/media/file/<đường dẫn>` và chỉ phục vụ tệp **có trong bảng `media_assets`**.

> **Giới hạn cần biết:** app chưa có đăng nhập/phân quyền tài khoản, nên "chỉ nội bộ xem"
> hiện được đảm bảo bằng nghiệp vụ (khoá cứng trạng thái, tách khối riêng, không xuất hiện
> ở bất kỳ luồng gửi buyer nào) chứ chưa phải bằng phân quyền người dùng.


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

### Cột phải khi soạn thư (màn hình ≥ 1280px)

Bên phải trình soạn thảo là 4 khối luôn cập nhật theo nội dung đang viết:

| Khối | Nội dung |
| --- | --- |
| **Xem trước** | Email hiện ra y như người nhận thấy (đúng khung thương hiệu và chữ ký công ty) |
| **Ngữ cảnh** | Buyer/NCC, giai đoạn, sản phẩm, số lượng, giá mục tiêu, thanh toán, NCC đã gắn, việc kế tiếp |
| **Trước khi gửi** | Checklist: người nhận, tiêu đề, độ dài nội dung, đúng ngôn ngữ (buyer EN / NCC VI), đính kèm, dung lượng |
| **Đã gửi gần đây** | 6 email trao đổi gần nhất với đúng người nhận đó (bấm để mở) |

Trên màn hình hẹp, cột này tự gập xuống dưới trình soạn thảo.

#### Cảnh báo lộ thông tin (chỉ cảnh báo, không chặn gửi)

Khối **Trước khi gửi** và một băng đỏ phía trên sẽ cảnh báo khi nội dung có nguy cơ vi phạm
quy tắc bảo mật 2 chiều, kèm đúng chuỗi bị trùng:

- Gửi **buyer** mà nhắc tới **tên / email / điện thoại / mã số thuế / giá** của NCC đã gắn
  (dò cả dạng có dấu và không dấu, kể cả khi giá viết khác định dạng).
- Gửi **NCC** mà nhắc tới **tên buyer** trong khi buyer đang yêu cầu **ẩn danh**.

Chuỗi cần giữ kín được sinh từ hồ sơ NCC (kèm giá tham khảo của từng sản phẩm) và hồ sơ buyer
— xem `lib/email/privacy.ts`.

## Nội dung email theo giai đoạn

Trang **Nội dung email** liệt kê đầy đủ 8 giai đoạn × 2 người nhận, kèm bản xem trước email
thật với dữ liệu của một đơn cụ thể. Nội dung nằm trong `lib/email/stage-content.ts`, hỗ trợ
placeholder `{product}` `{quantity}` `{spec}` `{country}` `{port}` `{incoterm}` `{shipdate}`.

Mỗi email gửi NCC luôn có khối **“VIỆC CẦN LÀM”** dạng checklist kèm **thời hạn phản hồi**
riêng cho từng giai đoạn (ví dụ giai đoạn *Đang sản xuất* → “Cập nhật trước 16h thứ Sáu hằng tuần”).

## Cấu trúc thư mục

```
app/
  (auth)/                     Trang đăng nhập và tạo quản trị viên đầu tiên
  (app)/                      Nhóm trang yêu cầu đăng nhập (layout chặn phiên + dựng menu)
    page.tsx                  Tổng quan: KPI, phễu pipeline, việc cần làm, cảnh báo
    pipeline/page.tsx         Board kéo-thả theo trạng thái
    buyers/                   Danh sách, thêm mới, chi tiết, sửa
    suppliers/                Danh sách, thêm mới, chi tiết, sửa
    mail/page.tsx             Hộp thư đi + bản nháp
    mail/compose/page.tsx     Trình soạn thảo email
    mail/[id]/page.tsx        Xem một email + gửi lại / trả lời / xoá
    templates/page.tsx        Nội dung email theo từng giai đoạn (buyer & NCC)
    settings/page.tsx         Trạng thái kết nối Supabase/Resend, bảng pipeline
    settings/users/page.tsx   Người dùng & phân quyền (chỉ quản trị viên)
  auth-actions.ts             Server actions: đăng nhập, đăng xuất, quản lý người dùng
  api/media/                  API tải lên & trả tệp (kiểm tra phiên + quyền)
  actions.ts                  Toàn bộ server actions (CRUD, đổi trạng thái, gửi email)
components/
  stage-select.tsx            Dropdown trạng thái + hộp xác nhận người nhận
  pipeline-board.tsx          Board kéo-thả
  compose-mail.tsx            Trình soạn thảo kiểu Gmail/Zoho (2 cột)
  compose-sidebar.tsx         Cột phải: xem trước, ngữ cảnh, checklist, lịch sử
  media-manager.tsx           Tải lên / chú thích / xác minh / xoá tệp
  media-gallery.tsx           Khối xem ảnh & tài liệu ở trang chi tiết
  rich-editor.tsx             Khung soạn thảo có định dạng
  mailbox.tsx                 Danh sách hộp thư
  login-form.tsx              Form đăng nhập
  setup-form.tsx              Form tạo quản trị viên đầu tiên
  user-manager.tsx            Bảng người dùng & phân quyền
lib/
  auth/permissions.ts         Vai trò và ma trận quyền
  auth/authenticate.ts        Supabase Auth trước, mật khẩu nội bộ khi mất mạng
  auth/session.ts             Cookie phiên ký HMAC + cổng kiểm tra quyền
  db/schema-check.ts          Soi bảng/cột còn thiếu trong Supabase
  pipeline.ts                 Danh sách giai đoạn của pipeline
  media/storage.ts            Kho tệp: Supabase Storage hoặc data/media (local)
  media/validate.ts           Kiểm tra magic bytes / định dạng / dung lượng
  media/readiness.ts          Quy tắc "sẵn sàng gửi buyer" + hạn hiệu lực
  media/client-image.ts       Nén ảnh & tạo thumbnail ở trình duyệt
  compose-context.ts          Ngữ cảnh buyer/NCC cho cột phải trang soạn thư
  email/privacy.ts            Dò thông tin cần giữ kín (tên/giá NCC, tên buyer)
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
