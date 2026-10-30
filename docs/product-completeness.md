# Độ hoàn thiện hồ sơ sản phẩm — Phase 1

Chốt ngày 30/10/2026. Phase 1 **chỉ đọc**: không thêm cột, không ghi dữ liệu, không backfill.
Nhắc **trong cổng nhà cung cấp và CRM**; không gửi email nhắc.

## 1. Đây không phải cổng chặn

Cổng đăng sản phẩm vẫn là hai thứ đang có:

- `productPublicationMediaState()` trong `lib/media/readiness.ts` — phải có ít nhất một ảnh
  đã kiểm tra và chia sẻ cho người mua, không còn tệp chia sẻ nào chưa kiểm.
- Luồng duyệt của Vexim (`decideSupplierProductAction`, `ready_for_buyer`).

Điểm hoàn thiện chỉ để nhà cung cấp biết còn thiếu gì và để nhân viên xếp thứ tự rà soát.
Không nút nào bị khoá theo điểm.

## 2. Thang điểm (`lib/products/completeness.ts`)

Trọng số cộng lại đúng 100, nên điểm đọc như phần trăm.

| Mục | Bắt buộc | Trọng số | Bước | Dựa vào cột |
| --- | --- | --- | --- | --- |
| Ảnh thật | có | 20 | 2 | `media_assets`: `kind=image`, `audience=buyer`, có `storage_path`, chưa hết hạn |
| Danh mục | có | 12 | 1 | `reviewed_category_slug` hoặc `category` |
| Giá tham khảo | có | 10 | 1 | `ref_price > 0` |
| MOQ | có | 10 | 1 | `moq_qty > 0` hoặc `moq` |
| Quy cách | có | 10 | 1 | `spec` |
| Đóng gói | không | 10 | 1 | `packaging` |
| Thời gian giao | không | 8 | 1 | `lead_time_days` (0 vẫn tính) |
| Mô tả | không | 8 | 1 | `description` hoặc `description_i18n.en` |
| Tên tiếng Anh | không | 6 | 1 | `display_name` hoặc `name_i18n.en` |
| Thanh toán | không | 3 | 1 | `payment_terms` |
| Năng lực tháng | không | 2 | 1 | `monthly_capacity` |
| Cảng xuất | không | 1 | 1 | `export_port` |

Quy tắc:

- Ảnh **nội bộ** hoặc **hết hạn** không tính. Catalogue không thay ảnh thật.
- Ảnh chia sẻ cho người mua được tính kể cả khi chưa kiểm (việc kiểm là cổng riêng).
- Mục còn thiếu sắp xếp: bắt buộc trước, rồi trọng số cao.
- Số liệu tính từ **bản đã lưu**; đang sửa dở thì hiện "Lưu thay đổi để cập nhật số liệu."

## 3. Hiển thị ở đâu

| Chỗ | Dạng |
| --- | --- |
| `app/supplier/portal/products/product-editor.tsx` | Khối "Độ hoàn thiện" ở cột phải: thanh tiến độ, 3 mục thiếu đầu tiên, nút "Bổ sung ở bước N" |
| `app/supplier/portal/products/product-storefront.tsx` | Một dòng dưới quy cách: "Hồ sơ 70% · còn thiếu ảnh thật" |
| `app/crm/products/page.tsx` | Chip "Hồ sơ 70%" trong thẻ sản phẩm; rê chuột thấy câu nhắc đầy đủ |

## 4. Kiểm tra

`npm run check:completeness` (nằm trong `check:supplier-products`):

- trọng số = 100, thứ tự mục thiếu, gợi ý đúng bước;
- ảnh nội bộ / hết hạn / catalogue không tính;
- MOQ, lead time 0, tên và mô tả tiếng Anh chấp nhận dữ liệu cũ;
- hồ sơ đủ → 100 điểm, không nhắc;
- module thuần: không email, không CSDL, không `server-only`;
- ba chỗ hiển thị dùng chung một nguồn.

## 5. Phase 2 (cần migration, chưa làm)

Từ khoá tìm kiếm, giá mẫu, đóng gói có cấu trúc, chứng nhận theo từng sản phẩm. Khi làm
Phase 2 thì thêm mục vào `COMPLETENESS_ITEMS` và giữ nguyên nguyên tắc: chỉ đọc, không chặn đăng.
