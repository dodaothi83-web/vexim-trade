# Email của form “Đăng ký dịch vụ” (4 dịch vụ ở trang chủ)

Form ở Section 4 trang chủ (`components/service-registration-section.tsx`) gửi về `POST /api/public/service-inquiry`. Từ 21/10/2026 route này **không tự ghép HTML nữa**; toàn bộ nội dung thư nằm trong `lib/email/service-inquiry.ts`.

## 1. Hai thư được gửi cho mỗi lượt đăng ký

| Thư | Người nhận | Mục đích |
| --- | --- | --- |
| `buildServiceInquiryInternalEmail` | Tài khoản nội bộ đang hoạt động có vai trò `admin`, `sale`, `sourcing` | Báo có khách đăng ký để gọi lại; Reply-To là email khách nên bấm Trả lời là tới đúng người |
| `buildServiceInquiryAcknowledgement` | Chính doanh nghiệp đã đăng ký (email trên form) | Xác nhận đã nhận, nhắc mã yêu cầu và bước tiếp theo; viết theo ngôn ngữ khách chọn |

Thư xác nhận **không** chứa ghi chú nội bộ hay ghi chú của khách (chỉ thư nội bộ có). Không gửi xác nhận nếu địa chỉ thuộc domain Vexim (`isOwnMailAddress`) để tránh thư tự quay vòng. Khi `RESEND_API_KEY` chưa cấu hình, `transport` chỉ mô phỏng (dev) hoặc trả lỗi (production) — API vẫn trả `ok: true` vì yêu cầu đã được ghi vào audit log.

## 2. Quy tắc viết tiêu đề (subject)

Tiêu đề cũ đọc như văn bản máy: `[Đăng ký dịch vụ] 3. Quảng cáo nổi bật — Công ty TNHH ABC` (nhãn trong ngoặc vuông, số thứ tự, gạch dài, lặp lại tên dịch vụ marketing).

Nay:

| Trường hợp | Câu tiêu đề | Độ dài |
| --- | --- | --- |
| Nội bộ, khách gửi tiếng Việt | `Công ty TNHH Hạt Điều Bình Phước đăng ký quảng cáo nổi bật (DV-261021-4F7K)` | 75 |
| Nội bộ, khách gửi tiếng Anh | `Mekong Foods JSC đăng ký tư vấn FDA (DV-261021-78FL)` | 52 |
| Xác nhận · tiếng Việt | `Vexim Trade đã nhận đăng ký quảng cáo nổi bật của bạn (DV-261021-4F7K)` | 70 |
| Xác nhận · tiếng Anh | `Vexim Trade received your international trade website registration (DV-261021-5AB2)` | 83 |

Nguyên tắc:

1. **Không** có nhãn máy kiểu `[...]`, không gạch dài `—`, không số thứ tự `1.` `2.` trong tiêu đề.
2. Tên doanh nghiệp đứng trước (thư nội bộ) để quét hộp thư theo khách, không theo dịch vụ.
3. Tên dịch vụ viết ngắn (`quảng cáo nổi bật`, `tư vấn FDA`, `website thương mại quốc tế`, `gian hàng miễn phí`) — lấy từ `SERVICE_DESK_LABELS` theo mã dịch vụ.
4. Mã yêu cầu `DV-YYMMDD-XXXX` (giờ Việt Nam, bỏ ký tự dễ nhầm I/O) ở cuối tiêu đề để tra cứu qua điện thoại.
5. Tiêu đề giữ dưới ~90 ký tự để không bị cắt trên điện thoại.

## 3. Tên dịch vụ lấy từ máy chủ

`serviceDisplayTitle(serviceKey, lang)` là nguồn duy nhất cho tên dịch vụ trong email, audit log và thông báo trả về trình duyệt. Trình duyệt gửi kèm `service_title` chỉ được dùng khi `service_key` không nằm trong danh mục — nhờ vậy không thể chèn tiêu đề lạ vào hộp thư nội bộ.

## 4. Bố cục thư

Cả hai thư dùng khung thương hiệu chung `wrapEmailShell` (`lib/email/templates.ts`):

- Thư nội bộ: bảng `NỘI DUNG ĐĂNG KÝ` (mã yêu cầu, dịch vụ, doanh nghiệp, người liên hệ, điện thoại/Zalo, email, ngành hàng, thời điểm gửi, ngôn ngữ form) → khối “Khách ghi thêm” → danh sách **Việc cần làm** (gọi lại trong 1 ngày làm việc, bấm Trả lời, ghi mã yêu cầu).
- Thư xác nhận: bảng `THÔNG TIN ĐÃ GHI NHẬN` / `WHAT WE RECEIVED` → **Bước tiếp theo** (thời hạn phản hồi + một câu riêng cho từng dịch vụ) → hướng dẫn trả lời thư → chữ ký Vexim Trade.
- Mỗi thư đều có bản `text/plain` tiếng Việt/Anh đầy đủ dấu, để hộp thư không hiển thị HTML vẫn đọc được.
- Mọi giá trị khách nhập đều qua `escapeHtml` trước khi vào HTML.

## 5. Kiểm thử

```bash
node scripts/check-service-inquiry-email.mjs
npm run typecheck
```

Script kiểm tra: tiêu đề không có nhãn máy/gạch dài/số thứ tự, mã yêu cầu đúng định dạng và đổi theo ngày giờ Việt Nam, escape `<script>`/`<img onerror>` trong tên và ghi chú, thư xác nhận không lộ ghi chú nội bộ, mỗi dịch vụ có bước tiếp theo riêng, và thư tiếng Anh không lẫn câu tiếng Việt.

Xem trước giao diện thật (mở trong trình duyệt): `docs/service-inquiry-email-preview.html`.

Kiểm tra API cục bộ:

```bash
curl -s -X POST http://localhost:3000/api/public/service-inquiry \
  -F lang=vi -F service_key=featured_ads \
  -F company_name="Công ty TNHH ABC" -F contact_name="Nguyễn Văn An" \
  -F phone="0912 345 678" -F email="an@abc.vn" -F note="Cần tư vấn tháng 11"
```

Phản hồi có `ok`, `reference` (mã yêu cầu) và `acknowledged` (đã gửi được thư xác nhận hay chưa).
