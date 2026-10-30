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

### Xem trước khi đang nhập

Khung **"Buyer sẽ thấy"** (cột phải form NCC và trong form CRM) dùng
`previewQuantityTiers` chứ không chờ dữ liệu hợp lệ: mỗi mức đã có đủ số lượng + giá
hiện ngay, kèm dải giá và bảng bậc. Chưa chọn grade chỉ là ghi chú "Chưa chọn grade"
và dòng nhắc hoàn tất, **không** làm mất giá vừa nhập hay biến khung thành
"Price on request". Việc lưu vẫn do `validateQuantityPricing` kiểm tra nghiêm (grade,
thứ tự bậc, chênh lệch giá, cam kết giá) ở client và server.

Nếu bảng giá đang **tắt chia sẻ công khai** thì khung xem trước vẫn nói rõ
"Đang tắt chia sẻ giá nên buyer chỉ thấy Price on request" để không bị hiểu là lỗi.

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

## 3. Tiền tệ: mô hình USD/VND/EUR, nhập mới tạm thời chỉ USD

Mô hình dữ liệu hiểu ba mã `USD`, `VND`, `EUR` cho một bảng giá. Mặc định là `USD`,
nên mọi bản ghi cũ giữ nguyên ý nghĩa.

**Quyết định 30/10/2026: tạm thời chỉ cho nhập USD.** Ô chọn tiền tệ đã được thay
bằng nhãn cố định `USD` kèm ghi chú; form NCC, form CRM và cả hai server action
(`saveSupplierProductAction`, `submitQuantityPriceRevisionAction` của NCC và của
CRM) đều từ chối bảng VND/EUR bằng thông báo *"Tạm thời chỉ nhập giá bằng USD"*.
Lý do: ràng buộc tiền tệ ở tầng DB (migration `20261053`) vẫn chỉ nhận USD.

Một chỗ duy nhất để mở lại: hằng `ENTRY_PRICE_CURRENCIES` trong
`lib/products/quantity-pricing.ts` (hiện `["USD"]`). Thêm `"VND"`/`"EUR"` sau khi
áp migration tiền tệ là UI và cả ba action tự cho phép lại, không phải sửa chỗ khác.

Dữ liệu VND/EUR đã lưu (nếu có) vẫn đọc và hiển thị đúng: `readQuantityEditorData`
giữ nguyên tiền tệ, `formatQuantityPriceBuyer` in `VND 62,000.00/kg`; editor hiện
cảnh báo vàng cho bảng cũ không phải USD và yêu cầu nhập lại bằng USD trước khi gửi
duyệt — không tự quy đổi giá.

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

## 5. Giao diện sửa giá v2 đã bị gỡ (30/10/2026)

Theo yêu cầu, portal NCC không còn đường tạo hay sửa bản giá v2: đã xoá
`components/products/quantity-pricing-v2-{editor,inline}.tsx`, cờ
`quantityV2FormEnabled`/`v2EditingEnabled` và các cờ `VEXIM_QUANTITY_V2_STAGING`
trong trang tạo sản phẩm. Bản giá v2 đã có **vẫn đọc được**: `readQuantityEditorData`
giữ nguyên đơn vị gốc kg/MT và `QuantityPricingInline` hiển thị chúng ở dạng chỉ đọc
(không diễn giải giá MT thành USD/kg). Server action, RPC và bảng `product_form_*`
của v2 không bị xoá.

