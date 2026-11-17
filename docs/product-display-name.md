# Tên hiển thị cho người mua

Tên sản phẩm trên trang người mua là tiêu đề mà trình duyệt, công cụ tìm kiếm và các
hệ thống AI đọc. Nhà cung cấp Việt thường gõ tên theo thói quen sàn thương mại điện tử:
nhồi nhiều grade, nối bằng dấu `/`, thêm tên công ty, thêm vài từ tự khen. Tài liệu này
chốt cách Vexim xử lý.

## Nguyên tắc

1. **Nhà cung cấp được tự đặt tên hiển thị.** Trường `supplier_products.display_name` là
   trường riêng, không bắt buộc. Để trống thì trang người mua đọc tên gốc (`name`).
2. **Tên gốc là chứng từ, không bao giờ bị ghi đè.** Không có backfill, không có việc
   hệ thống tự thay `name` bằng tên đã soạn.
3. **Không rút gọn quá mức, không cắt cụt.** Không hàm nào cắt giữa từ hay viết lại
   nội dung người dùng gõ. Bộ gợi ý `composeDisplayName` chỉ *bỏ nguyên phần* khi vượt
   trần, không cắt lửng câu.
4. **Cảnh báo mềm, không chặn đăng.** Cùng chủ trương với `docs/product-name-grades.md`:
   không từ chối sản phẩm chỉ vì tên dài, nhiều grade hay có từ tự khen. Nhân viên duyệt
   là chốt chặn cuối.

## Công thức gợi ý

```
{Mặt hàng} {Quy cách}, {Tỉnh}[, tối đa hai chỉ tiêu phụ]
```

Ví dụ: `Hạt điều W320, Bình Phước` · `Cashew kernels W320, Binh Phuoc` ·
`Hạt tiêu đen 550 g/l - Grade A, Đắk Lắk`.

Thứ tự ưu tiên khi phải bỏ bớt phần thừa: **mặt hàng → quy cách → tỉnh → chỉ tiêu phụ**.
Tỉnh đứng trước chỉ tiêu phụ vì tỉnh là dữ kiện người mua lọc và tìm theo.

| Trần | Giá trị | Vai trò |
| --- | --- | --- |
| `DISPLAY_NAME_RECOMMENDED_MAX` | 90 | Ngưỡng khuyến nghị, vượt thì cảnh báo `too-long` |
| `DISPLAY_NAME_HARD_MAX` | 120 | Trần cột dữ liệu, cắt ở tầng lưu (migration `20261030_product_display_name.sql`) |

## Bộ quy tắc

Nguồn duy nhất: `lib/public/display-name-rules.ts`. Mọi cảnh báo chỉ **đọc** giá trị,
không sửa giá trị.

| Mã | Khi nào | Ghi chú |
| --- | --- | --- |
| `too-long` | dài hơn 90 ký tự | Không cắt; gợi ý chuyển chi tiết xuống Quy cách |
| `punctuation` | gạch dài `–`/`—`, nháy cong, `…`, khoảng trắng đặc biệt, ký tự vô hình, `● ★`, mũi tên, emoji, `_`, `|`, `{}<>` | Gạch nối thường `-` và `&` vẫn hợp lệ |
| `ai-phrasing` | tự khen và giọng trợ lý AI, cả tiếng Anh lẫn tiếng Việt | Premium, High Quality, Top grade, Best, No.1, world-class, hot selling, 100%, export quality, bulk wholesale, factory direct, free/fast shipping; discover/introducing/experience/unleash/elevate/effortless, your trusted, perfect for, indulge/delight/savor, crafted with, game-chang, must-have; **cao cấp, chất lượng cao, tốt nhất/rẻ nhất, uy tín/hàng đầu/đẳng cấp/số 1, siêu phẩm/siêu hot, giá sỉ/giá gốc, hot/bán chạy, miễn phí giao hàng** |
| `many-grades` | từ ba mã grade khác nhau trở lên | Mã trùng nhau không tính; mỗi grade là một dòng bảng giá |
| `company-name` | tên hàng chứa tên/tên giao dịch của chính nhà cung cấp (từ 6 ký tự) | Tên công ty đã có ở hồ sơ nhà cung cấp |
| `shouting` | viết hoa toàn bộ, chỉ tính khi tên có từ 12 chữ cái | Tránh bắt nhầm mã grade |
| `slashes` | dấu `/` nối danh sách, ví dụ `W320/W240` | Đơn vị tự nhiên như `550 g/l`, `MT/month` được bỏ qua |

Vì sao dùng `\p{L}` thay `\b` trong các mẫu tiếng Việt: `\b` của JavaScript chỉ hiểu chữ
ASCII, nên đứng cạnh `đ`, `ỉ`, `ấ` sẽ không bao giờ khớp và bộ lọc sẽ bỏ sót đúng những
câu cần bắt.

## Nơi hiển thị

- `app/supplier/portal/products/product-editor.tsx` — ô nhập, bộ đếm `x/90`, gợi ý kèm nút
  "Dùng tên này", bản xem trước và danh sách cảnh báo ngay dưới ô.
- `components/product-form.tsx` — form CRM, cùng bộ quy tắc, cùng bản xem trước.
- `app/crm/products/page.tsx` — hàng đợi duyệt gắn nhãn `Nên sửa tên`; câu giải thích nằm
  trong `title`, không chặn thao tác duyệt.

## Dịch sang tiếng Anh

`lib/ai/translate-content.ts` yêu cầu bản dịch `name` giữ độ dài gần với bản gốc, không
rút gọn thành khẩu hiệu, không thêm mô tả, và không tự sinh ký tự trình bày hay từ tự
khen. Nếu bản gốc đã có từ tự khen thì bản dịch giữ đúng nghĩa những từ đó, không thêm.

## Kiểm tra

`npm run check:display-name` (đã có trong CI) khoá:

- thứ tự soạn tên và việc bỏ nguyên phần thay vì cắt cụt;
- tên tự nhiên Việt/Anh không bị cảnh báo nhầm;
- ký tự kiểu AI và câu chữ kiểu AI bị cảnh báo;
- quy tắc không cắt, không viết lại, không ném lỗi chặn đăng;
- form nhà cung cấp, form CRM và hàng đợi duyệt cùng đọc một bộ quy tắc.
