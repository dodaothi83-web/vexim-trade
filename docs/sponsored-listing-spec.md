# Đẩy sản phẩm: phạm vi đang hỗ trợ

Cập nhật ngày 28/10/2026. Đây là mô tả để vận hành gói tài trợ; không phải xác nhận rằng mã hoặc migration đã được triển khai lên production.

## Vị trí bán

- Một gói dành cho **một sản phẩm đủ điều kiện công khai**, tại khu vực tài trợ ở đầu trang danh mục **khi người xem chưa bật bộ lọc**. Số ô theo tổng sản phẩm công khai không phải demo trước lọc: 1 ô khi dưới 10, 2 ô khi 10–30 và 3 ô khi trên 30; danh mục rỗng không có ô. Các ngưỡng và số ô là cấu hình triển khai. Mỗi thẻ có nhãn “Sponsored · Tài trợ” và phần giải thích.
- Chưa có vùng tài trợ trên **trang chủ** hoặc trong **kết quả tìm kiếm**; không bán, tạo, duyệt hay chạy lại gói trang chủ. Không có huy hiệu “gian hàng nổi bật” trả phí.
- Quảng cáo không thay đổi kết quả xác minh, điểm hay thứ hạng tự nhiên. Khi thẻ tài trợ đang hiện, cùng sản phẩm không lặp trong lưới tự nhiên; khi có bộ lọc, vùng tài trợ ẩn và sản phẩm trở lại lưới theo điều kiện thông thường.
- Gói còn hạn cũng không hiện nếu sản phẩm, nhà cung cấp hoặc danh mục không còn đủ điều kiện công khai. Do luân phiên, một gói không nằm trong mọi cửa sổ; người xem có thể không gặp thẻ.

## Thời hạn và giữ chỗ

- Gói mới bắt đầu **khi được kích hoạt** (trong quy trình thủ công hiện tại là lúc được duyệt), kéo dài đúng **168 giờ**. Nháp chưa giữ chỗ; thời gian được lưu trên nháp chỉ là mốc tạm do schema yêu cầu và sẽ được thay khi duyệt.
- Trước khi duyệt, máy chủ kiểm lại sản phẩm, nhà cung cấp, danh mục và toàn bộ khoảng 168 giờ mới. Chỉ admin hoặc trưởng kiểm duyệt có quyền mới được thao tác. Sau khi áp migration `20261042_sponsored_placement_guards.sql`, cơ sở dữ liệu dùng đồng hồ của mình, kiểm vai trò và khoá theo sản phẩm/bể khi duyệt.
- **Lưu ý giai đoạn chuyển tiếp:** bể hiện vẫn dùng giới hạn cũ tối đa 12 gói, chưa áp dụng 4 gói/ô hoặc giữ chỗ. Không được giới thiệu tỷ lệ 25% hoặc mở bán tự động trước khi hoàn thiện kiểm soát bể và đối soát gói cũ. Bể danh mục có tối đa 12 gói đã duyệt hoặc tạm dừng có khoảng thời gian chồng lấn; một sản phẩm không có hai gói chồng lấn, kể cả gói đang tạm dừng. Việc tính chồng lấn thận trọng: các gói giao với khoảng mới đều được tính, dù chúng không nhất thiết giao với nhau cùng lúc.
- Tạm dừng không hoàn trả thời gian và vẫn giữ chỗ đến hết hạn. Chạy lại không tự gia hạn; sản phẩm phải còn đủ điều kiện. Xoá chỉ dành cho nháp và có kiểm tra trạng thái ngay lúc xoá, để không xoá nhầm gói vừa duyệt.
- Không có thanh toán, hoá đơn, hoàn tiền hay đối soát tự động. **Không tự sửa hoặc gia hạn gói đã bán.** Gói trang chủ cũ vẫn được giữ để đối soát, có thể tạm dừng nhưng không duyệt hay chạy lại. Cần kiểm tra thực tế và trao đổi với khách trước khi xử lý.
- Quy định tối đa hai gói cùng lúc cho một nhà cung cấp từng được nêu trong bản nháp đặc tả nhưng chưa có chốt thực thi trong mã/CSDL; không được giới thiệu là đã bảo đảm.

## Luân phiên không phải lượt xem

