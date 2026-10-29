# Chuyển form sản phẩm NCC sang bản chốt

Tài liệu `docs/content-guidelines.md` được nhắc trong yêu cầu nhưng không có trong checkout. Giữ font, màu và component hiện có; không giả định thêm nội dung từ tài liệu chưa có.

## Quyết định mới

Dữ liệu hiện tại là demo. Không cần chuyển đổi hoặc duy trì khả năng đọc dữ liệu sản phẩm cũ; các mục về audit và tương thích ở phần dưới mô tả kế hoạch cũ, không còn là yêu cầu cho đợt này. Form NCC sẽ là một trang năm phần và CRM sẽ dùng chung form. Khi hoàn thiện sẽ bỏ các nhánh và cờ thử nghiệm không còn dùng. Các bản giá và tên đã duyệt vẫn cần được bảo vệ khi gửi chỉnh sửa mới chờ duyệt.

Trước bất kỳ thao tác xóa dữ liệu hoặc cột nào trên database của anh phải có bản sao lưu đã xác nhận. Anh là người chạy migration; chưa chạy, xóa hoặc sao lưu database của anh trong nhánh này. Migration phá hủy dữ liệu chỉ được soạn khi đã xác định đầy đủ phụ thuộc và trình tự an toàn.

## Trạng thái

Có hợp đồng dữ liệu và kiểm tra gửi duyệt dùng chung cho form năm phần, cùng server action NCC để lưu và đọc nháp riêng tư. Đây mới là nền tảng, chưa nối vào giao diện và chưa có transaction gửi duyệt hoàn chỉnh. Chưa triển khai lại cho NCC; không chạy SQL62 lúc này.

Form hiện còn chia thành ba bước. Các thay đổi đã thực hiện trong nhánh này mới gồm: bắt buộc có ảnh thật khi gửi duyệt, giới hạn tám ảnh với RPC kiểm tra nguyên tử trên Supabase, chấp nhận dấu phẩy thập phân ở giá kg, định dạng số lượng kg, giới hạn tối đa bốn mức, ẩn cảnh báo giá khi tắt hiện giá, và điều chỉnh bản xem trước khi chưa có bản dịch. Đây chưa phải form năm phần theo mẫu.

Chủ dữ liệu xác nhận đã chạy thành công `supabase/migrations/20261061_supplier_image_limit.sql`. Ở môi trường khác vẫn cần áp dụng migration này trước khi triển khai mã tải ảnh. Nếu thiếu RPC, tải tệp sẽ không thành công thay vì bỏ qua kiểm tra an toàn. Migration không xóa ảnh cũ; sản phẩm đã có từ tám ảnh trở lên không thể thêm ảnh mới cho đến khi giảm số lượng. Đường lưu local chỉ dùng cho phát triển và không có đảm bảo đồng thời giữa nhiều tiến trình.

## Phạm vi và thứ tự thực hiện

Bảng giá chỉ nhận **kg hoặc tấn**; buyer thấy **kg hoặc MT**. Bao và thùng chỉ là nội dung của trường Bao bì / đóng gói, không phải đơn vị giao dịch và không có trường trọng lượng mỗi bao/thùng. Grade tự nhập vẫn được phép nhưng không thuộc bộ lọc grade chuẩn. Không thay đổi hay đoán thông tin sản phẩm cũ; MOQ cũ tính theo bao/thùng chỉ được gợi ý quy đổi khi có số lượng và trọng lượng rõ ràng, các trường hợp khác phải đưa vào báo cáo staging.

1. **Lưu và duyệt:** revision v2 lưu đơn vị kg/MT, số lượng theo gam và giá gốc theo cent để không làm tròn sai. Server từ chối đơn vị bao/thùng và dữ liệu v2 không hợp lệ. Các giá cũ đang được duyệt không bị thay khi có bản chờ. Phần lưu và duyệt được kiểm thử mô phỏng. Bộ đọc form giữ nguyên giá gốc và đơn vị v2; bảng sửa và tạo v2 thử nghiệm chỉ xuất hiện sau ba cờ riêng. Phần tạo tách grade khỏi bảng giá và đặt Incoterm cùng địa điểm phía trên bảng, có xem trước dữ liệu đang nhập. Form vẫn là ba bước, chưa hoàn chỉnh giao diện năm phần hoặc kiểm soát grade tự nhập trong tên tiếng Anh.
2. **Form NCC:** chuyển thành năm phần, cho chọn kg/tấn và grade tự nhập, giữ trường cũ, cho lưu nháp thiếu thông tin; buyer preview cập nhật trực tiếp. Đơn vị đóng gói chỉ là văn bản bao bì. Kiểm tra lại quy tắc tên, ảnh, tier, consent và định dạng số.
3. **Buyer và so sánh:** đọc cùng revision đã duyệt, hiển thị đúng đơn vị gốc kg/MT và dùng giá quy đổi để lọc/so sánh, không làm tròn giá gốc. Bảo toàn giá và tên đã duyệt khi revision mới chờ. Chưa cắt toàn bộ buyer/storefront khỏi dữ liệu cũ.
4. **Staging:** chạy kiểm thử end-to-end, audit dữ liệu cũ chỉ đọc, báo danh sách chưa thể chuyển cho anh trước khi làm migration production. Không bật cho NCC sử dụng trước khi thử xong và được chấp thuận.

