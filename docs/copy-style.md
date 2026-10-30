# Văn phong giao diện Vexim (VI)

Chốt ngày 30/10/2026. Áp cho **microcopy hệ thống**: nhãn trường, gợi ý, lỗi, xác nhận,
trạng thái, thông báo trong portal nhà cung cấp và CRM.

Không áp cho: văn bản pháp lý (`app/(legal)/**`), nội dung sản phẩm buyer-facing
(mô tả sản phẩm được phép tiếp thị), và bản tiếng Anh của trang công khai.

## 1. Ba quyết định gốc

| Hạng mục | Quy tắc |
| --- | --- |
| Người mua | Viết **“người mua”** trong mọi UI tiếng Việt, kể cả CRM. Không dùng “buyer”. |
| Nhà cung cấp | Portal gọi người dùng là **“bạn”**; khi nói về bên thứ ba dùng **“nhà cung cấp”**. Không viết tắt “NCC”. |
| Thuật ngữ ngành | Giữ tiếng Anh: **grade, MOQ, Incoterm, FOB, CIF, EXW, USD/kg**. Lần đầu xuất hiện có thể kèm giải thích ngắn. |

## 2. Giọng điệu

- Viết như hướng dẫn việc cần làm, không quảng cáo: ngắn, rõ, có lý do.
- Ngôi thứ hai (“bạn”) trong portal; CRM dùng câu mệnh lệnh, không đại từ.
- Vexim tự xưng **“Vexim”**, không “chúng tôi”, không “quản trị viên” khi nói về chính mình.
- Không hứa hẹn tuyệt đối: không “tốt nhất”, “số 1”, “cam kết 100%”.
- Không lộ chi tiết nội bộ: **v2, staging, gate, mô hình mới, migration, feature flag**.

## 3. Độ dài

| Thành phần | Giới hạn |
| --- | --- |
| Nhãn trường | 1–3 từ |
| Gợi ý dưới trường | ≤ 90 ký tự, tối đa 2 dòng |
| Thông báo lỗi | 1 câu ≤ 100 ký tự, nêu cách sửa |
| Thông báo thành công | 1 câu, nêu bước tiếp theo |
| Nút | 1–3 từ, bắt đầu bằng động từ |

## 4. Nhãn và nút

- Nhãn là danh từ ngắn: “Tên sản phẩm”, “Giá theo bậc”, “Thời gian giao”.
- Không nhét hướng dẫn vào nhãn; hướng dẫn nằm ở dòng gợi ý.
- Nút: “Lưu nháp”, “Gửi duyệt”, “Thêm bậc giá”, “Xoá ảnh”. Không “OK”, “Submit”, “Thực hiện”.

## 5. Lỗi, cảnh báo, thành công

- **Lỗi**: cái gì sai + sửa thế nào. Ví dụ: “Bậc 2 phải bắt đầu sau 1.000 kg.”
- **Cảnh báo**: nêu hậu quả, không doạ. Ví dụ: “Bảng giá chưa gửi. Rời trang sẽ mất nội dung.”
- **Thành công**: nêu bước tiếp + thời hạn. Ví dụ: “Đã gửi duyệt. Vexim phản hồi trong 24 giờ.”
- **Câu cam kết**: viết ngôi thứ nhất vì người dùng đang tự khai.
  Ví dụ: “Tôi xác nhận giá trên là giá tôi sẵn sàng bán.”

## 6. Số, đơn vị, tiền tệ

- Luôn kèm đơn vị: “1.000 kg”, “8 MB”, “24 giờ”, “25 kg/bao”.
- Tiền: `USD 6,40/kg` (dấu phẩy thập phân, mã tiền tệ đứng trước) khi hiển thị cho người mua.
- Không dùng emoji trong câu; icon đứng riêng, có `aria-label`.

## 7. Những cặp câu đã sửa

| Trước | Sau |
| --- | --- |
| Không ghi grade trong tên sản phẩm. Tên tiếng Anh sẽ được dịch sau khi bạn gửi duyệt và được kiểm tra bởi quản trị viên. | Không ghi grade trong tên. Vexim dịch tên sang tiếng Anh khi duyệt. |
| Đây là bản xem trước theo dữ liệu đang nhập, không phải giá đang hiển thị cho buyer. Giá hiện tại chỉ thay đổi khi mô hình mới được triển khai và bản giá được duyệt. | Bản xem trước từ dữ liệu bạn đang nhập. Giá thật chỉ đổi sau khi Vexim duyệt. |
| Giá đang hiển thị cho buyer vẫn dùng bảng cũ; phần hiển thị buyer theo mô hình mới chưa được triển khai công khai. | Người mua vẫn thấy bảng giá đã duyệt. Bảng mới chỉ hiển thị sau khi Vexim duyệt. |
| Chọn một grade chuẩn của danh mục. | Chọn grade chuẩn của danh mục để tiếp tục. |
| Giá mới đang chờ Vexim xác nhận. | Đã gửi giá mới. Vexim phản hồi trong 24 giờ. |
| Chia sẻ buyer | Chia sẻ cho người mua |
| Tôi xác nhận đã nhận cam kết của NCC rằng đây là giá NCC sẵn sàng báo cho buyer… | Tôi xác nhận nhà cung cấp đã cam kết đây là giá sẵn sàng báo cho người mua… |

## 8. Cách giữ chuẩn

- `scripts/check-ui-copy.mjs` chặn hồi quy trên các file đã chuyển đổi: câu quá dài,
  còn “buyer”/“NCC” trong chuỗi tiếng Việt, lộ từ nội bộ.
- Phạm vi đã chuyển đổi (đợt 1): form 3 bước của portal, bảng giá theo bậc, khung xem
  trước, trang danh sách sản phẩm NCC, hàng chờ duyệt giá của CRM, thông điệp trong
  `lib/media`, `lib/products/quantity-pricing`.
- Đợt sau: trang sửa sản phẩm CRM, nhập Excel, hồ sơ NCC, RFQ, traffic, storefront.
  Khi sửa file nào thì chuyển file đó và thêm vào danh sách của script.

## 9. Ngoại lệ có chủ đích

- “Buyer” trong URL, tên trường dữ liệu (`ready_for_buyer`, `audience: "buyer"`),
  tên component và nội dung tiếng Anh của trang công khai: giữ nguyên.
- Câu cam kết pháp lý trong quy chế hoạt động: giữ nguyên văn bản đã công bố.
