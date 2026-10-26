# Bảo vệ đăng ký và đăng nhập

Tài liệu này mô tả kiểm soát trong mã. Cấu hình Production vẫn phải được kiểm tra trên Vercel, Cloudflare, Upstash và Supabase trước khi mở luồng thật.

## Phạm vi áp dụng

| Luồng | Kiểm soát |
| --- | --- |
| Đăng nhập email và mật khẩu | Turnstile phía server, giới hạn theo IP và theo cặp IP + email, giới hạn độ dài đầu vào, phản hồi không kèm lỗi hệ thống thô |
| Đăng ký nhà cung cấp bằng email | Turnstile phía server, honeypot, giới hạn theo IP và theo cặp IP + email, kiểm tra consent và mật khẩu, phản hồi chung cho email mới hoặc đã tồn tại |
| Thiết lập quản trị viên đầu tiên | Turnstile phía server và giới hạn lượt trước khi đọc hoặc tạo tài khoản; điều kiện hệ thống chưa có người dùng vẫn giữ nguyên |
| Đăng ký dịch vụ ở trang chủ | Turnstile phía server, honeypot, body limit và giới hạn lượt trước audit log hoặc gửi email |
| Đăng nhập hoặc đăng ký bằng Google | Giới hạn lượt khởi tạo theo IP, PKCE, cookie flow HttpOnly, origin allowlist và email Google đã xác minh |
| Câu hỏi cho nhà cung cấp | Giữ nguyên kiểm soát hiện có; dùng chung hàm xác minh Turnstile có timeout |

Turnstile chỉ nhận token từ client. Quyết định cuối cùng luôn nằm ở server bằng `TURNSTILE_SECRET_KEY`. Token quá dài, thiếu, không hợp lệ hoặc không xác minh được sẽ không tới bước xác thực mật khẩu hoặc tạo tài khoản trong Production. Form tạo challenge mới sau mỗi lần gửi lỗi vì token Turnstile chỉ dùng một lần.

## Giới hạn lượt

Các bucket dùng fixed window và chỉ gửi SHA-256 fingerprint tới Redis, không gửi IP hoặc email thô.

| Flow | IP | IP + email |
| --- | --- | --- |
| Login | 30 lượt / 15 phút | 5 lượt / 15 phút |
| Supplier signup | 3 lượt / giờ | 3 lượt / 24 giờ |
| Admin setup | 3 lượt / giờ | 3 lượt / 24 giờ |
| Service inquiry | 5 lượt / giờ | 3 lượt / 24 giờ |

Bucket IP của Google và password cùng flow được dùng chung để tránh đổi kênh nhằm vượt giới hạn. Google start không có email nên chỉ dùng bucket IP. Bucket theo email luôn gồm cả IP, nên kẻ tấn công ở mạng khác không thể tự khóa tài khoản của nạn nhân bằng email đã biết.

Mỗi tiến trình có limiter trong RAM. Upstash thêm limiter dùng chung giữa các serverless instance. Code nhận một trong hai cặp biến, không trộn credentials giữa hai cặp:

```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

hoặc:

```env
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

Nếu Upstash thiếu cấu hình hoặc lỗi, login và signup vẫn phải qua limiter cục bộ và Turnstile, đồng thời server ghi cảnh báo. Đây là lựa chọn để không khóa toàn bộ người dùng khi Redis mất kết nối. Trong trạng thái này giới hạn giữa nhiều instance không còn hiệu lực. Câu hỏi cho nhà cung cấp không đổi hành vi: yêu cầu vẫn được đưa vào `needs_review` thay vì gửi trực tiếp.

## Phản hồi và tài khoản

- Supplier signup không còn trả HTTP 409 riêng khi email đã tồn tại. Phản hồi chấp nhận có cùng nội dung cho email mới, email trùng và honeypot. Yêu cầu trùng không tạo tài khoản và không gửi thông báo nhân viên mới.
- API không trả trạng thái gửi thư nội bộ hoặc cấu hình xác nhận email cho browser. Lỗi Supabase, migration và network chỉ nằm trong log server.
- Login không trả `details` chứa lỗi backend cho browser. Lỗi không mong đợi có thông báo chung.
- Khi dùng mật khẩu nội bộ, tài khoản không tồn tại hoặc không có mật khẩu vẫn đi qua scrypt với dummy hash. Trạng thái khóa chỉ được tiết lộ sau khi mật khẩu đúng. Nhà cung cấp vẫn không thể dùng local password fallback.
- Tài khoản nhà cung cấp mới vẫn có `supplier_id=null`. Không thay đổi điều kiện xác nhận email, duyệt hồ sơ, quyền sản phẩm hoặc quyền RFQ.
- Cookie phiên vẫn HttpOnly, SameSite=Lax và Secure theo HTTPS. Không bao giờ dùng `SUPABASE_ANON_KEY` để suy ra khóa ký phiên vì anon key là công khai. Production cần `AUTH_SECRET` riêng, đủ mạnh.

## Cấu hình Production cần kiểm tra

1. Dùng cùng cặp Turnstile cho các form công khai trên cùng hostname. Site key là công khai, secret key chỉ đặt phía server:

   ```env
   TURNSTILE_SITE_KEY=...
   TURNSTILE_SECRET_KEY=...
   ```

2. Cloudflare widget phải cho phép `www.veximtrade.com`. Nếu thử preview hoặc staging, thêm đúng hostname đó hoặc dùng cặp key riêng cho môi trường đó. Không dùng Turnstile testing keys trên Production.
3. Kiểm tra một trong hai cặp Upstash REST credentials trên Vercel Production. Không dùng `KV_URL` cho REST client.
4. Đặt `AUTH_SECRET` ngẫu nhiên, tối thiểu 32 byte. Không dùng anon key và không commit secret.
5. Sau deploy, thử đăng ký và đăng nhập hợp lệ, token đã dùng lại, challenge hết hạn và vượt giới hạn. Không gửi mật khẩu thật hoặc secret trong ticket/log/chat.

Kiểm tra offline:

```sh
node scripts/check-auth-security.mjs
node scripts/check-turnstile-widget.mjs
node scripts/check-service-inquiry-security.mjs
node scripts/check-google-oauth.mjs
node scripts/check-supplier-self-registration.mjs
node scripts/check-supplier-question.mjs
node scripts/check-supplier-question-rate-limit.mjs
npm run typecheck
```
