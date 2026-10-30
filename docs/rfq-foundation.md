# RFQ & Supplier Directory — Foundation (GĐ 0–2)

Tài liệu này ghi lại quyết định kiến trúc cho giai đoạn 0–2 của dự án danh bạ nhà cung cấp + luồng RFQ
(đặc tả ngày 16/10/2026). Luật cũ: AI không được viết văn.

## Phạm vi GĐ 0–2

- **GĐ 0 (Tuần 1)** – Hạ tầng: migration schema (categories, certificates, verifications, rfqs,
  rfq_matches, rfq_attachments, introductions, audit_log), mở rộng cột suppliers/supplier_products/
  buyers, phân quyền mới, view whitelist công khai `v_public_suppliers` và `v_public_supplier_products`,
  seed category "Cashew", redirect 301 `/cashew* → /products/cashew`.
- **GĐ 1 (Tuần 2)** – Trang công khai `/products/[category]`, `/suppliers/[slug]`, `/compare`,
  `/how-we-verify`, `/for-suppliers`; middleware noindex khi `PUBLIC_SITE_INDEXABLE=false` (mặc định).
  Form NCC đăng nhập bộ phận kiểm tra nhận hồ sơ → `submitted`; xác minh tại chỗ checklist UI làm sau.
- **GĐ 2 (Tuần 3–4)** – Form RFQ 3 bước công khai (bước sản phẩm / số lượng-giao / công ty),
  Challenge chống bot tự chủ + rate limit + kiểm tra MX domain + honeypot + thời gian điền form, trang trạng thái
  `/rfq/status/[token]`, hộp RFQ back-office, SLA giờ làm việc (Asia/Ho_Chi_Minh) + cron cảnh báo,
  ghép seller thủ công, email yêu cầu báo giá ẩn danh buyer, nhập báo giá tay, gửi bảng so sánh
  buyer, tạo `introductions` để bảo vệ không vượt mặt.

## Những gì KHÔNG làm trong GĐ 0–2

- Orders, hoa hồng tự động, plans/subscriptions, reviews, dashboard seller → Google Sheet ở đầu vào.
- Cổng đăng nhập cho seller → sau khi cổng 90 ngày.
- Gợi ý seller tự động — ghép thủ công.
- Checklist xác minh UI chi tiết và cấp 2/3 — mới chỉ khung bảng `verifications` với 4-eyes constraint.
- Khi buyer "selected" một NCC — không tự đẩy vào bảng `buyers.stage` cũ; theo dõi bằng Sheet cho
  đến khi `orders` là nguồn chuẩn.

## Trạng thái nhà cung cấp

```
draft → submitted → in_verification → published ⇄ suspended → archived
```

- `draft`: sale tạo / seller tự đăng ký, chưa nộp đủ.
- `submitted`: đã nộp đủ hồ sơ, chờ bộ phận kiểm tra.
- `in_verification`: bộ phận đang xem (hoặc đi xác thực nhà máy).
- `published`: đã duyệt và hiện trên trang công khai (chỉ những NCC này mới hiện qua v_public_*).
- `suspended`: tạm ngừng công khai (vi phạm, hàng chờ xác minh lại…).
- `archived`: loại khỏi danh sách hoạt động.

Các giá trị cũ (`new/verifying/verified/paused`) được migrate sang `draft/in_verification/published/suspended`.

## Quy tắc hiển thị công khai

- Anonymous và trình duyệt chỉ đọc qua **view whitelist** (`v_public_suppliers`, `v_public_supplier_products`).
  View tự động lọc `status='published'`. `v_public_suppliers` không trả giá FOB chung (cột cũ luôn NULL);
  giá chỉ lấy từ sản phẩm và bị ẩn nếu NCC chưa xác nhận quyền chia sẻ giá trong 180 ngày hoặc giá
  sản phẩm đã hết hạn; ẩn rating khi `rating_count < 3`. Cần áp dụng migration
  `20261017_product_only_reference_prices.sql` trên DB đã triển khai để thay đổi whitelist views.
- Back-office tiếp tục đọc trực tiếp bảng `suppliers/supplier_products` bằng service_role.
- Khi chưa đủ ≥ 10 hồ sơ published, cờ `PUBLIC_SITE_INDEXABLE=false` → middleware chèn
  `X-Robots-Tag: noindex` cho toàn bộ trang công khai; chỉ mở khi admin bật env này.

## Phân quyền