Một cửa sổ luân phiên dài 10 phút, cố định theo UTC. Gói hợp lệ được sắp theo thứ tự ổn định và xoay vòng qua số ô động của danh mục (tối đa ba theo cấu hình mặc định). Nếu 12 gói đều đủ điều kiện và không đổi trong một tuần, mô phỏng 1.008 cửa sổ đầy đủ cho khoảng **252 cửa sổ được chọn/gói**. Cửa sổ đầu/cuối có thể không đủ 10 phút; số gói, sản phẩm đủ điều kiện hoặc trang đang lọc cũng có thể thay đổi.

Con số này **không phải 252 lượt xem, lượt truy cập hay số người**, không dự báo lượng khách và không bảo đảm hiệu quả. Số chỗ trống trên CRM là tại thời điểm xem; vẫn phải kiểm toàn bộ khoảng thời gian khi duyệt, kể cả các gói đã lên lịch hoặc đang tạm dừng.

## Số liệu đã ghi

- Hệ thống thử ghi một lượt hiển thị khi ít nhất một nửa thẻ nằm trong khung nhìn đủ 800 ms liên tục và tab đang hiển thị. Khi tab bị ẩn, thời gian chờ bị huỷ; trở lại tab thì tính lại từ đầu. Lượt nhấp là nhấp vào liên kết trên thẻ, gồm sản phẩm, nhà cung cấp hoặc báo giá.
- Chỉ ghi khi người xem đồng ý đo lường tiếp thị. Mỗi tab chỉ ghi một sự kiện cùng loại cho mỗi gói trong 30 phút. Số liệu có thể thiếu, không phải số người duy nhất và không tính tiền theo lượt.
- Báo cáo là bảy ngày UTC gần nhất, tính cả hôm nay. Số liệu lịch sử không được tính lại; dữ liệu trước khi sửa cách kiểm vùng nhìn có thể theo hành vi cũ.
- Khi không đọc được số liệu, CRM báo **chưa tải được**, không mặc định là không có lượt. Nếu không đọc được gói, CRM không giả là bể rỗng.

## 5. Lưới tự nhiên hiện tại — không đổi trong giai đoạn 0/1

- Xác minh được xét theo tầng trước, sau đó so điểm trong cùng tầng và tên; sản phẩm tiếp tục được xen kẽ theo nhà cung cấp. Quy tắc này hiện vẫn tính L1, L2 và L3; phương án mới chưa được chốt hoặc bật.
- Điểm hiện tại gồm 30 xác minh còn hiệu lực, 30 giá công khai, 15 quy cách, 15 độ đầy đủ, 10 OEM/ODM/mẫu. Cần rà các tín hiệu trước khi đề xuất công thức mới; đây không phải điểm Google.
- Khi chưa lọc, danh mục giới hạn ba thẻ tự nhiên mỗi nhà cung cấp, hoặc hai nếu chỉ có một nhà cung cấp. Thẻ tài trợ được lấy ra trước khi áp trần đó; khi lọc thì ẩn vùng tài trợ và bỏ trần. Quảng cáo không thay đổi dải giá tham khảo.
- Đọc đủ dữ liệu có thể làm xuất hiện thêm thẻ trước đây bị giới hạn; thứ tự khi các thẻ hoà hoàn toàn có thể thay đổi theo thứ tự nguồn. Xem giới hạn và yêu cầu so sánh staging trong `docs/catalog-pagination-phase01.md`.

## Yêu cầu từ cổng nhà cung cấp

- Trang `/supplier/portal/boost` chỉ nhận yêu cầu cho sản phẩm của tài khoản đang đăng nhập, khi cổng đã mở và sản phẩm còn đủ điều kiện công khai. Máy chủ kiểm tra lại trước khi ghi; mỗi sản phẩm chỉ có một yêu cầu chưa kết thúc. Có thể gửi lại sau khi nhân viên kết thúc yêu cầu cũ.
- Yêu cầu lưu riêng trong `sponsored_requests`, **không tạo gói, chỗ, thanh toán hoặc kích hoạt**. Nếu lỗi lúc ghi hoặc phản hồi bị mất, giao diện yêu cầu tải lại kiểm tra trước khi gửi lại; không khẳng định đã nhận khi chưa xác nhận được. Ở chế độ xem thử local, ghi file có kiểm tra lỗi và giao diện nói rõ dữ liệu không gửi đến hệ thống thật. Trên staging/production thiếu Supabase, chặn gửi thay vì lưu local.
- Nhân viên có quyền xem ở `/crm/sponsored`, theo dõi yêu cầu mới qua huy hiệu menu và chuông CRM. Khi không đếm được yêu cầu, menu hiện dấu cảnh báo thay vì coi là không có việc. Sale, admin và trưởng kiểm duyệt có thể đánh dấu đã liên hệ hoặc kết thúc; **sale không có quyền tạo/duyệt gói**. Chưa có email thông báo tự động; nhân viên phải theo dõi CRM. Cập nhật trạng thái yêu cầu cũng không tạo gói. Màn NCC chỉ đọc yêu cầu, gói và số liệu của chính mình; không hiện ghi chú nội bộ của gói.
- Gói hiển thị là dữ liệu đã ghi, không suy ra đã thanh toán. Số liệu là bảy ngày UTC gần nhất, phụ thuộc đồng ý đo lường và có thể thiếu; lỗi tải dùng dấu “—”. Gói đủ điều kiện trong thời hạn có thể tham gia luân phiên, không có nghĩa thẻ xuất hiện ở mọi lượt xem.

