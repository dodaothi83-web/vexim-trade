# Dữ liệu mồi cho staging

Bộ dữ liệu này để project staging có nhà cung cấp, sản phẩm và giá, thay vì ba trang
danh mục ra mắt trống trơn. Không dùng cho production.

- 14 nhà cung cấp đã publish, trong đó 3 hồ sơ đã xác minh cấp 3
- 27 sản phẩm đã duyệt, sẵn sàng gửi buyer: hạt điều 8, hồ tiêu 8, quế và hồi 11
- 27 dòng ảnh sản phẩm, 32 bước xác minh đã duyệt
- Không có dòng nào `is_demo = true` và không có dòng nào mang nhãn TEST

Đây là hồ sơ mẫu để duyệt giao diện, không phải công ty đã được Vexim xác minh ngoài
đời. Tên, số liệu và giá lấy từ bộ dữ liệu xem thử của kho local.

## Chạy theo thứ tự

### 1. Tải ba ảnh lên Storage

SQL không tải được tệp. Tạo thư mục `staging` trong thư mục `products` của bucket
`vexim-media`, rồi tải lên đúng ba tên sau:

| Tệp trong repo | Đường dẫn trong bucket |
| --- | --- |
| `public/images/categories/cashew-grade.jpg` | `products/staging/cashew.jpg` |
| `public/images/categories/pepper.jpg` | `products/staging/pepper.jpg` |
| `public/images/categories/cinnamon.jpg` | `products/staging/cinnamon.jpg` |

27 sản phẩm dùng chung ba ảnh này theo danh mục. Đó là ảnh minh hoạ cho giao diện,
không phải ảnh lô hàng của từng nhà cung cấp, nên đừng dùng chúng khi chạy dữ liệu thật.

Trang công khai đọc ảnh qua `/public-media/products/staging/<tệp>.jpg`. Nếu bước này bị
bỏ qua, thẻ sản phẩm sẽ không hiện: cổng sẵn sàng bắt buộc mỗi sản phẩm có ít nhất một
ảnh hoặc catalogue chia sẻ được cho buyer.

### 2. Chạy SQL

Mở SQL Editor của **đúng project staging**, dán toàn bộ
`supabase/seed/staging-preview.sql`, chạy một lần.

Khối kiểm tra ở đầu file dừng lại nếu project đã có nhà cung cấp không do file này tạo,
nên không có nguy cơ trộn dữ liệu mồi vào dữ liệu thật. Câu lệnh cũng dừng nếu ba danh
mục ra mắt chưa được publish, khi đó chạy
`supabase/migrations/20261027_launch_categories.sql` trước.

### 3. Kiểm tra

Câu `select` cuối file in ra số dòng đã ghi. Kỳ vọng:

| Cột | Giá trị |
| --- | --- |
| `published_suppliers` | 14 |
| `ready_products` | 27 |
| `staging_images` | 27 |
| `categories_with_products` | 3 |

Sau đó mở `/products/cashew-kernels`, `/products/pepper`,
`/products/cinnamon-star-anise`: mỗi trang phải hiện thẻ sản phẩm kèm khối giá.

## Chạy lại

Chạy lại được nhiều lần. Mọi dòng có id cố định sinh từ uuid5 của một namespace trong
repo, nên lần thứ hai gặp đúng id đó và bỏ qua (`on conflict (id) do nothing`). Câu
`update` cuối file chỉ đặt lại `fob_updated_at` cho quyền chia sẻ giá, để khối giá không
hết hạn sau 180 ngày kể từ lần chạy đầu.

Muốn dọn sạch, dùng khối lệnh `delete` ở cuối file (đang comment).

## Chưa có trong file này

- **Gói đẩy sản phẩm.** Một gói cần tài khoản admin đang hoạt động để duyệt và có thời
  hạn 168 giờ, nên không hợp để đóng băng trong file seed. Bật dải tài trợ bằng một dòng
  insert riêng khi cần duyệt giao diện đó.
- **Danh mục.** Ba danh mục ra mắt do migration tạo, không do seed tạo.
- **Tệp thật của nhà cung cấp.** Ảnh sản phẩm dùng chung ba ảnh minh hoạ ở trên.
