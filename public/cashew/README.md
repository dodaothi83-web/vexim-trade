# Ảnh cho trang /cashew

Trang `app/cashew/page.tsx` đọc đúng sáu tên file dưới đây. Ảnh nào **đã có file** thì trang hiển thị ảnh;
ảnh nào **chưa có** thì trang tự vẽ ô placeholder ghi rõ cảnh cần chụp — nên cứ up dần từng tấm, không
làm hỏng trang.

## Quy tắc chọn ảnh (theo brief 12/10/2026)

- Ảnh **THẬT** do nhà sản xuất cung cấp. Không dùng ảnh AI cho sản phẩm, không dùng ảnh stock sai loại.
- Không ảnh bắt tay, không ảnh người mẫu cười trước máy tính.
- WebP, **dưới 200 KB mỗi ảnh**, đúng kích thước khai báo trong `lib/cashew-content.ts`.
- Ảnh dưới màn hình đầu (mọi ảnh trừ `hero`) phải để `loading="lazy"` — component đã tự làm, chỉ cần file nhẹ.
- Xin nhà sản xuất **sự đồng ý bằng văn bản** trước khi đăng ảnh có người thật / tên nhà máy.
- Đổi alt text thì sửa ở `lib/cashew-content.ts`, không sửa trong file này.

## Danh sách cần chụp / xin

| # | File | Dùng ở | Kích thước | Alt text (đã gắn sẵn trong code) |
|---|------|--------|-----------|----------------------------------|
| 1 | `cashew-kernels-w320.webp` | Hero | 1600×1000 | Whole white cashew kernels, grade W320, on a neutral background |
| 2 | `cashew-grades-w180-w450.webp` | Typical specs | 1200×800 | Cashew kernel grades W180, W240, W320 and W450 side by side |
| 3 | `cashew-splits-and-pieces.webp` | Typical specs | 1200×800 | Cashew splits, large pieces and baby bits in separate trays |
| 4 | `cashew-50lb-cartons.webp` | Samples & shipping | 1200×800 | Cashew kernels packed in 50 lb cartons ready for export |
| 5 | `cashew-container-loading.webp` | Samples & shipping | 1200×800 | Cartons of cashew kernels loaded into a 20-foot container |
| 6 | `cashew-sorting-line.webp` | Samples & shipping | 1200×800 | Workers sorting cashew kernels at a processing plant in Vietnam |

## Cảnh cụ thể cần lấy

1. **Hero** — cận cảnh một grade nhân nguyên (W320), nền trung tính, ánh sáng đều, không logo dán chồng.
2. **Grades** — W180 / W240 / W320 / W450 mỗi loại một khay, có thước hoặc đồng xu để so kích cỡ.
3. **Pieces** — trắng vỡ (splits), mảnh lớn, baby bits; chỉ chụp các loại nhà sản xuất thực sự bán.
4. **Cartons** — cận cảnh đóng carton 22.68 kg (50 lb), thấy túi hút chân không hoặc lon bên trong.
5. **Container** — carton xếp trong cont 20’ tại nhà máy.
6. **Sorting line** — dây chuyền phân loại/kiểm tra, công nhân mặc đồ bảo hộ (đã xin phép).

## Chuyển sang WebP

```bash
# sau khi ảnh gốc (JPG/PNG) đã đặt vào thư mục này:
for f in *.jpg; do cwebp -q 78 -mt "$f" -o "${f%.jpg}.webp"; done
# hoặc không có cwebp:
for f in *.jpg; do ffmpeg -y -i "$f" -vf "scale=1600:-1" -quality 80 "${f%.jpg}.webp"; done
# hoặc kéo-thả từng file vào squoosh.app (ảnh ra WebP, bật "moov" để tự xoá file gốc)
```

Kiểm tra dung lượng sau khi convert (mục tiêu < 200 KB):

```bash
du -h public/cashew/*.webp
```

Sau khi up file, chạy `npm run build` rồi mở `/cashew` — placeholder phải biến mất ở đúng khung đã có ảnh.
