# Xếp hạng lưới tự nhiên — GĐ1 (đã dựng)

> Đặc tả đầy đủ + mô phỏng kéo trọng số nằm ở phiên bản `docs/marketplace-ranking-spec.md`
> và `docs/marketplace-ranking-simulator.html` (sandbox kia). Bản ghi này chỉ chốt phần
> đã land vào code và các quyết định còn mở.

## Hiện trạng trước GĐ1

`lib/public/product-catalog.ts` lọc 4 cổng cứng (NCC published · sản phẩm đã duyệt ·
`ready_for_buyer` · ảnh buyer-shareable còn hiệu lực · đúng danh mục) rồi sort:

```
verificationCount DESC → tên A-Z (localeCompare mặc định) → thứ tự vào (sort ổn định)
```

`verificationCount` = số cấp xác minh được duyệt độc lập (`approvedVerificationSteps`),
có L3 thiếu L2 vẫn tính 2/3. Sau đó `arrangeSupplierProducts`
(`lib/public/supplier-product-order.ts`) xen kẽ tối đa 3 thẻ/NCC.
`docs/sponsored-listing-spec.md` mục 5: lưới tự nhiên không bán vị trí, không xếp theo
giờ cập nhật; vùng đẩy tài trợ xoay cửa sổ 10 phút, tách khỏi lưới tự nhiên.

## GĐ1 đã land (commit trên branch arena/7a2251cc)

- `lib/public/ranking.ts` — hàm thuần, **không import, không đọc đồng hồ, không trạng thái**:
  - `rankingTier` (B2): tầng xác minh 3/2/1/0, CỨNG — không cộng dồn điểm qua tầng.
  - `rankingScore` (B3): 5 nhóm tín hiệu × trọng số, tổng mục tiêu 100
    (`SPEC_RANKING_WEIGHTS` = 30/30/15/15/10, **chưa bật**).
  - `compareRankedProducts` / `rankPublicCategoryProducts`: tầng → điểm → tên A-Z →
    giữ thứ tự vào. `fnv1a` xuất sẵn cho B4 nhưng GĐ1 không dùng để giữ lời hứa tái tạo.
  - `ZERO_RANKING_WEIGHTS` mặc định — **output giống hệt sort hiện tại**.
- `lib/public/product-catalog.ts` gọi `rankPublicCategoryProducts` thay sort inline.
- `scripts/check-marketplace-ranking.mjs` — property test 400 hoán vị có hạt giống:
  trọng số 0 tái tạo đúng thứ tự cũ; tầng cứng; điểm chỉ so trong tầng; hàm thuần
  không đổi mảng vào; băm deterministic.
- `scripts/check-buyer-product-discovery.mjs` bơm ranking.ts thật vào mock để đường
  xếp hạng mới chạy trong kiểm tích hợp sẵn.

## Định nghĩa 5 tín hiệu (B3) — toàn bộ boolean/tỷ lệ từ server, không đếm ký tự

| Nhóm | Trọng số mục tiêu | Tín hiệu | Nguồn |
|---|---|---|---|
| Tin cậy còn hiệu lực | 30 | số bước xác minh **còn hiệu lực** / 3 | GĐ2 nối evidence của NCC; chưa có ngữ cảnh thì = 0 |
| Chào hàng còn giá trị | 30 | giá còn công khai (cổng giá đã kiểm opt-in + consent ≤ 180 ngày + `price_valid_until`) | `card.price != null` |
| Độ khớp có cấu trúc | 15 | khớp grade/tỉnh của bộ lọc buyer đang áp; không lọc thì thưởng việc đã khai grade | `card.grade`, `card.province` + ngữ cảnh filter |
| Đầy đủ dữ liệu | 15 | grade · giá · MOQ · thời gian giao · incoterm · có ảnh (6 mục) | trường có cấu trúc của thẻ |
| Dịch vụ | 10 | OEM / ODM / mẫu | `oem`, `odm`, `samples` |

Chống gaming (giữ nguyên hạn của đặc tả): không dùng `updated_at`/độ mới, không CTR,
không đếm ký tự, tiền không chạm lưới tự nhiên (vùng đẩy tách riêng, xoay 10 phút).

"Điểm hồ sơ" kiểu Alibaba được trả lời ở đây: chính là nhóm **Đầy đủ dữ liệu 15/100**,
tính server-side, chỉ là một tín hiệu trong cùng tầng xác minh; NCC thấy lời nhắc
"còn thiếu N mục", không vòng tròn 0-5, không sao, không Premium.

## Ba quyết định còn mở (chưa thay đổi hành vi)

1. **Tầng xác minh cứng?** — Đã cứng sẵn từ hôm nay (verificationCount là bậc đầu);
   GĐ1 giữ nguyên. Bật điểm không làm 2/3 vượt 3/3 (script đã kiểm).
2. **Chứng nhận L1 hết hạn** — chỉ trừ điểm nhóm "tin cậy còn hiệu lực", hay đưa vào
   cổng ẩn sản phẩm? Khuyến nghị: trừ điểm trước (đổi cổng là thay đổi hiển thị lớn,
   cần số liệu回流 từ cron nhắc hết hạn 60/30/7/1 ngày).
3. **Route `/search`** — ô search đang đẩy `/search?q=` nhưng route chưa tồn tại;
   "độ khớp có cấu trúc" vì thế mới chỉ áp được cho bộ lọc danh mục. Làm `/search`
   thật thì tín hiệu khớp mới có ngữ cảnh filter.

## GĐ2 (đề xuất tiếp theo, chưa làm)

- Nối evidence còn hiệu lực của NCC vào bối cảnh xếp hạng (trustAlive).
- Truyền filter grade/tỉnh từ trang danh mục vào `RankingContext` (structuredMatch).
- Bật dần trọng số từ 0, mỗi lần bật chạy lại mô phỏng + check script.
- Cân nhắc bật `fnv1a` cho hoà tuyệt đối khi cần thứ tự không phụ thuộc thứ tự đọc CSDL.
