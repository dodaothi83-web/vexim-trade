# Vùng và xuất xứ nguyên liệu của sản phẩm

## Phạm vi

Hai trường tùy chọn được lưu trên từng dòng `public.supplier_products`:

- `raw_material_region`: vùng nguyên liệu của sản phẩm, tối đa 180 ký tự ở lớp ứng dụng.
- `input_material_origin`: xuất xứ nguyên liệu đầu vào của sản phẩm, tối đa 300 ký tự ở lớp ứng dụng.

Đây là thông tin do nhà cung cấp khai cho riêng sản phẩm, không phải kết quả xác minh độc lập. Hai sản phẩm của cùng một nhà cung cấp có thể có giá trị khác nhau. Các trường không thay thế `suppliers.province`, vốn là tỉnh/thành trong địa chỉ doanh nghiệp.

`Vùng nguyên liệu` dùng ô văn bản với `datalist` gợi ý 34 đơn vị hành chính cấp tỉnh hiện tại. Ô nhập vẫn cho phép ghi vùng cụ thể, nhiều vùng hoặc tên địa phương cũ. `Xuất xứ nguyên liệu đầu vào` là văn bản tự do để ghi nguồn trong nước, nhập khẩu hoặc kết hợp.

## Nơi nhập và hiển thị

- Form tạo/sửa sản phẩm trong CRM và trang chi tiết sản phẩm CRM.
- Bước 1 và bước xem lại trong trình sửa sản phẩm của cổng nhà cung cấp.
- Bản dịch tiếng Anh của sản phẩm trong CRM, nơi nhân viên có thể kiểm tra hoặc sửa bản dịch.
- **Key terms** trên chi tiết sản phẩm và bảng so sánh sản phẩm dành cho buyer.

Hai trường không còn nằm trong đăng ký nhà cung cấp, hồ sơ doanh nghiệp, trang nhà cung cấp hoặc so sánh nhà cung cấp. Không thêm bước duyệt hoặc trạng thái công khai mới.

## Dịch tiếng Anh

Hai giá trị nguồn nằm trong `productTranslationSource`, hash làm mới bản dịch, prompt và bộ kiểm tra phản hồi bắt buộc. Bản tiếng Anh được lưu tại:

- `translation_meta.fields.raw_material_region`
- `translation_meta.fields.input_material_origin`

Lưu và gửi sản phẩm tiếp tục dùng luồng dịch hiện có. Nếu một trường nguồn thay đổi, cache tiếng Anh của riêng sản phẩm đó được đánh dấu cũ và làm mới cùng các trường sản phẩm khác. Nhân viên cũng có thể chốt tay hai giá trị tiếng Anh trong panel dịch.

Chi tiết sản phẩm và so sánh sản phẩm chỉ dùng bản tiếng Anh đã lưu cho hai trường này. Nếu chưa có bản dịch, giá trị để trống hoặc hiện `Not provided`, không đưa nguyên văn tiếng Việt vào trải nghiệm buyer bằng tiếng Anh. Lỗi dịch không thay đổi điều kiện duyệt hoặc quyền công khai hiện có.

## Triển khai database

Chạy toàn bộ file sau trong **Supabase SQL Editor của đúng project**, trước khi deploy code:

`supabase/migrations/20261037_product_raw_material_profile.sql`

Migration chỉ thêm hai cột `text` nullable trên `supplier_products` và reload PostgREST schema cache. Không cần backfill và không chạy lại toàn bộ `supabase/schema.sql` trên production. Schema cài mới đã được đồng bộ.

Kiểm tra sau migration:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'supplier_products'
  and column_name in ('raw_material_region', 'input_material_origin')
order by column_name;
```

Kết quả phải có đủ hai dòng, cả hai đều `text` và `YES`. Test mô phỏng không xác nhận migration hoặc bản dịch OpenAI đã chạy trên production.

## Kiểm thử

```bash
node scripts/check-product-raw-material-profile.mjs
node scripts/check-product-translation.mjs
node scripts/check-supplier-products.mjs
node scripts/check-supplier-product-wizard.mjs
node scripts/check-product-comparison.mjs
node --experimental-strip-types --no-warnings scripts/check-buyer-product-discovery.mjs
npm run typecheck
npm run build
```
