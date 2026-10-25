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

## Cron 2: Nhắc hết hạn chứng nhận L1 (đã gộp chung vào `/api/cron/rfq-sla` + có route riêng `/api/cron/certificate-expiry`)
- **Không cần tạo thêm biến môi trường hay cron job mới:** `/api/cron/rfq-sla` đã tự động chạy kèm bước kiểm tra nhắc hết hạn chứng nhận L1 (`60 / 30 / 7 / 1` ngày) trong cùng một lần gọi, dùng chung đúng biến `CRON_SECRET` hiện có.
- Nếu muốn tách lịch gọi riêng, bạn cũng có thể trỏ thêm 1 job vào `GET https://www.veximtrade.com/api/cron/certificate-expiry` với **cùng header `Authorization: Bearer <CRON_SECRET>`** (dùng chung chính mã `CRON_SECRET` đã cài).
- **Idempotent:** mỗi mốc (`d60`, `d30`, `d7`, `d1`) được ghi nhận trong `certificates.expiry_notified` nên dù gọi gộp trong `/api/cron/rfq-sla` hay gọi riêng `/api/cron/certificate-expiry` nhiều lần trong ngày cũng không bao giờ gửi trùng email; khi NCC tải bản mới có `valid_until` mới, các mốc được đặt lại từ đầu.

## Cron 3: Nghiên cứu và cập nhật lịch mùa vụ

Tạo một job chạy mỗi ngày:

- **URL**: `https://www.veximtrade.com/api/cron/harvest-research`
- **Method**: `GET`
- **Header**: `Authorization: Bearer <CRON_SECRET>`
- **Schedule gợi ý**: `30 18 * * *` UTC, tức 01:30 giờ Hà Nội.

Cần `OPENAI_API_KEY` trên môi trường Production. `OPENAI_HARVEST_RESEARCH_MODEL` là tùy chọn, mặc định `gpt-4.1-mini`. Mỗi lần chạy xử lý một danh mục; có thể đặt `HARVEST_RESEARCH_BATCH_SIZE=2` nếu thời gian chạy và hạn mức API cho phép, tối đa 4.

Cơ chế an toàn:

- Chỉ dùng thông tin mùa thu hoạch có URL nguồn và trích dẫn nguyên văn. Hệ thống tự tải lại nguồn để đối chiếu, kiểm tra tháng, vùng và nhãn vụ chính/vụ phụ.
- Kết quả hợp lệ ghi trực tiếp vào `categories.harvest`, gồm ngày rà soát và danh sách nguồn. Không có bảng đề xuất hoặc bước duyệt thủ công.
- Nguồn không đọc được, trích dẫn không khớp, dữ liệu mâu thuẫn hoặc thiếu bằng chứng thì giữ nguyên lịch cũ.
- Trước khi ghi, hệ thống đọc lại danh mục. Nếu nhân sự vừa sửa trong lúc AI chạy, kết quả tự động bị bỏ qua.
- Mọi lần cập nhật hoặc bỏ qua được ghi vào `audit_log` với action `category.harvest_research_updated` hoặc `category.harvest_research_failed`. Lịch sử này cũng giúp luân phiên danh mục, tránh một danh mục lỗi chặn các danh mục khác.

Kiểm tra thủ công:

```bash
curl -i -H "Authorization: Bearer <CRON_SECRET>" \
  "https://www.veximtrade.com/api/cron/harvest-research?batch=1"
```

Response có `updated`, `unchanged` và chi tiết `results[].code`. `unchanged` không làm mất lịch hiện tại. Nguồn PDF hoặc trang không cho đọc HTML sẽ bị bỏ qua, không được thay bằng kiến thức từ bộ nhớ của model.
