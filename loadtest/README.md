# Kiểm thử tải — luồng công khai & RFQ

## 1. Trang công khai (GET) — `k6-public-pages.js`

An toàn để chạy tải cao (20+ VU) trên production: chỉ đọc dữ liệu, không ghi gì.
Mở rộng từ script đợt trước (trang chủ + danh mục Hạt điều) sang thêm vài trang
công khai tiêu biểu khác. Chạy bằng k6 cloud hoặc local:

```sh
k6 run loadtest/k6-public-pages.js
# hoặc
k6 cloud loadtest/k6-public-pages.js
```

Kết quả đợt đầu (20 VU, 5 phút, trang chủ + danh mục): 5.9K request, 0 lỗi
HTTP, Peak RPS 24.83, P95 894ms — qua ngưỡng thoải mái.

**Lưu ý thực tế (đợt 2):** lần đầu mở rộng danh sách trang, có đưa nhầm
`/suppliers` (danh sách tổng NCC) vào — route này **không tồn tại trong
code** (chỉ có trang chi tiết `/suppliers/[slug]` theo từng nhà cung cấp,
không có trang liệt kê tất cả). Mỗi request `/suppliers` trả về 404, kéo
`http_req_failed` lên 14% (519/3.6K) và test bị đánh fail-by-threshold.
Không phải do server chịu tải kém — đã bỏ `/suppliers` khỏi danh sách.
Bài học: trước khi thêm một path mới vào script, nên xác nhận route đó có
thật trong `app/` hoặc đã từng mở trang đó qua trình duyệt, chứ không nên
đoán theo tên.

## 2. Vì sao KHÔNG có script k6 tải cao cho việc gửi RFQ thật

Đã đọc code `lib/rfq/submit.ts` trước khi viết test và thấy 3 lý do không nên
tự động hoá kiểu "20 VU × 5 phút" vào đây trên production:

1. **Bắt buộc đăng nhập buyer thật.** `submitRfq()` đọc danh tính từ
   `getBuyerSession()` (cookie ký số), không nhận email tự gõ trong payload.
   Muốn test thật cần N cookie session hợp lệ cho N buyer khác nhau.
2. **Đây là Next.js Server Action**, không phải REST endpoint — gọi bằng POST
   tới URL trang kèm header `Next-Action` + id được băm lại mỗi lần build,
   không ổn định để hard-code vào script test lâu dài.
3. **Submit thành công = dữ liệu thật + email thật.** Mỗi request OK sẽ ghi
   một RFQ thật, gửi email xác nhận cho "buyer", gửi email nội bộ cho đội
   Vexim, và lên lịch auto-match nhà cung cấp. Chạy tải cao vào đây sẽ tạo
   rác trong database và spam hộp thư thật.

## 3. Giới hạn 5 RFQ/giờ/người — đã sửa để đúng khi chạy tải thật

Trước khi thêm bất kỳ test tải nào vào luồng submit, đã phát hiện và sửa một
lỗi thật trong `lib/rfq/rate-limit.ts` liên quan trực tiếp tới việc chạy dưới
tải: bộ đếm "5 RFQ/giờ/người" cũ sống trong bộ nhớ của **một tiến trình Node**
(`Map` toàn cục). Trên Vercel, mỗi lambda instance có bộ nhớ RIÊNG — dưới tải
thật (nhiều instance xử lý song song), một buyer có thể gửi vượt quá 5
RFQ/giờ nếu các request của họ rơi vào nhiều instance khác nhau, vì mỗi
instance tưởng đó là request đầu tiên.

**Đã sửa** (`lib/rfq/submit.ts`): thêm một lớp kiểm tra giới hạn tính trên dữ
liệu RFQ **đã lưu thật** trong Supabase (đúng trên mọi lambda instance), theo
danh tính buyer đã đăng nhập — không còn dựa vào IP/UA dễ đổi. Lớp cũ (IP/UA,
in-memory) vẫn giữ lại làm lớp chặn rẻ, sớm trước khi tốn công tra MX/chấm
điểm spam cho request rõ ràng là bot.

Kiểm chứng hành vi này bằng test riêng (không cần chạy k6 thật vào production):

```sh
node --experimental-strip-types --no-warnings scripts/check-rfq-rate-limit.mjs
# hoặc chạy cùng cả cụm:
npm run check:rfq
```

## 4. Nếu muốn test thật luồng submit (thủ công, số lượng nhỏ)

Khuyến nghị: đăng nhập 1 tài khoản buyer thật (dùng email riêng cho việc
test, không phải email khách thật), gửi 5 RFQ liên tiếp qua UI thật, xác
nhận:
- Cả 5 đều thành công.
- RFQ thứ 6 trong cùng giờ bị từ chối với thông báo "Quá nhiều yêu cầu...".
- Sau khi dọn dữ liệu test, xoá các RFQ test đó khỏi CRM để không lẫn với
  số liệu thật.

Không khuyến nghị chạy hàng nghìn request tự động vào endpoint này trên
production vì các lý do ở mục 2.
