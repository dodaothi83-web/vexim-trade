# Bảng giá theo bậc: tiền tệ và Incoterm từng mức

Cập nhật ngày 30/10/2026, trên form sản phẩm **ba bước** của cổng nhà cung cấp
(`/supplier/portal/products/new` và trang sửa sản phẩm). Bộ form năm phần đã bị xoá
khỏi mã nguồn (xem mục cuối).

## 1. Bậc giá tự tính "đến"

Bảng giá chỉ nhập số lượng **từ** của mỗi bậc. Cột **đến** là ô chỉ đọc, tự tính bằng
`số lượng từ của bậc kế tiếp − 1`; bậc cuối hiển thị "trở lên". Không có trường "đến"
nào được lưu vào cơ sở dữ liệu, nên không thể lệch với bậc kế tiếp.

Ví dụ: bậc 1 từ `10` giá `2`; bậc 2 từ `101` giá `1,5` → buyer thấy `10–100: 2` và
`101 trở lên: 1,5`.

Ràng buộc giữ nguyên: tối đa 4 bậc (`max_tiers` trong `quantity_price_settings`),
số lượng tăng dần, đơn giá không tăng khi số lượng tăng, chênh lệch giá và mức cuối
so với MOQ theo cấu hình danh mục.

## 2. Incoterm theo từng bậc

Mỗi dòng có ô chọn Incoterm riêng (FOB, CIF, CFR, EXW, FCA, DAP, DDP), nằm cùng hàng
với số lượng và đơn giá. Dữ liệu lưu trong JSONB của bản giá:

```json
{ "minKg": 1000, "priceUsdPerKg": 6.4, "incoterm": "FOB", "currency": "USD" }
```

Cột `incoterm` của bảng `product_quantity_price_revisions` vẫn được ghi bằng Incoterm
của bậc đầu tiên để các ràng buộc và báo cáo cũ tiếp tục chạy. Bản ghi cũ không có
`incoterm` trong từng dòng thì dùng Incoterm của bảng (hành vi trước đây).

## 3. Tiền tệ: chỉ USD, VND, EUR

Một ô chọn tiền tệ cho cả bảng, nhãn chỉ ghi đúng mã `USD`, `VND`, `EUR` (không kèm
chữ giải thích). Mặc định là `USD`, nên mọi bản ghi cũ giữ nguyên ý nghĩa.

- Giá lưu theo đơn vị tiền tệ đã chọn; trường `priceUsdPerKg` được giữ tên để tương
  thích dữ liệu, giá trị là **giá trên 1 kg theo đúng tiền tệ của bảng**.
- Ngưỡng tham khảo `category_grade_price_bounds` tính bằng USD/kg nên **chỉ áp cho
  bảng USD**; bảng VND/EUR không bị cảnh báo sai và do nhân viên rà soát.
- Giá không phải USD không tham gia xếp hạng/so sánh giá (`priceRankingEligible`
  và `pricePoint` để trống) để tránh so sánh khác tiền tệ.
- Nhãn buyer luôn kèm mã tiền tệ: `VND 62,000.00/kg`, `EUR 1,500/MT`.

Không cần migration mới: tiền tệ và Incoterm nằm trong JSONB sẵn có của bản giá.

## 4. Bộ form năm phần đã bị xoá

Theo yêu cầu, toàn bộ form năm phần (NCC và CRM) đã bị xoá khỏi mã nguồn: trang
`/crm/products/form-review`, các action duyệt/gửi/ảnh của form, `/api/product-form/*`,
`/form-test`, các thư viện `lib/products/product-form-*`, `approved-product-form-*`,
các component `product-form-*` và các script kiểm thử tương ứng. Cổng NCC luôn dùng
form ba bước. Các bảng `product_form_*` trong Supabase **không bị xoá** (giữ lịch sử
dữ liệu, không có thao tác phá huỷ nào được chạy). Ảnh trong namespace
`product-form-images/` vẫn được phục vụ qua đúng kiểm tra ACL hiện có.

Bản giá v2 (kg/MT, đơn vị gốc) vẫn được giữ cho các bản ghi đã có; form ba bước chỉ
sửa được bảng giá v1 như trước.
