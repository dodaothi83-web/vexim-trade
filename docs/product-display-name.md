# Tên hiển thị cho người mua

Tên sản phẩm trên trang người mua là tiêu đề mà trình duyệt, công cụ tìm kiếm và các
hệ thống AI đọc. Nhà cung cấp Việt thường gõ tên theo thói quen sàn thương mại điện tử:
nhồi nhiều grade, nối bằng dấu `/`, thêm tên công ty, thêm vài từ tự khen. Tài liệu này
chốt cách Vexim xử lý.

## Nguyên tắc

1. **Form chỉ có một ô tên, không giới hạn độ dài.** Không có trường "tên người mua đọc"
   riêng và **không có bộ đếm ký tự**: nhà cung cấp viết bao nhiêu cũng được (chỉ còn hạn
   cột dữ liệu 180). Hướng dẫn duy nhất nằm trong placeholder của chính ô nhập: công thức
   `mặt hàng, quy cách, tỉnh` kèm ví dụ (`VD: Hạt điều nhân trắng, W320, Bình Phước`); khi
   đã đủ dữ kiện thì placeholder là chính tên gợi ý. **Không có dòng chữ nào bên dưới ô**,
   không có dòng cảnh báo độ dài, không chặn lưu hay gửi duyệt.
2. **CRM không can thiệp vào tên.** Sản phẩm là của nhà cung cấp. Form CRM không có ô tên
   hiển thị, không có gợi ý, không có nút "dùng tên này"; hàng đợi duyệt không gắn nhãn
   "nên sửa tên". Nhân viên duyệt đúng/sai về danh mục và quy cách, không viết lại câu chữ.
3. **Tên gốc là chứng từ, không bao giờ bị ghi đè.** Lưu sản phẩm giữ nguyên `name`; giá
   trị `display_name` đã có từ trước cũng được giữ nguyên, không bị xoá trắng.
4. **Không rút gọn quá mức, không cắt cụt.** `composeDisplayName` chỉ *bỏ nguyên phần* khi
   vượt trần, không cắt giữa từ. Bộ quy tắc `displayNameWarnings` chỉ **đọc** để soát, không
   sửa nội dung.
5. **Cảnh báo mềm khi cần, không chặn đăng.** Cùng chủ trương với `docs/product-name-grades.md`.

## Công thức gợi ý

```
{Mặt hàng} {Quy cách}, {Tỉnh}[, tối đa hai chỉ tiêu phụ]
```

Ví dụ: `Hạt điều W320, Bình Phước` · `Cashew kernels W320, Binh Phuoc` ·
`Hạt tiêu đen 550 g/l - Grade A, Đắk Lắk`.

Thứ tự: **mặt hàng → quy cách → tỉnh → chỉ tiêu phụ**. Quy cách đứng trước tỉnh vì nó là
thứ quyết định giá, nên phải nằm sát tên hàng; tỉnh là thông tin định vị nguồn hàng. Chỉ tiêu
phụ đứng cuối và bị bỏ trước khi tên chạm trần.

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

- `app/supplier/portal/products/product-editor.tsx` — một ô tên, bộ đếm `x/90`, một dòng
  "Gợi ý: …" ngay dưới. Grade đọc từ bảng giá theo số lượng, không phải từ snapshot form.
- `components/product-form.tsx` — form CRM: không ô tên hiển thị, không gợi ý, không nút
  dùng tên; thẻ xem trước đọc tên đã lưu rồi lùi về tên gốc.
- `app/crm/products/page.tsx` — hàng đợi duyệt: không nhãn soát tên.
- `app/actions.ts` và `app/supplier/portal/product-actions.ts` — không đọc `display_name`
  từ payload; giữ nguyên giá trị đã lưu khi cập nhật.

## Dịch sang tiếng Anh

`lib/ai/translate-content.ts` yêu cầu bản dịch `name` giữ độ dài gần với bản gốc, không
rút gọn thành khẩu hiệu, không thêm mô tả, và không tự sinh ký tự trình bày hay từ tự
khen. Nếu bản gốc đã có từ tự khen thì bản dịch giữ đúng nghĩa những từ đó, không thêm.

## Kiểm tra

`npm run check:display-name` (đã có trong CI) khoá:

- thứ tự soạn tên và việc bỏ nguyên phần thay vì cắt cụt;
- tên tự nhiên Việt/Anh không bị cảnh báo nhầm, tên tự khen bị cảnh báo;
- quy tắc không cắt, không viết lại, không ném lỗi chặn đăng;
- chỉ một ô tên ở form nhà cung cấp (không có `name="display_name"`), có đếm ký tự và gợi ý;
- CRM không có ô tên hiển thị, không gợi ý, không nhãn soát tên, không đọc tên từ payload.
