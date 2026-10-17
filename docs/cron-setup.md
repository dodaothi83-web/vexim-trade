# Thiết lập SLA cron cho RFQ

Vexim Trade không phụ thuộc vào Vercel Cron (giới hạn 1 lần/ngày trên gói Hobby).
Thay vào đó, dùng **[cron-job.org](https://cron-job.org/en/)** (miễn phí, hỗ trợ mỗi phút).

## Bước 1: Sinh secret
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```
Thêm vào `.env` (và Vercel Environment Variables → Production):
```
CRON_SECRET=<chuỗi vừa sinh>
```

## Bước 2: Tạo job trên cron-job.org
1. Đăng nhập https://console.cron-job.org/
2. **CREATE CRONJOB**:
   - **Title**: `Vexim RFQ SLA`
   - **URL**: `https://www.veximtrade.com/api/cron/rfq-sla`
   - **Method**: `GET`
   - **Schedule (UTC)**: `0 2 * * *` — chạy 09:00 giờ Hà Nội mỗi ngày (phù hợp SLA 24h).
     Nếu bạn muốn cảnh báo chính xác hơn, đặt `0 */4 * * *` (mỗi 4 giờ) — route được thiết kế idempotent, sẽ không gửi trùng email.
   - **Headers** (mục `HTTP headers`):
     ```
     Authorization: Bearer <CRON_SECRET>
     ```
   - Bật **Notify on failure** nếu muốn nhận email khi cron lỗi.
3. Lưu và bật job bằng toggle Enabled.

## Bước 3: Kiểm tra
```bash
curl -i -H "Authorization: Bearer <CRON_SECRET>" https://www.veximtrade.com/api/cron/rfq-sla
```
Response JSON (ví dụ):
```json
{
  "ok": true,
  "provider": "cron-job.org (external)",
  "checked": 12,
  "unassigned": 1,
  "due": 0
}
```

## Idempotency — tại sao không sợ spam
- Route ghi timestamp vào `rfqs.specs.sla_unassigned_alerted_at` sau khi gửi cảnh báo chưa phân công.
- Ghi `rfqs.specs.sla_due_alerted_at` sau khi gửi cảnh báo sắp hết hạn phản hồi.
- Dù cron gọi mỗi giờ hay mỗi phút, mỗi loại cảnh báo trên mỗi RFQ sẽ được gửi đúng 1 lần.
- Không có giới hạn tần suất — bạn có thể tăng tần suất cron bất kỳ lúc nào mà không sợ đôi công việc.

## Chuyển đổi giữa nhà cung cấp
Route này chỉ kiểm tra `Authorization: Bearer <CRON_SECRET>` — có thể gọi từ:
- cron-job.org (khuyến nghị cho Hobby)
- GitHub Actions schedule
- UptimeRobot, healthchecks.io, hay bất kỳ webcron nào
- Vercel Cron (nếu nâng lên Pro): chỉ cần thêm lại `vercel.json` với schedule mong muốn.
