# Vì sao sản phẩm bị chặn đăng sau khi đã chốt giá

## Cơ chế hiện tại

Mỗi lần nhà cung cấp gửi bảng giá, hệ thống lưu kèm một **bản chụp thông tin sản phẩm**
(`product_quantity_price_revisions.product_context`). Bản chụp do
`quantity_product_review_context()` dựng từ toàn bộ dòng sản phẩm, chỉ bỏ các trường
không phải thông tin thương mại:

- `updated_at`, `supplier_review_status`, `supplier_review_note`, `ready_for_buyer`
- `category`, `supplier_category_proposal`, `reviewed_category_slug` (danh mục được ghi lại
  riêng dưới khoá `review_category`)
- `images`, `featured_media_id`
- các cột bản dịch: `name_i18n`, `description_i18n`, `spec_i18n`, `description_detail_i18n`,
  `packaging_i18n`, `certifications_i18n`, `translation_meta`
- `specs` (được gắn lại, bỏ khoá `price_review_summary`)

Khi bấm Duyệt và đăng, `decide_supplier_product_with_quantity_guard` so bản chụp đó với
sản phẩm hiện tại bằng `quantity_product_review_context_matches`. Lệch một trường là
trả về `price_changed`.

## Những thay đổi thật sự gây chặn

| Thao tác | Có chặn không |
| --- | --- |
| Dịch AI, sửa bản dịch tiếng Anh, đổi `translation_meta` | Không |
| Đổi ảnh, ảnh đại diện | Không |
| Đổi trạng thái duyệt, `ready_for_buyer` | Không |
| Sửa tên, quy cách, mô tả | Có |
| Sửa một thuộc tính trong `specs` (kể cả đổi kiểu số sang chuỗi) | Có |
| Đổi MOQ, tiền tệ, Incoterm, thời gian giao, giá tham chiếu | Có |
| Đổi danh mục đã duyệt | Có |
| Cột mới được backfill giá trị cho sản phẩm cũ | Có |

Vì vậy một lần bấm Lưu trên form sản phẩm (kể cả khi chỉ để lưu bản dịch) có thể
dựng lại `specs` và làm lệch bản chụp. Trước đây thông báo chỉ nói chung chung
"thông tin sản phẩm đã đổi", nên không ai biết lệch ở đâu.

## Đã sửa

1. `quantity_product_price_context_diff(product_id)` trả về đúng danh sách trường lệch
   (thuộc tính được nêu tên, ví dụ `specs.moisture`). Trang duyệt hiện câu
   "Giá đã chốt lệch thông tin hiện tại ở ..." và thông báo khi bấm duyệt cũng nêu tên trường.
2. `staff_set_quantity_price(product_id, actor_id, grade, incoterm, tiers, warnings)` cho
   Vexim chốt giá thay nhà cung cấp: bảng giá cũ bị thay thế, bảng mới gắn với thông tin
   sản phẩm hiện tại, `reviewed_by` là người nhập. Trên trang duyệt có nút
   **Chốt giá thay nhà cung cấp**; nút này vẫn yêu cầu xác nhận "nhà cung cấp đã cam kết
   giá" như đường gửi vào hàng chờ duyệt, và ghi audit `staff.quantity_price_adjusted`
   kèm bảng giá bị thay thế.

Nhà cung cấp vẫn không có đường nào tự chốt giá: bảng giá họ gửi vẫn phải qua duyệt.
