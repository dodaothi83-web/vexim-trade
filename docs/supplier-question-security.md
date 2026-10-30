# Bảo vệ form Ask supplier

Form dùng challenge chống bot tự chủ (proof-of-work, không còn Cloudflare Turnstile) và Upstash Redis cho gửi trực tiếp. Giới hạn hiện tại: 5 lượt/giờ theo IP và 3 lượt/24 giờ cho cùng email buyer gửi cùng supplier. Không cần migration hoặc cài Redis trên server.

## 1. Challenge chống bot (không cần key bên ngoài)

1. Challenge là proof-of-work tự chủ trong `lib/security/challenge.ts` — không phải đăng ký Cloudflare Turnstile hay dịch vụ nào.
2. Khoá ký mặc định suy từ `AUTH_SECRET`; tùy chọn tách bằng `CHALLENGE_SECRET`, chỉnh độ khó bằng `CHALLENGE_DIFFICULTY` (mặc định 4).
3. Challenge thiếu/không giải được không chặn form: câu hỏi rơi vào `needs_review` qua cờ `challenge_missing` của chấm điểm spam.

## 2. Lấy Upstash Redis REST credentials

1. Mở [Upstash Console](https://console.upstash.com/) → **Create database**.
2. Chọn region gần vùng chạy ứng dụng rồi tạo database.
3. Trong phần **REST API** của database, sao chép **REST URL** và **REST Token**.

## 3. Gắn biến môi trường

Trên Vercel: **Project → Settings → Environment Variables**, chỉ cần biến Upstash cho **Production** rồi redeploy (challenge không bắt buộc biến nào):

```env
# Tùy chọn — khoá ký và độ khó của challenge tự chủ (mặc định suy từ AUTH_SECRET, difficulty 4):
# CHALLENGE_SECRET=...
# CHALLENGE_DIFFICULTY=4
```

Nếu tạo database trong Upstash Console, thêm cặp REST credentials:

```env
UPSTASH_REDIS_REST_URL=rest_url_tu_upstash
UPSTASH_REDIS_REST_TOKEN=rest_token_tu_upstash
```

Nếu dùng **Vercel → Storage → Upstash Redis** và connect database vào project, Vercel tự inject `KV_REST_API_URL` và `KV_REST_API_TOKEN`. Code nhận trực tiếp cặp này, không cần nhân đôi sang `UPSTASH_REDIS_REST_*`. `KV_URL` là kết nối TCP và không được dùng cho REST client. Nếu có cả hai cặp, code ưu tiên cặp `UPSTASH_REDIS_REST_*` đầy đủ.

Không commit hoặc gửi secret qua chat. Khoá ký challenge mặc định suy từ `AUTH_SECRET` qua HKDF riêng, không dùng lại trực tiếp khoá cookie phiên.

## 4. Kiểm tra sau deploy

- Gửi một câu hỏi hợp lệ và kiểm tra supplier nhận email, buyer nhận xác nhận.
- Nếu Upstash không khả dụng, câu hỏi được lưu ở `needs_review`, không gửi trực tiếp. CRM ghi cờ `rate_limit_not_configured` hoặc `rate_limit_unavailable`. Challenge không giải được cũng đưa vào `needs_review` với cờ `challenge_missing`.
- Nếu vượt giới hạn, form báo thử lại sau và không tạo email supplier.
