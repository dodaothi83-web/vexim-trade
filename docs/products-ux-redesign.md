# Thiết kế lại `/crm/products` và `/crm/products/[id]/edit`

> Ngày: 18/10/2026 · Trạng thái: **đã triển khai** theo chuẩn giao diện Danh mục +
> Thêm nhà cung cấp (được duyệt trước đó), không qua vòng mockup riêng.

## Nhận xét nhanh trước khi sửa

- **Danh sách sản phẩm** vốn đã gần chuẩn TMĐT nhất trong CRM (bảng + bộ lọc trên
  URL, khớp RFQ cho buyer). Thiếu: số liệu tổng quan để quét nhanh, lọc theo tình
  trạng xử lý (chờ kiểm tra / thiếu ảnh) phải bấm qua trang khác hoặc nhìn từng dòng.
- **Trang sửa sản phẩm** là form 3 mục đánh số cuộn dài (~25 ô) + khối "Điều kiện
  xuất hiện trên website" 7 dòng chữ ✓/○ chiếm đầu trang, khối media nằm dưới cùng;
  nút Lưu ở thanh dính cuối trang tách rời tiêu đề. Đúng các lỗi đã sửa ở Danh mục:
  không tab, không checklist dạng cột phải, không báo "chưa lưu" nổi bật.

## Đã thay đổi

### Danh sách `/crm/products`
- Thêm 4 thẻ tổng quan: Tổng hồ sơ · Sẵn sàng gửi buyer · NCC tự đăng chờ kiểm tra ·
  Chưa có ảnh/catalogue chia sẻ buyer (tính bằng `productReadiness` như trang sửa).
- Tab xem nhanh theo tình trạng (Tất cả / Sẵn sàng / Chờ Vexim kiểm tra / Cần NCC
  sửa / Thiếu ảnh-catalogue) dạng link giữ nguyên các tham số lọc khác; tham số cũ
  `?review=pending` vẫn hoạt động.
- Mỗi dòng thêm nút **Xem** (chi tiết) cạnh **Sửa**, nhãn trạng thái phân biệt rõ
  "Chưa bật sẵn sàng" vs "Thiếu ảnh/catalogue"; thêm dòng "Hiển thị X / Y".
- Giữ nguyên: tìm kiếm, lọc nhóm ngành/chứng nhận/NCC đã xác minh, chế độ so khớp
  RFQ cho buyer (tham số `?buyer=`), sắp xếp theo độ khớp.

### Sửa sản phẩm `/crm/products/[id]/edit`
- `ProductForm` chia 3 tab (Thông tin & mô tả · Quy cách & năng lực · Giá &
  thương mại) có chấm trạng thái từng tab; **một thanh hành động dính trên cùng**
  chứa Quay lại · tên sản phẩm · "● Chưa lưu" · Hoàn tác · Lưu. Tháo thanh dính
  cuối trang cũ.
- Khối "Điều kiện xuất hiện trên website" chuyển thành **checklist cột phải cố
  định** (✓ xanh / ○ hổ phách) kèm thẻ Chứng nhận NCC; nội dung và điều kiện
  hiển thị trang công khai giữ nguyên từng mục.
- Lỗi thiếu tên sản phẩm hiện tại ô + tự nhảy về tab Thông tin.
- **Bảng giá nằm ở tab Giá & thương mại**, không phải tab Quy cách: với sản phẩm đã
  lưu là khối "Giá theo số lượng" (`QuantityPricingInline`), với sản phẩm mới là bảng
  Grade & giá. Lỗi giá (ví dụ khoảng giá ngược) cũng nhảy về tab này. Tab Quy cách chỉ
  còn thông số, thuộc tính danh mục, vùng nguyên liệu đầu vào, năng lực và đóng gói.
- Form dùng chung với trang thêm sản phẩm trong hồ sơ NCC vẫn hoạt động (thanh
  hành động tự đổi nhãn "Thêm sản phẩm", quay lại hồ sơ NCC).

## Bất biến nghiệp vụ được giữ (có script chốt)
Lưu không tự công khai/duyệt sản phẩm; giá buyer chỉ theo bản đã lưu
(`savedPrice` truyền nguyên trạng thái server, `Giá buyer · bản đã lưu`,
`savedPrice.blockers`); checkbox giá riêng từng sản phẩm
(`checked={form.price_publicly_visible === true}`); đồng ý giá của NCC tách riêng
(`supplierPriceConsentCurrent`); chứng nhận tự khai không thành nhãn buyer;
`set("odm", …)`; điều kiện `commercialSupplier` cho hồ sơ thử nghiệm.

## Kiểm chứng
`npm run typecheck` · `npm run build` · các script `check-editor-workflow`,
`check-public-product-catalog`, `check-certificate-workflow`,
`check-supplier-products`, `check-product-attributes`, `check-navigation-priority`,
`check-product-media-gallery` đều đạt; tải thật trang danh sách và trang sửa
(đã đăng nhập, chế độ demo) trả 200 với bố cục mới.