| Quyền | admin | sale | sourcing | viewer |
| --- | --- | --- | --- | --- |
| buyers.manage | ✓ | ✓ | | |
| suppliers.manage | ✓ | ✓ | ✓ | |
| suppliers.publish | ✓ | | | |
| products.manage | ✓ | ✓ | ✓ | |
| categories.manage | ✓ | | | |
| verifications.inspect | ✓ | | ✓ | |
| verifications.approve | ✓ | | ✓ | |
| rfq.manage | ✓ | ✓ | | |
| media.internal | ✓ | | ✓ | |
| users.manage | ✓ | | | |

Xác minh NCC hiện dùng **quy trình một nhân sự**: admin/thu mua có đủ quyền kiểm + duyệt có thể hoàn tất bản của chính mình sau xác nhận; reviewer vẫn có thể duyệt độc lập khi cần. Luôn lưu `inspector_id`, `approved_by`, `self_approved` và audit log. Migration `20261035_single_person_verification.sql` áp dụng luật hiện tại; xem `docs/verification-levels.md`.
Chỉ admin được chuyển `suppliers.status → published` hoặc `suspended`.

## Chống spam RFQ (GĐ 2)

- Honeypot field `company_website` (giữ cơ chế cũ).
- Thời gian từ lúc mở form đến submit dưới 5 giây → cách ly.
- Challenge chống bot tự chủ (proof-of-work; `CHALLENGE_SECRET`/`CHALLENGE_DIFFICULTY` tùy chọn từ env).
- Rate limit 3 RFQ / 24h / email; 10 RFQ / 24h / IP.
- MX record kiểm tra bằng `node:dns/promises`.
- Webmail domain (gmail/yahoo/hotmail/outlook…) → chấp nhận nhưng cộng `spam_score += 5` và cho vào
  mục "Cần kiểm tra"; không tính SLA cho các RFQ bị cách ly.
- Cấu hình chặn hẳn webmail qua env `RFQ_REJECT_WEBMAIL=true` nếu sau này cần.

## SLA giờ làm việc

- Múi giờ mặc định `Asia/Ho_Chi_Minh`.
- Giờ làm việc 9:00–18:00, Thứ 2–Thứ 6 (cấu hình sau).
- RFQ đánh dấu spam không tính vào SLA.
- Cảnh báo:
  - RFQ tạo > 4 giờ làm việc chưa có `assigned_to` → báo team lead.
  - RFQ còn 4 giờ làm việc đến hạn 24h mà chưa `first_response_at` → báo assigned_to + team lead.
  - Match gửi cho seller > 72 giờ làm việc chưa phản hồi → `no_response` + cảnh báo.
- Cron job (Vercel Cron, route `/api/cron/rfq-sla`, header bí mật) chạy mỗi giờ.

## Migrations

- Migration mới: `supabase/migrations/20261016_rfq_foundation.sql` (idempotent, chạy lại được).
- File gốc `supabase/schema.sql` đã được cập nhật phần cuối với đủ bảng/cột/view/seed cashew để
  cài đặt từ đầu.
- Local store (`lib/db/local.ts`) seed sẵn category Cashew và tự thêm field mới cho các supplier/
  product/buyer mẫu.

## Bảng mới (tóm tắt)

| Bảng | Mục đích |
| --- | --- |
| `categories` | Ngành 2 cấp, i18n SEO fields. |
| `supplier_categories` | N-N giữa suppliers và categories. |
| `certificates` | Chứng nhận nhà cung cấp, trạng thái kiểm tra. |
| `verifications` | Khung cho các đợt xác minh (sẽ xây UI chi tiết sau). |
| `rfqs` | Yêu cầu báo giá công khai với spam_score/access_token/SLA. |
| `rfq_attachments` | File đính kèm trong form RFQ (bucket private). |
| `rfq_matches` | Một seller được ghép vào RFQ + báo giá nhận được. |
| `introductions` | Bản ghi giới thiệu (cơ sở đòi hoa hồng, không vượt mặt). |
| `audit_log` | Nhật ký thay đổi nhạy cảm (bắt buộc). |

## Seed khởi đầu

- Category `cashew` published với intro/SEO tiếng Anh cơ bản.
- Redirect `/cashew* → /products/cashew` (301).

## Câu hỏi mở (chốt khi đến tuần đó)

1. Bộ phận/người nào sẽ đóng vai trò "inspector" (sourcing) và "approver" (admin)?
2. Checklist cấp 1 cụ thể (mục trong `verifications.checklist`)? Hiện để JSON trống ở GĐ0.
3. Ngưỡng "10 hồ sơ published để mở index" — giữ mặc định 10.
4. Danh sách webmail domain chặn/cảnh báo — hard-code ở `lib/rfq/spam.ts` khi sang GĐ2.
5. Bucket policy cho `rfq-attachments` — signed URL 15 phút.
