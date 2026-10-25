# Vùng và xuất xứ nguyên liệu của nhà cung cấp

## Phạm vi

Hai trường tùy chọn được lưu trên `public.suppliers`:

- `raw_material_region`: vùng nguyên liệu, tối đa 180 ký tự ở lớp ứng dụng.
- `input_material_origin`: xuất xứ nguyên liệu đầu vào, tối đa 300 ký tự ở lớp ứng dụng.

Đây là thông tin do nhà cung cấp khai, không phải kết quả xác minh độc lập. Hai trường không thay thế `province`, vốn là tỉnh/thành trong địa chỉ đăng ký doanh nghiệp.

`Vùng nguyên liệu` dùng ô văn bản với `datalist` gợi ý 34 đơn vị hành chính cấp tỉnh hiện tại. Ô nhập vẫn cho phép ghi vùng cụ thể, nhiều vùng hoặc tên địa phương cũ. `Xuất xứ nguyên liệu đầu vào` là văn bản tự do để ghi nguồn trong nước, nhập khẩu hoặc kết hợp.

## Nơi nhập và hiển thị

- Form hồ sơ doanh nghiệp khi đăng ký và khi bổ sung hồ sơ theo yêu cầu của Vexim.
- Trang sửa hồ sơ của nhà cung cấp đã được mở cổng và trang hồ sơ riêng của họ.
- Form sửa và trang chi tiết nhà cung cấp trong CRM.
- Trang buyer của nhà cung cấp, mục **Business details**.
- **Key terms** trên chi tiết sản phẩm, so sánh sản phẩm và so sánh nhà cung cấp.

Không thêm bước đăng ký hoặc trạng thái duyệt mới. Các quyền hiện có và điều kiện công khai không thay đổi.

## Dịch tiếng Anh

Hai giá trị nguồn nằm trong `supplierProfileSource`, hash làm mới bản dịch, prompt và bộ kiểm tra phản hồi bắt buộc. Bản tiếng Anh được lưu tại:

- `profile_translation_meta.fields.raw_material_region`
- `profile_translation_meta.fields.input_material_origin`

`SUPPLIER_PROFILE_TRANSLATION_VERSION` là `4`. Lưu hồ sơ qua CRM hoặc cổng nhà cung cấp tiếp tục dùng luồng dịch hiện có. Nếu một trường nguồn thay đổi, cache tiếng Anh được làm mới cùng các trường hồ sơ khác.

Trang nhà cung cấp giữ cách hiển thị hiện có: ưu tiên bản tiếng Anh và có thể lùi về nội dung nguồn khi bản dịch chưa sẵn sàng. Chi tiết sản phẩm và hai trải nghiệm so sánh chỉ dùng bản tiếng Anh đã lưu cho hai trường này. Nếu chưa có bản dịch, giá trị để trống hoặc hiện `Not provided`, không đưa nguyên văn tiếng Việt vào các bảng so sánh tiếng Anh.

## Triển khai database

Chạy toàn bộ file sau trong **Supabase SQL Editor của đúng project**, trước khi deploy code:

`supabase/migrations/20261037_supplier_raw_material_profile.sql`

Migration chỉ thêm hai cột `text` nullable và reload PostgREST schema cache. Không cần backfill và không chạy lại toàn bộ `supabase/schema.sql` trên production. Schema cài mới đã được đồng bộ.

Kiểm tra sau migration:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'suppliers'
  and column_name in ('raw_material_region', 'input_material_origin')
order by column_name;
```

Kết quả phải có đủ hai dòng, cả hai đều `text` và `YES`. Test mô phỏng không xác nhận migration hoặc bản dịch OpenAI đã chạy trên production.

## Kiểm thử

```bash
node scripts/check-supplier-raw-material-profile.mjs
node scripts/check-supplier-self-registration.mjs
node scripts/check-supplier-profile-edit.mjs
node scripts/check-supplier-translation.mjs
node scripts/check-product-comparison.mjs
node scripts/check-buyer-product-discovery.mjs
npm run typecheck
npm run build
```
