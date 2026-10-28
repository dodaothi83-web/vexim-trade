# Xếp hạng lưới tự nhiên — GĐ1 + GĐ2 (đã dựng)

> Đặc tả đầy đủ + mô phỏng kéo trọng số nằm ở phiên bản `docs/marketplace-ranking-spec.md`
> và `docs/marketplace-ranking-simulator.html` (sandbox kia). Bản ghi này chỉ chốt phần
> đã land vào code và các quyết định còn mở. Các đoạn GĐ1/GĐ2 dưới đây ghi lịch sử
> của lưới danh mục; xếp hạng tìm kiếm hiện dùng quy tắc riêng trong
> `docs/search-ranking-phase02.md` (độ khớp trước, rồi vòng NCC theo tầng).

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
| Tin cậy còn hiệu lực | 30 | số bước xác minh **còn hiệu lực** / 3 | `card.evidenceValidSteps` — GĐ2 đã nối evidence (xem dưới) |
| Chào hàng còn giá trị | 30 | giá còn công khai (cổng giá đã kiểm opt-in + consent ≤ 180 ngày + `price_valid_until`) | `card.price != null` |
| Độ khớp có cấu trúc | 15 | khớp grade/tỉnh của bộ lọc buyer đang áp; không lọc thì thưởng việc đã khai grade | `card.grade`, `card.province` + ngữ cảnh filter |
| Đầy đủ dữ liệu | 15 | grade · giá · MOQ · thời gian giao · incoterm · có ảnh (6 mục) | trường có cấu trúc của thẻ |
| Dịch vụ | 10 | OEM / ODM / mẫu | `oem`, `odm`, `samples` |

Chống gaming (giữ nguyên hạn của đặc tả): không dùng `updated_at`/độ mới, không CTR,
không đếm ký tự, tiền không chạm lưới tự nhiên (vùng đẩy tách riêng, xoay 10 phút).

"Điểm hồ sơ" kiểu Alibaba được trả lời ở đây: chính là nhóm **Đầy đủ dữ liệu 15/100**,
tính server-side, chỉ là một tín hiệu trong cùng tầng xác minh; NCC thấy lời nhắc
"còn thiếu N mục", không vòng tròn 0-5, không sao, không Premium.

## Ba quyết định đã chốt ở GĐ2

1. **Tầng xác minh cứng trong lưới danh mục?** — GIỮ CỨNG (B2 vẫn là bậc đầu của comparator). Chứng nhận
   hết hạn đến mấy cũng không hạ tầng: NCC 3/3 hết hạn cả 3 bước vẫn đứng trên NCC 2/3
   dữ liệu đẹp (script đã kiểm cả vectơ này). Tìm kiếm có thêm bậc độ khớp và vòng NCC trước comparator.
2. **Chứng nhận L1 hết hạn** — TRỪ ĐIỂM nhóm "tin cậy còn hiệu lực", KHÔNG đưa vào
   cổng ẩn. Lý do: đổi cổng là thay đổi hiển thị lớn, cần số liệu quay lại từ cron nhắc hết
   hạn 60/30/7/1 ngày trước khi tính; trừ điểm là hồi phục được (gia hạn giấy tờ là
   thấy đường ngay), còn giấu listing thì NCC không biết đường nào mà sửa.
3. **Route `/search`** — ĐÃ LÀM (xem dưới).

## GĐ2 đã land

- **Evidence còn hiệu lực** (`evidenceValidVerificationSteps` trong ranking.ts, thuần,
  nhận `today` làm tham số để không đọc đồng hồ):
  - L2/L3 là xác minh theo sự kiện → đã duyệt là còn hiệu lực, không có khái niệm hết hạn.
  - L1 dựa trên chứng nhận giấy tờ: chỉ trừ đúng 1 bước khi NCC đã duyệt L1, CÓ chứng
    nhận đã duyệt (`review_status === "approved"`, không bị `staff_hidden`) mà TẤT CẢ
    đều quá hạn (`valid_until` dạng YYYY-MM-DD < today).
  - Fail-open có chủ đích: NCC legacy không có chứng nhận nào, chứng nhận bị ẩn hết,
    `valid_until` thiếu/sai dạng → không trừ. Lỗi đọc dữ liệu hiện được báo thay vì
    giả làm danh sách rỗng. Cổng hiển thị công khai vẫn là chuyện riêng của `publicSupplierCertificates` (publicly_visible,
    file media, holder); đây chỉ đo độ tin cậy.
  - `publicly_visible` KHÔNG ảnh hưởng evidence — đó là lựa chọn hiển thị, không phải
    độ tin cậy.
- **Nối vào pipeline**: `listPublicCategoryProducts` đọc chứng nhận theo
  NCC đã duyệt L1, tính `evidenceValidSteps` cho từng thẻ. Dữ liệu được chia lô
  theo adapter và cache trong yêu cầu; lỗi đọc được báo, không giả làm chưa có chứng nhận.
- **Bật trọng số đặc tả**: trang danh mục truyền `SPEC_RANKING_WEIGHTS` (30/30/15/15/10)
  vào `rankPublicCategoryProducts`. Tầng vẫn cứng nên bật điểm chỉ đổi thứ tự TRONG
  TẦNG; `ZERO_RANKING_WEIGHTS` vẫn tái tạo đúng sort cũ (property test giữ nguyên).
- **Route `/search`** hiện hỗ trợ tiếng Việt/Anh, phân trang và dùng độ khớp từ khoá
  trước tầng. Quy tắc vòng NCC, các trường công khai, giới hạn và kiểm thử mới nhất
  được ghi tại `docs/search-ranking-phase02.md`; không thay công thức điểm lưới danh mục.
- **Kiểm**: `check-marketplace-ranking.mjs` thêm rule evidence + trustAlive + tầng vẫn
  cứng trước evidence; `check-buyer-product-discovery.mjs` thêm mock `listCertificates`
  + assert hết hạn trừ đúng 1 bước mà listing vẫn hiện đủ.

## Còn mở cho GĐ3 (nếu làm tiếp)

- Truyền filter grade/tỉnh đang chọn từ `CategoryProductGrid` (client) vào ngữ cảnh
  xếp hạng để structuredMatch có filter thật — hiện lọc xảy ra sau xếp hạng ở client.
- Bật `fnv1a` cho hoà tuyệt đối khi cần thứ tự không phụ thuộc thứ tự đọc từ CSDL.
- Theo dõi số liệu thực tế sau khi bật 30/30/15/15/10 để hiệu chỉnh nếu cần.
