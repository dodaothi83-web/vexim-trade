# Bảo vệ form Ask supplier

Form dùng Turnstile và Upstash Redis cho gửi trực tiếp. Giới hạn hiện tại: 5 lượt/giờ theo IP và 3 lượt/24 giờ cho cùng email buyer gửi cùng supplier. Không cần migration hoặc cài Redis trên server.

## 1. Lấy Cloudflare Turnstile keys

1. Mở [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Turnstile** → **Add widget**.
2. Đặt tên widget, thêm hostname `www.veximtrade.com` rồi tạo widget.
3. Sao chép **Site Key** và **Secret Key**.

## 2. Lấy Upstash Redis REST credentials

1. Mở [Upstash Console](https://console.upstash.com/) → **Create database**.
2. Chọn region gần vùng chạy ứng dụng rồi tạo database.
3. Trong phần **REST API** của database, sao chép **REST URL** và **REST Token**.

## 3. Gắn biến môi trường

Trên Vercel: **Project → Settings → Environment Variables**, thêm bốn biến cho **Production** rồi redeploy. Hosting khác dùng cùng tên biến trong phần cấu hình môi trường.

```env
TURNSTILE_SITE_KEY=site_key_tu_cloudflare
TURNSTILE_SECRET_KEY=secret_key_tu_cloudflare
UPSTASH_REDIS_REST_URL=rest_url_tu_upstash
UPSTASH_REDIS_REST_TOKEN=rest_token_tu_upstash
```

Không commit hoặc gửi secret qua chat. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` cũ vẫn được hỗ trợ, nhưng cấu hình mới nên dùng `TURNSTILE_SITE_KEY`.

## 4. Kiểm tra sau deploy

- Gửi một câu hỏi hợp lệ và kiểm tra supplier nhận email, buyer nhận xác nhận.
- Nếu thiếu cấu hình hoặc Turnstile/Upstash không khả dụng, câu hỏi được lưu ở `needs_review`, không gửi trực tiếp. CRM ghi cờ `rate_limit_not_configured` hoặc `rate_limit_unavailable` khi liên quan đến Upstash.
- Nếu vượt giới hạn, form báo thử lại sau và không tạo email supplier.
