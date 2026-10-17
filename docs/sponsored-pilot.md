# Vị trí tài trợ: nền tảng thử nghiệm, **chưa mở bán**

Chỉ là hạ tầng để thử nghiệm sau này, **không** có chiến dịch mặc định, bảng giá, hoá đơn, thu phí hoặc chỉ tiêu traffic. Vị trí tách khỏi kết quả tự nhiên của danh mục; kết quả tự nhiên vẫn xếp xen kẽ NCC và lọc như trước. Vị trí giới hạn **một sản phẩm/danh mục** khi chưa bật bộ lọc và luôn ghi “Sponsored · Tài trợ” / “Paid placement, not a Vexim verification result”. Không tự thêm huy hiệu xác minh, không hiển thị giấy tờ, không mở quyền NCC hay công khai sản phẩm nhờ tài trợ.

## Điều kiện triển khai

- **Mặc định tắt.** Mã chỉ đọc chiến dịch khi `VEXIM_SPONSORED_PILOT=true` **và** `VEXIM_DEPLOY_ENV=staging`; luôn chặn `VERCEL_ENV=production`. Không đặt hai biến này ở production. Không nên bật `VEXIM_LOCAL_FALLBACK` trong preview/staging/production.
- Trước khi thử: áp dụng `supabase/migrations/20261017_sponsored_pilot.sql` trên **đúng Supabase staging project**, sau migration sản phẩm/cổng NCC. Migration tạo bảng chiến dịch và bộ đếm impression/click theo ngày UTC; RLS bật, chỉ service role truy cập; không tạo chiến dịch. Không chạy `schema.sql` trực tiếp lên production. Thiếu migration/DB → không hiện quảng cáo; ứng dụng ghi cảnh báo ở server khi đã bật flag.
- Admin Vexim xác nhận **bằng tay** sản phẩm đủ điều kiện và ghi chiến dịch qua SQL/staff tooling tương lai. Bản nháp không hiện. Chỉ admin đang hoạt động có thể được ghi là `approved_by` khi đổi `status='approved'`; cần `approved_at` thật và khoảng `starts_at < ends_at`. Không cho NCC tự bật/duyệt. Bảng chặn hai chiến dịch `approved` cùng danh mục. Muốn thay thế chiến dịch, tạm dừng bản cũ trước. Dừng ngay: đặt `VEXIM_SPONSORED_PILOT=false` hoặc đổi chiến dịch sang `paused`.
- Sau khi bật trên staging, mã vẫn kiểm tra lại category published, sản phẩm buyer-ready, review approved, ảnh/catalogue buyer hợp lệ, supplier published, không demo/test, đúng category & đúng NCC. Sản phẩm không đủ điều kiện bị ẩn mà **không** tự thay bằng sản phẩm khác. Hết thời hạn hoặc bị dừng → không ghi thêm sự kiện.

**Thao tác thử nghiệm thủ công (chỉ SQL Editor staging, admin Vexim):** lấy `id` sản phẩm, `supplier_id` thực và slug danh mục đã published sau khi kiểm tra trang công khai. Tạo chiến dịch ở `status='draft'` với `starts_at`, `ends_at`; **không** cho NCC điền bảng này. Sau khi admin rà soát, đổi thành `status='approved'`, đặt `approved_by` bằng ID của **app_users admin đang hoạt động** và `approved_at=now()`. Ghi lại ID chiến dịch để tạm dừng bằng `update public.sponsored_pilot_campaigns set status='paused' where id = ...`. Nếu cần thay chiến dịch trong cùng danh mục, tạm dừng bản cũ **trước** khi duyệt bản mới. Không chạy các lệnh này ở production. Dùng trang danh mục staging để kiểm tra nhãn, ảnh, link, mobile, bộ lọc và kết quả organic trước/sau bật flag; không tạo "lượt xem" bằng dữ liệu thử rồi đem quảng bá cho NCC.

## Đo lường trong thử nghiệm

Impression được bắn từ browser khi ít nhất 50% vị trí hiện trong khung nhìn 800ms; click được bắn khi buyer mở link chi tiết sản phẩm. Mỗi tab giới hạn một sự kiện cùng loại/chiến dịch trong 30 phút bằng sessionStorage; phiên đăng nhập/crawler phổ biến bị bỏ qua. Cả hai sự kiện quảng cáo được ghi vào **bảng riêng** `sponsored_pilot_daily`, không trộn vào bộ đếm sự kiện `supplier_traffic_daily` hay báo cáo RFQ. Tuy nhiên, nếu buyer sau đó mở trang sản phẩm, **lượt mở trang đó vẫn nằm trong tổng lượt xem sản phẩm** của dashboard NCC; dashboard hiện chưa tách nguồn organic/tài trợ. Không gọi tổng lượt xem sản phẩm là "organic" hoặc dùng hai bảng để cộng thành unique buyers. Có thể xem sự kiện quảng cáo trên SQL Editor staging (chỉ nội bộ):

```sql
select c.category_slug, c.product_id, m.day, m.event_type, m.events
from public.sponsored_pilot_daily m
join public.sponsored_pilot_campaigns c on c.id = m.campaign_id
order by m.day desc, c.category_slug, m.event_type;
```

Đây là **ước lượng kỹ thuật**, không phải số liệu đủ để tính tiền: ad blocker, JavaScript bị tắt, mở nhiều tab, bot tinh vi, token bị phát lại và client không gửi thành công có thể làm lệch số. Không lưu IP, referrer, danh tính buyer hay thanh toán. Chưa có đối soát fraud, giới hạn ngân sách, hoàn tiền hoặc điều khoản bán. Trước khi mở bán thật phải chốt chính sách minh bạch, đo lường đáng tin cậy, thời lượng/giá/vị trí, duyệt thủ công, kiểm thử mobile và tách báo cáo trả phí/tự nhiên cho NCC.

Kiểm thử offline: `node scripts/check-sponsored-pilot.mjs`, `npm run typecheck`, `npm run build`. Chưa chạy migration hoặc xác minh dữ liệu thật trên Supabase trong sandbox này.