### Checklist trước khi dùng thật

1. Trên staging, xác nhận `SUPABASE_URL` và khoá **service role** trỏ đúng project; tắt dự phòng local, kiểm tra chế độ dữ liệu và không dùng dữ liệu mẫu. Áp `20261043_sponsored_requests.sql` cùng các migration gói có liên quan. Migration tạo bảng rỗng, không tạo yêu cầu hay gói; xác nhận quyền/RLS thực tế sau khi áp.
2. Dùng hai tài khoản NCC và tài khoản sale/admin thật ở staging: gửi một yêu cầu, xác nhận hàng lưu trong CSDL và xuất hiện ở CRM, kiểm tra huy hiệu/chuông, đánh dấu liên hệ/kết thúc, xem trạng thái phản ánh ở NCC; xác nhận không lộ yêu cầu, gói, số liệu và ghi chú của NCC khác. Kiểm tra sản phẩm bị gỡ/đổi điều kiện, giả mạo ID, gửi đồng thời và gửi lại sau khi kết thúc.
3. Mô phỏng lỗi CSDL, thiếu bảng, timeout sau khi ghi, số liệu không đọc được và thiếu cấu hình: không báo thành công giả, không ghi sang local, không biến lỗi thành số 0. Kiểm tra RLS/role bằng client thật và kiểm tra hai phiên đồng thời trên Supabase; PGlite và mock không chứng minh concurrency hoặc triển khai thật.
4. Xác nhận người trực CRM và cách liên hệ/báo giá trước khi mở cho NCC. Không có email tự động. Chỉ sau kiểm thử staging và đối soát gói cũ mới quyết định áp production. Tài liệu này không xác nhận migration đã được áp hay tính năng đã triển khai.

Kiểm thử cục bộ: `npm run check:sponsored-requests` (gồm PGlite và mocks). Browser local chỉ là dữ liệu xem thử, không thay thế staging.

## Triển khai và đối soát

1. Kiểm tra migration gốc `20261028_sponsored_product_push.sql`, quyền duyệt `20261029_sponsored_approver_role.sql` và migration mới `20261042_sponsored_placement_guards.sql` trên đúng project staging. Migration mới chỉ thay trigger/hàm, **không cập nhật gói cũ**.
2. Trước khi áp production, kiểm tra các gói trang chủ, gói đã bán và gói tạm dừng, thời hạn và điều kiện đã thỏa thuận. Dùng dữ liệu thật chỉ đọc; không tự đổi lịch, xoá hay tự gia hạn.
3. Kiểm tra vai trò, RLS, khoá đồng thời, bể và ghi số liệu trên Supabase thật; kiểm thử PGlite/mô phỏng không chứng minh các điều này trên production.
4. Triển khai ứng dụng cùng migration sau khi đã kiểm tra. Nếu chỉ chạy mã ứng dụng mà chưa áp migration, các cổng trên giao diện/server vẫn hoạt động, nhưng chốt ở CSDL, giờ CSDL và bảo vệ đồng thời của migration mới chưa có.

Kiểm thử cục bộ gồm `scripts/check-sponsored-phase01-migration.mjs` (PGlite), `scripts/check-sponsored-phase01-actions.mjs`, `scripts/check-sponsored-store-cas.mjs` và `scripts/check-sponsored-viewability.mjs` (giả lập observer/đồng hồ). Chúng không thay thế kiểm thử trên Supabase thật.

Các thành phần chính: `lib/sponsored/rotation.ts`, `lib/public/sponsored-band.ts`, `components/sponsored-product-band.tsx`, `app/crm/sponsored`, và `app/api/public/sponsored-push`.
