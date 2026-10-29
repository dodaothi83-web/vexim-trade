# Chuyển form sản phẩm NCC sang bản chốt

Tài liệu `docs/content-guidelines.md` được nhắc trong yêu cầu nhưng không có trong checkout. Giữ font, màu và component hiện có; không giả định thêm nội dung từ tài liệu chưa có.

## Trạng thái

Form hiện còn chia thành ba bước. Các thay đổi đã thực hiện trong nhánh này mới gồm: bắt buộc có ảnh thật khi gửi duyệt, giới hạn tám ảnh với RPC kiểm tra nguyên tử trên Supabase, chấp nhận dấu phẩy thập phân ở giá kg, định dạng số lượng kg, giới hạn tối đa bốn mức, ẩn cảnh báo giá khi tắt hiện giá, và điều chỉnh bản xem trước khi chưa có bản dịch. Đây chưa phải form năm phần theo mẫu.

Trước khi triển khai mã tải ảnh lên Supabase cần áp dụng `supabase/migrations/20261061_supplier_image_limit.sql`. Nếu thiếu RPC, tải tệp sẽ không thành công thay vì bỏ qua kiểm tra an toàn. Migration không xóa ảnh cũ; sản phẩm đã có từ tám ảnh trở lên không thể thêm ảnh mới cho đến khi giảm số lượng. Đường lưu local chỉ dùng cho phát triển và không có đảm bảo đồng thời giữa nhiều tiến trình.

`lib/products/quantity-entry.ts` mới là nền tảng kiểm tra và quy đổi chính xác bằng gam và giá gốc theo cent, có kiểm thử với tấn, bao, thùng và grade tự nhập. Nó chưa được nối vào form, server action, cơ sở dữ liệu hoặc buyer. Không bật các lựa chọn tấn, bao, thùng hoặc grade tự nhập trước khi lưu trữ và các đường đọc/duyệt hỗ trợ đầy đủ. Mô hình hiện tại lưu `minKg` nguyên và `priceUsdPerKg` tối đa hai chữ số thập phân; ví dụ 6.401 USD/kg được quy đổi từ 6,401 USD/MT sẽ bị làm tròn nếu chỉ đổi giao diện. Bắt buộc lưu giá gốc, đơn vị gốc, trọng lượng một bao/thùng và giá trị quy đổi với độ chính xác phù hợp trong từng revision; thay đổi RPC tạo, gửi giá và duyệt theo migration mới, không sửa migration đã chạy. Cần cập nhật buyer, lọc, so sánh, CRM và kiểm thử đồng thời. Grade tự nhập cũng cần lưu trạng thái không thuộc danh sách chuẩn và không đưa vào bộ lọc grade chuẩn.

Hiện hệ thống vẫn yêu cầu hoàn chỉnh bảng giá khi tạo nháp mới để lưu sản phẩm và giá trong một giao dịch; chưa thể lưu nháp thiếu bảng giá hay tải ảnh trước khi tạo sản phẩm. Giới hạn tám ảnh trên Supabase được thực thi nguyên tử bằng RPC khóa sản phẩm; đường local phát triển không có cùng đảm bảo giữa các tiến trình. Mỗi thay đổi phải giữ giá đã duyệt trong lúc giá mới chờ, không suy đoán dữ liệu cũ.

Giá ưu đãi có thời hạn và email nhắc 30 ngày không thuộc đợt này.

## Rà soát dữ liệu cũ, chỉ đọc

Script `scripts/audit-legacy-quantity.mjs` nhận một file JSON chứa mảng sản phẩm xuất từ **staging**, không kết nối database và không ghi hay sửa dữ liệu:

```sh
node --experimental-strip-types --no-warnings scripts/audit-legacy-quantity.mjs /duong-dan/staging-products.json > /duong-dan/bao-cao.json
```

Cần trường `id`, `specs`, `moq`, `moq_qty`, `moq_unit`, `ref_price`, `ref_price_max`, `unit`, `currency`, `incoterm`; `specs.grade_rows` giữ đầy đủ các dòng cũ. Một sản phẩm nhiều grade cho một dòng báo cáo mỗi grade. Các dòng có `candidate` chỉ là gợi ý kiểm tra, **không phải dữ liệu đã chuyển hoặc lệnh migration**. Dòng không có `candidate` ghi rõ lý do, bao gồm MOQ mơ hồ, container, bao/thùng thiếu trọng lượng, thiếu giá/đơn vị hay thiếu Incoterm. Giá từ được giữ nguyên; những giá USD/kg không biểu diễn chính xác bằng hai chữ số thập phân được đưa vào danh sách cần xử lý thay vì làm tròn.

Báo cáo và bản xuất có thể chứa dữ liệu nội bộ. Lưu chúng ở nơi an toàn, không commit vào Git. Chưa chạy script trên staging, chưa có danh sách thực tế. Việc sao chép ảnh, chứng nhận, liên kết sản phẩm, phê duyệt giá và đối chiếu trước/sau phải được thiết kế và kiểm thử thêm trước khi tạo migration thực thi. Không chạy trên production trước khi chủ dữ liệu duyệt báo cáo staging.
