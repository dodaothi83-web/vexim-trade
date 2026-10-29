# Rà soát dữ liệu mẫu cũ so với form sản phẩm mới

**Phạm vi:** Chỉ kiểm tra bản seed trong repo `supabase/seed/staging-preview.sql`, tạo ngày 23/10/2026. Đây không phải kết quả đọc staging hiện tại hay production; không có bằng chứng seed này đang được triển khai nguyên vẹn. Chỉ đọc, không có dữ liệu nào được sửa hoặc chuyển.

## Tóm tắt

- Có 27 sản phẩm mẫu: 8 điều, 8 tiêu, 11 quế/hồi. Cả 27 có trạng thái đã duyệt và sẵn sàng cho buyer trong file seed.
- Không có `specs.grade_rows` nhiều grade trong bộ mẫu, nên chưa có trường hợp tách nhiều grade để thử. Điều này không chứng minh dữ liệu thực tế không có.
- 12 dòng có thể gợi ý quy đổi riêng về MOQ kg và giá từ theo logic kiểm tra hiện tại; **không phải đã đủ điều kiện chuyển**: còn phải kiểm tra danh mục, grade chuẩn/tự nhập, tên, thông tin liên quan và màn buyer mới.
- 15 dòng chưa thể gợi ý: 4 MOQ container và 11 không có `specs.grade` có cấu trúc. Không đoán khối lượng container hay tự đổi `product_type` thành grade.
- 16 tên có chứa giá trị grade có cấu trúc, cần rà soát tách grade khỏi tên trước khi ghép lại trên buyer. Tên tiếng Anh đã duyệt phải được giữ cho đến khi tên thay thế được duyệt.
- 9 sản phẩm có `ref_price_max`: theo yêu cầu mới cần đề xuất một mức dùng `ref_price`, không tự đổi giá công khai trước khi kiểm tra và phê duyệt.

## 15 dòng cần kiểm tra thủ công

| Sản phẩm mẫu | ID | MOQ cũ | Vướng mắc |
|---|---|---|---|
| Cashew kernels W320 | `beb6a0a0-69b0-5051-b0ff-8b9e5bcf6000` | 1 x 20ft (15.9 MT) | Chưa xác định khối lượng kg an toàn từ container |
| Cashew kernels W240 | `cc3767e7-19ea-5693-89b5-b7e9c0cd4426` | 1 x 20ft | Chưa xác định khối lượng kg an toàn từ container |
| Cashew kernels W320, vacuum packed | `604673e1-0846-5048-a7a0-fa9c0af4bdab` | 1 x 20ft | Chưa xác định khối lượng kg an toàn từ container |
| Cassia whole bark, 3 mm split | `da6267c3-e15b-54e3-94a5-5f649c82e571` | 5 MT | Thiếu grade có cấu trúc |
| Cassia split, 4 mm | `fab96629-4034-59a9-a493-4f7e06885df5` | 5 MT | Thiếu grade có cấu trúc |
| Cassia whole bark, 4 mm | `840e6daa-2594-5be9-bfe0-e151f7b78efe` | 5 MT | Thiếu grade có cấu trúc |
| Cassia split, 5 mm | `b7d6be9d-8aef-55bd-be26-a8fad36d48aa` | 5 MT | Thiếu grade có cấu trúc |
| Cassia whole bark, 2.5 mm | `0fdc3b87-28b6-5b7f-bc6f-b6d63c26657a` | 3 MT | Thiếu grade có cấu trúc |
| Cashew kernels W240, steam treated | `8496d97b-4c00-5941-bb4c-132cb3d6d42f` | 1 x 20ft | Chưa xác định khối lượng kg an toàn từ container |
| Cassia whole bark, 3.5 mm | `f7ac2fe9-cdcd-5d4c-b16a-2cb5235f9a65` | 5 MT | Thiếu grade có cấu trúc |
| Cassia split, 4 mm | `cd4fa624-fcba-5fc5-aeb1-84dd8f67c015` | 5 MT | Thiếu grade có cấu trúc |
| Star anise, autumn crop | `85a1dac6-c374-5d8c-af95-10da0ca62525` | 3 MT | Thiếu grade có cấu trúc |
| Star anise, spring crop | `d6bad558-204f-513c-8451-9987b22e8fe7` | 3 MT | Thiếu grade có cấu trúc |
| Star anise, autumn crop | `5cf02e4f-6e12-5992-8995-d9240101a021` | 3 MT | Thiếu grade có cấu trúc |
| Star anise, spring crop | `87f91bed-67a3-59a0-8d07-388d73714f30` | 3 MT | Thiếu grade có cấu trúc |

## 16 tên mẫu có chứa grade có cấu trúc

- Cashew kernels W320 (`beb6a0a0-69b0-5051-b0ff-8b9e5bcf6000`; grade: W320)
- Cashew kernels W240 (`cc3767e7-19ea-5693-89b5-b7e9c0cd4426`; grade: W240)
- Cashew kernels W320, steam treated (`8acc96db-560b-57d3-9cb1-acff680cde84`; grade: W320)
- Cashew kernels W450 (`259f7a0f-2b31-5115-83c1-bcae977cc9be`; grade: W450)
- Cashew kernels W320, vacuum packed (`604673e1-0846-5048-a7a0-fa9c0af4bdab`; grade: W320)
- Cashew white splits WS (`72b22ece-1c9d-5708-af30-be1895e420b6`; grade: WS)
- Black pepper 550 g/L, machine cleaned (`aea049a0-99ce-5783-afa1-ca00661e0d42`; grade: 550 g/L)
- Black pepper 500 g/L, FAQ (`30cacb66-400f-5de0-8b33-749fd05150d9`; grade: 500 g/L)
- White pepper 600 g/L (`bca65316-7181-5374-8fa2-5becc53ddb6b`; grade: White pepper)
- Black pepper 550 g/L, FAQ (`da717eeb-d786-5fd0-af48-4a5b26c6951d`; grade: 550 g/L)
- Black pepper 550 g/L, sun dried (`71dcac73-6e03-5bbe-9581-66e3d81c4082`; grade: 550 g/L)
- Black pepper 570 g/L, ASTA cleaned (`3808bf71-3bb6-55fc-a099-f456752dd825`; grade: 570 g/L)
- Cashew kernels W240, steam treated (`8496d97b-4c00-5941-bb4c-132cb3d6d42f`; grade: W240)
- Cashew kernels W320, plain (`eb0e2e64-95f2-5b2b-b02c-bf7169ad0371`; grade: W320)
- Black pepper 570 g/L, cleaned (`36803b7a-55e3-5ba3-a767-04b9d4ae1213`; grade: 570 g/L)
- Black pepper 550 g/L, FAQ (`490e13cb-f47a-52f6-be80-efaec9c14aa6`; grade: 550 g/L)

## Giới hạn và bước tiếp theo

Báo cáo không kết luận rằng các tên/grade đã đúng chuẩn của danh mục, không xử lý liên kết ảnh, chứng nhận, RFQ hay lịch sử. Script chưa thực hiện tách, chưa tạo revision và chưa ghi cơ sở dữ liệu. Chạy kiểm kê trên bản xuất staging thực tế, đối chiếu danh sách với anh và kiểm thử migration trên staging trước khi quyết định triển khai thật.
