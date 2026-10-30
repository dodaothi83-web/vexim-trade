# RFQ email — hồi âm theo match & cập nhật buyer

## Luồng mới

- Email mời báo giá / follow-up / thư soạn cho NCC dùng `Reply-To: rfq+<RFQ_CODE>-m<MATCH_UUID_32_HEX>@<MAIL_DOMAIN>`. Webhook Resend nhận email, tra code + match ID, **chỉ gắn `rfq_id`, `rfq_match_id`, thread RFQ** nếu match thuộc RFQ và From là email NCC hoặc người nhận thư đã gửi cho match (kể cả To override). Thư cũ `rfq+<RFQ_CODE>@...` vẫn tìm match theo email NCC. Người gửi lạ vẫn được nhận vào hộp thư chung, **không được gắn vào timeline RFQ**.
- Thư shortlist + thông báo sampling/lost cho buyer dùng `Reply-To: buyer+<RFQ_CODE>@<MAIL_DOMAIN>`. Webhook chỉ gắn vào RFQ nếu From là email buyer hoặc CC đã khai báo của buyer. Không trộn hồi âm buyer vào thread của match NCC.
- Chuyển sang `sampling` hoặc `lost` tự gửi thông báo buyer và ghi email `buyer_status_update` trong timeline. `lost_reason` được diễn giải thành thông điệp phù hợp; `closed_reason` là ghi chú nội bộ, **không đưa vào email**. Nếu thiếu địa chỉ buyer hoặc vận chuyển thất bại, trạng thái vẫn được lưu nhưng thao tác báo lỗi để nhân viên biết và có thể submit lại.
- Một dòng `email_messages` trạng thái `draft` là claim trước khi gửi; unique index `(rfq_id, stage)` giới hạn **một thông báo cho mỗi RFQ/giai đoạn**. `failed` có thể thử lại; `sent` / `simulated` không gửi lại. Khi gửi ở production mà thiếu `RESEND_API_KEY`, đánh dấu `failed`, không giả lập thành công.

## Triển khai trên Supabase (bắt buộc trước khi bật code)

1. Chạy `supabase/migrations/20261017_rfq_reply_notify.sql` trong Supabase SQL Editor **trên project thực tế**. File chạy được nhiều lần. Bản `supabase/schema.sql` cũng đã cập nhật cho cài mới. Lưu ý các cột liên kết email chỉ tạo **sau khi** có bảng `rfqs` và `rfq_matches`.
2. Kiểm tra schema bằng SQL (sandbox Arena không kết nối trực tiếp Supabase):

   ```sql
   select column_name from information_schema.columns
   where table_schema='public' and table_name='email_messages'
     and column_name in ('rfq_id','rfq_match_id','rfc_message_id','read_at');
   -- Cần đủ 4 dòng.
   select conname from pg_constraint where conname in
     ('email_messages_kind_check','rfqs_status_check','rfqs_lost_reason_check');
   -- Cần đủ 3 dòng.
   select indexname from pg_indexes where schemaname='public'
     and indexname='email_messages_buyer_status_once_idx';
   -- Cần một dòng.
   ```

3. Xác nhận `MAIL_DOMAIN` trỏ đúng **domain nhận thư đã cấu hình Resend Inbound (catch-all)**; `RESEND_WEBHOOK_SECRET` và `RESEND_API_KEY` đã thiết lập trên môi trường thật, webhook trỏ `/api/webhooks/resend` (event `email.received`). Gửi thử một thư từ NCC, một thư từ buyer, kiểm tra chúng hiện trong timeline đúng RFQ/match. Lưu ý không tự động liên kết địa chỉ From chưa biết, phải xác nhận người gửi / liên hệ trước.
4. Nếu email `buyer_status_update` còn `draft` lâu bất thường (process dừng giữa chừng), kiểm tra Resend logs **trước khi** chủ động xử lý lại: có khả năng email đã ra nhưng chưa kịp cập nhật DB. Không tự ý đổi `draft` → `failed` nếu chưa xác minh, tránh gửi trùng.

## Kiểm thử cục bộ

```bash
node scripts/check-rfq-email.mjs   # parser, routing inbound, chống mạo danh, dedupe, retry
npm run typecheck
npm run build
```

Các bài test dùng mock in-memory, không gửi email thật và không thay đổi DB của preview.
