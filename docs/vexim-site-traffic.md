# Lưu lượng truy cập toàn sàn (CRM)

`/crm/traffic` là báo cáo **admin-only** (`traffic.view`). Menu nằm trong **Vận hành sàn**, sau Danh mục sản phẩm. Dashboard CRM chỉ có liên kết và lượt mở trong 7 ngày khi đọc được số liệu; không biến lưu lượng thành đơn hàng, GMV, RFQ hay người dùng duy nhất.

## Triển khai dữ liệu

1. Trên **đúng dự án Supabase** dùng bởi ứng dụng, bảo đảm đã áp dụng `supabase/migrations/20261017_supplier_traffic_daily.sql` cho các lượt mở hồ sơ NCC/chi tiết sản phẩm. Sau đó áp dụng `supabase/migrations/20261018_vexim_site_traffic.sql` cho các trang còn lại và hàm đọc gộp.
2. Ứng dụng cần `SUPABASE_SERVICE_ROLE_KEY` chỉ trên server. Cả bảng mới và RPC chỉ cấp quyền `service_role`; `anon` và `authenticated` không được đọc số liệu. `VEXIM_LOCAL_FALLBACK=off` trên preview/staging/production. Migration **không** chạy tự động khi deploy; nếu thiếu hoặc mất kết nối, CRM báo không có dữ liệu chứ không hiển thị 0 giả.
3. Kiểm tra ở staging bằng phiên ẩn danh mở trang chủ, danh mục đã đăng, bài blog đã đăng, `/rfq`, hồ sơ NCC công khai và chi tiết sản phẩm đủ điều kiện. Bộ đếm cùng trang/cùng tab giới hạn 30 phút. Trang nháp, preview, CRM, cổng NCC, `/rfq/status/...`, lượt của người đã đăng nhập và crawler thông dụng không được ghi. Kiểm tra role sale/sourcing/viewer bị từ chối `/crm/traffic`, admin xem được 7/30/90 ngày. Lượt xem trước ngày bật đo lường **không thể backfill**.

## Phạm vi và giới hạn

Báo cáo cộng các lượt hồ sơ NCC/chi tiết sản phẩm **đã có** trong `supplier_traffic_daily` với lượt ở `vexim_site_traffic_daily`: trang chủ, danh mục công khai, blog và bài viết, RFQ, trang giới thiệu/so sánh. Không ghi hai lần lượt hồ sơ/sản phẩm. Trang chi tiết blog/danh mục chỉ được đếm nếu vẫn được công khai tại thời điểm ghi. Cả hai bảng lưu bộ đếm theo ngày UTC, không lưu IP, user agent, referrer, cookie, định danh buyer hay query string/token. Có thể thiếu lượt vì chặn JavaScript/ad blocker hoặc trình duyệt đóng sớm; không phải đo người dùng duy nhất, traffic chống gian lận, hay chuyển đổi RFQ. Speed Insights đo hiệu năng, không cung cấp bộ đếm lưu lượng này.

Offline: `node --experimental-strip-types --no-warnings scripts/check-site-traffic.mjs`, `node scripts/check-navigation-priority.mjs`, `npm run typecheck`, `npm run build`.