`lib/products/quantity-entry.ts` và nền tảng giá v2 đã nối vào server action và CRM sau cờ thử nghiệm; form tạo mới cũng có đường v2 thử nghiệm sau ba cờ, không phải form năm phần hoàn chỉnh. Mô hình v1 chỉ lưu `minKg` nguyên và USD/kg tối đa hai chữ số; 6.401 USD/kg quy đổi từ 6,401 USD/MT không được làm tròn. Trong v2, `unitWeightGrams` là hằng số nội bộ cho 1 kg hoặc 1 MT, không phải trọng lượng bao bì do NCC nhập. Dữ liệu v2 cũ thử nghiệm có đơn vị bao/thùng, nếu có, bị từ chối an toàn và cần rà soát, không tự xóa hay đoán cách chuyển.

RPC hiện có giữ nguyên giá đã duyệt khi gửi hoặc từ chối; chỉ thay thế khi duyệt thành công. PGlite đã kiểm tra v1 và v2 cùng tồn tại, chưa chạy thử trên database của khách hàng. Không cần migration mới cho JSONB này, nhưng các RPC 20261057–20261060 phải có trước khi dùng những luồng tương ứng; việc áp dụng các migration đó chưa được xác nhận.

**Chưa bật `VEXIM_QUANTITY_V2_STAGING` hoặc dùng dữ liệu thật.** Cờ chỉ hoạt động khi `VEXIM_QUANTITY_BUYER_PREVIEW=true`; cả hai đều không bật mặc định. Form mặc định vẫn chỉ đọc v2; tạo và sửa v2 chỉ thử nghiệm sau cờ bổ sung, chưa phải form năm phần. Lưu nháp vẫn yêu cầu bảng giá hoàn chỉnh, AI và CRM kiểm tra tên tiếng Anh với grade tự nhập chưa hoàn chỉnh, buyer/storefront cutover chưa hoàn chỉnh. Không bật cờ lúc này: giao diện năm phần, xem trước trực tiếp và các đường tên/buyer chưa hoàn chỉnh.

**Chưa bật `VEXIM_QUANTITY_FORM_STAGING`.** Đây là cờ bổ sung cho tạo mới và bảng sửa v2 trong form cũ, chỉ hoạt động khi cả hai cờ thử nghiệm nêu trên cũng bật. Cờ không chuyển form sang năm phần và không phải mốc cho phép dùng trên staging thật.

Hợp đồng form nội bộ dự kiến cho v2: `quantity_version=2`, `quantity_unit=kg|mt`, `quantity_custom_grade=yes|no`, `quantity_tiers_json` chứa các chuỗi `quantity` và `price`. Grade và Incoterm dùng cùng tên trường hiện có cho từng action; tạo sản phẩm dùng `quantity_grade` và `quantity_incoterm`. Server không tin định dạng client và tự kiểm tra lại trước khi lưu. Đây không phải API đã sẵn sàng cho production.

Hiện hệ thống vẫn yêu cầu hoàn chỉnh bảng giá khi tạo nháp mới để lưu sản phẩm và giá trong một giao dịch; chưa thể lưu nháp thiếu bảng giá hay tải ảnh trước khi tạo sản phẩm. Migration `20261062_private_product_form_drafts.sql` là nền tảng lưu nháp riêng tư đang phát triển, đã được kiểm tra trên PGlite, nhưng chưa nối với form hoặc quy trình gửi duyệt. Không chạy migration này hoặc bật tính năng cho NCC trước khi hoàn thiện, kiểm thử toàn bộ và thông báo hướng dẫn staging. Giá và tên đã duyệt không bị thay khi lưu vào bảng nháp mới. Transaction gửi duyệt, đối chiếu `base_product_updated_at` và xử lý ảnh đồng thời vẫn cần được hoàn thiện trước khi sử dụng. Giới hạn tám ảnh trên Supabase được thực thi nguyên tử bằng RPC khóa sản phẩm; đường local phát triển không có cùng đảm bảo giữa các tiến trình. Mỗi thay đổi phải giữ giá đã duyệt trong lúc giá mới chờ, không suy đoán dữ liệu cũ.

Giá ưu đãi có thời hạn và email nhắc 30 ngày không thuộc đợt này.

## Rà soát dữ liệu cũ, chỉ đọc

Script `scripts/audit-legacy-quantity.mjs` nhận một file JSON chứa mảng sản phẩm xuất từ **staging**, không kết nối database và không ghi hay sửa dữ liệu:

```sh
node --experimental-strip-types --no-warnings scripts/audit-legacy-quantity.mjs /duong-dan/staging-products.json > /duong-dan/bao-cao.json
```

Cần trường `id`, `specs`, `moq`, `moq_qty`, `moq_unit`, `ref_price`, `ref_price_max`, `unit`, `currency`, `incoterm`; `specs.grade_rows` giữ đầy đủ các dòng cũ. Một sản phẩm nhiều grade cho một dòng báo cáo mỗi grade. Các dòng có `candidate` chỉ là gợi ý kiểm tra, **không phải dữ liệu đã chuyển hoặc lệnh migration**. Dòng không có `candidate` ghi rõ lý do, bao gồm MOQ mơ hồ, container, bao/thùng thiếu trọng lượng, thiếu giá/đơn vị hay thiếu Incoterm. Giá từ được giữ nguyên; những giá USD/kg không biểu diễn chính xác bằng hai chữ số thập phân được đưa vào danh sách cần xử lý thay vì làm tròn.

Báo cáo và bản xuất có thể chứa dữ liệu nội bộ. Lưu chúng ở nơi an toàn, không commit vào Git. Chưa chạy script trên staging, chưa có danh sách thực tế. Việc sao chép ảnh, chứng nhận, liên kết sản phẩm, phê duyệt giá và đối chiếu trước/sau phải được thiết kế và kiểm thử thêm trước khi tạo migration thực thi. Không chạy trên production trước khi chủ dữ liệu duyệt báo cáo staging.
