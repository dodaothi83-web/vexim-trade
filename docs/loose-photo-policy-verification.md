# Cổng xác thực L2/L3: nới ảnh, siết đúng một chỗ

Cập nhật 21/10/2026. Áp dụng cho `/supplier/portal/verification`.

## Vì sao đổi

Nhà cung cấp Việt Nam chụp bằng điện thoại rồi gửi qua Zalo. Bắt họ giữ nguyên tệp
gốc, bật định vị, chụp đúng khung giờ 06:00–18:00 khiến cổng xác thực khó dùng, hồ sơ
nộp rất ít. Nền tảng không có dữ liệu thì cũng không phát triển được.

Nay nguyên tắc là: **ảnh nào cũng nhận, chỉ một thứ bắt buộc là tờ mã xác minh.**

## Đã gỡ

| Trước | Sau |
|---|---|
| Bắt buộc ảnh gốc, còn EXIF | Không cần. Ảnh qua Zalo/Facebook vẫn nhận |
| Bắt buộc GPS trong ảnh | Không cần. Có thì ghi chú, không có cũng bình thường |
| Chụp ban ngày 06:00–18:00 | Chỉ là ghi chú |
| Bấm nút là mở thẳng camera | Chọn được ảnh từ thư viện |
| Cờ `hard` cho thiếu EXIF/GPS/giờ chụp | Tất cả chuyển `warning` |

Các tín hiệu kỹ thuật vẫn được đọc và hiện cho nhân viên duyệt, nhưng xếp vào mục ghi
chú, không chặn hồ sơ. Chúng nằm trong `lib/media/image-integrity.ts`; muốn siết lại
sau này chỉ cần đổi các `"warning"` về `"hard"`.

## Giữ bắt buộc (và làm chặt hơn)

1. Ba ảnh 🔖 (cổng nhà máy, dây chuyền đang chạy, kho thành phẩm) phải có **tờ mã xác
   minh** do hệ thống phát hành nằm trong khung hình.
2. Không phát hành mã thì không tải được ảnh 🔖 (đã chặn ở cả giao diện và server).
3. AI đọc ảnh: không thấy tờ mã (`code_missing`) hoặc mã không khớp mã đã phát hành
   (`code_mismatch`) là cờ `hard`, hồ sơ **chưa nộp được**. Đây là cờ `hard` duy nhất
   còn lại. Trước đây chỉ nằm trong danh sách cảnh báo, nay được đưa vào điều kiện nộp
   ở `readiness()`.

## Nút "Tải tờ mã về" (mới)

Trước chỉ có "In tờ mã". Nay có thêm nút tải **PNG A4** vẽ bằng canvas ở trình duyệt,
gồm: mã xác minh cỡ lớn, 4 bước sử dụng, ô ghi ngày chụp, người chụp, chức vụ, và dòng
nhắc rằng ảnh điện thoại là đủ.

Lý do vẽ ở trình duyệt: không phụ thuộc font của máy chủ, chạy được cả trên Vercel, và
nhà cung cấp lưu được tờ mã để in lại khi mất mạng. Nếu trình duyệt chặn tải, vẫn còn
nút in và hướng dẫn chép tay mã.

## Những chỗ đã sửa

- `lib/verification-submission.ts`: hằng `ORIGINAL_PHOTO_REQUIRED = false`, luật chặn
  mới cho `code_missing` / `code_mismatch`.
- `lib/media/image-integrity.ts`: hạ toàn bộ cờ kỹ thuật về `warning`, viết lại lời
  nhắc bằng giọng bình thường.
- `lib/types.ts`: nhãn cờ không còn hù dọa ("vẫn nhận", "không bắt buộc").
- `lib/supplier-portal/submission-evidence.ts`: thông báo lỗi định dạng tệp dễ hiểu
  hơn; ghi chú rõ ảnh qua Zalo vẫn nhận.
- `lib/ai/evidence-review.ts`: prompt AI không còn coi ảnh thiếu EXIF/GPS/chụp tối là
  lỗi; chỉ tờ mã mới là điều kiện.
- `app/supplier/portal/verification/*`: bỏ `capture` (cho chọn ảnh từ thư viện), thêm
  nút tải tờ mã, đổi "Bước 2 · Định vị camera" thành "Vị trí (không bắt buộc)", viết
  lại 3 bước hướng dẫn.
- `app/crm/verifications/*`: nhân viên đọc đúng luật mới khi đối chiếu.
- `scripts/check-supplier-self-verification.mjs`: cập nhật kỳ vọng `warning`, thêm test
  cho luật chặn tờ mã và cho nút tải tờ mã.

## Lưu ý khi triển khai

- Không cần migration DB.
- Nếu chưa cấu hình `OPENAI_API_KEY`, hệ thống không đọc được mã trong ảnh; khi đó nhân
  viên Vexim phải đối chiếu tờ mã bằng mắt. Điều kiện "phải phát hành mã trước khi tải
  ảnh 🔖" vẫn giữ nguyên.
