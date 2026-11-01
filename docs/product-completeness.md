# Độ hoàn thiện hồ sơ sản phẩm — Phase 1 và Phase 2

Chốt ngày 30/10/2026. Phase 1 **chỉ đọc**; Phase 2 thêm cột qua migration, **không backfill**.
Nhắc **trong cổng nhà cung cấp và CRM**; không gửi email nhắc.

## 1. Đây không phải cổng chặn

Cổng đăng sản phẩm vẫn là hai thứ đang có:

- `productPublicationMediaState()` trong `lib/media/readiness.ts` — phải có ít nhất một ảnh
  đã kiểm tra và chia sẻ cho người mua, không còn tệp chia sẻ nào chưa kiểm.
- Luồng duyệt của Vexim (`decideSupplierProductAction`, `ready_for_buyer`).

Điểm hoàn thiện chỉ để nhà cung cấp biết còn thiếu gì và để nhân viên xếp thứ tự rà soát.
Không nút nào bị khoá theo điểm.

## 2. Thang điểm (`lib/products/completeness.ts`)

Trọng số cộng lại đúng 100, nên điểm đọc như phần trăm.

| Mục | Bắt buộc | Trọng số | Bước | Dựa vào cột |
| --- | --- | --- | --- | --- |
| Ảnh thật | có | 16 | 2 | `media_assets`: `kind=image`, `audience=buyer`, có `storage_path`, chưa hết hạn |
| Danh mục | có | 10 | 1 | `reviewed_category_slug` hoặc `category` |
| Giá tham khảo | có | 9 | 1 | `ref_price > 0` |
| MOQ | có | 9 | 1 | `moq_qty > 0` hoặc `moq` |
| Quy cách | có | 9 | 1 | `spec` |
| Đóng gói | không | 9 | 1 | `packaging` |
| Thời gian giao | không | 7 | 1 | `lead_time_days` (0 vẫn tính) |
| Mô tả | không | 7 | 1 | `description` hoặc `description_i18n.en` |
| Tên tiếng Anh | không | 5 | 1 | `display_name` hoặc `name_i18n.en` |
| Từ khoá | không | 5 | 1 | `keywords` (Phase 2) |
| Giá mẫu | không | 5 | 1 | `sample_price_usd` (Phase 2, 0 vẫn tính) |
| Kích thước kiện | không | 5 | 1 | `package_weight_kg` hoặc `package_type` (Phase 2) |
| Thanh toán | không | 2 | 1 | `payment_terms` |
| Năng lực tháng | không | 1 | 1 | `monthly_capacity` |
| Cảng xuất | không | 1 | 1 | `export_port` |

Quy tắc:

- Ảnh **nội bộ** hoặc **hết hạn** không tính. Catalogue không thay ảnh thật.
- Ảnh chia sẻ cho người mua được tính kể cả khi chưa kiểm (việc kiểm là cổng riêng).
- Mục còn thiếu sắp xếp: bắt buộc trước, rồi trọng số cao.
- Cổng sản phẩm tính trên **nội dung đang nhập** (`supplierView`): tên, quy cách, mô tả, giá,
  MOQ, đóng gói… lấy từ form đang gõ, gõ tới đâu điểm đổi tới đó — không bắt lưu trước.
  Giá/MOQ lấy từ bảng giá số lượng đang nhập khi sản phẩm dùng bảng giá đó. Ảnh vừa chọn từ
  kho ảnh đã tính là ảnh chia sẻ cho người mua.
- "Tên tiếng Anh" do Vexim đặt khi duyệt (cổng không có ô này) nên **không** tính vào thang
  điểm của nhà cung cấp; mẫu số còn 95. CRM vẫn tính đủ 100 và vẫn thấy mục này.
- CRM (`app/crm/products/page.tsx`) tính trên **bản đã lưu**, không đọc form.

## 3. Hiển thị ở đâu

| Chỗ | Dạng |
| --- | --- |
| `app/supplier/portal/products/product-editor.tsx` | Khối "Độ hoàn thiện" ở cột phải: vòng điểm, 3 mục thiếu đầu tiên, nút "Bổ sung: …" cuộn tới đúng khối; số liệu theo nội dung đang nhập |
| `app/supplier/portal/products/product-storefront.tsx` | Một dòng dưới quy cách: "Hồ sơ 70% · còn thiếu ảnh thật" |
| `app/crm/products/page.tsx` | Chip "Hồ sơ 70%" trong thẻ sản phẩm; rê chuột thấy câu nhắc đầy đủ |

## 4. Kiểm tra

`npm run check:completeness` (nằm trong `check:supplier-products`):

- trọng số = 100, thứ tự mục thiếu, gợi ý đúng bước;
- ảnh nội bộ / hết hạn / catalogue không tính;
- MOQ, lead time 0, tên và mô tả tiếng Anh chấp nhận dữ liệu cũ;
- hồ sơ đủ → 100 điểm, không nhắc;
- module thuần: không email, không CSDL, không `server-only`;
- ba chỗ hiển thị dùng chung một nguồn;
- `supplierView` bỏ đúng mục nhà cung cấp không tự điền được và quy điểm về thang 95;
- trang sửa đọc nội dung đang nhập (giá, MOQ, ảnh vừa chọn), không đọc bản đã lưu.

## 5. Phase 2 — từ khoá, giá mẫu, đóng gói có cấu trúc

Đã làm (30/10/2026) theo hướng **thêm cột, không backfill**:

| Việc | Ở đâu |
| --- | --- |
| 6 cột mới + ràng buộc + chỉ mục GIN | `supabase/migrations/20261072_product_keywords_sample_price_packaging.sql` |
| Hàm tạo sản phẩm nhận 6 cột Phase 2 (sửa P0001 "Invalid new product payload") | `supabase/migrations/20261077_quantity_new_product_extras_columns.sql` |
| Giữ allow-list của hàm khớp khoá form gửi lên | `scripts/check-quantity-new-product-columns.mjs` |
| Đọc/kiểm tra dữ liệu dùng chung | `lib/products/product-extras.ts` (thuần, có `sanitizeKeywords`, `productExtrasFromForm`, `packagingSummary`) |
| Ghi có dự phòng | `lib/db/supabase.ts`: thiếu cột thì chỉ bỏ cột **đang rỗng** rồi thử lại; nếu người dùng đã nhập giá trị thì báo “Báo người phụ trách kỹ thuật rồi thử lại.” |
| Form 3 bước (bước 1) | ô Từ khoá, Loại kiện, Khối lượng mỗi kiện, Kích thước kiện, Số đơn vị mỗi thùng, Giá mẫu (USD) |
| CRM | khối “Từ khoá và đóng gói” trong trang sửa sản phẩm |
| Kiểm tra | `npm run check:extras` (nằm trong `check:supplier-products`) |

Nguyên tắc giữ nguyên: điểm chỉ để nhắc, **không chặn đăng**; CRM tính trên bản đã lưu, cổng
sản phẩm tính trên nội dung đang nhập; form cũ không có ô mới thì giữ nguyên giá trị đã lưu,
không xoá trắng.

### Chứng nhận theo từng sản phẩm (đã làm, không cần migration)

Dùng lại `certificates.requested_product_ids` (nhà cung cấp xin gắn) và
`certificates.approved_product_ids` (Vexim duyệt gắn), nên **không thêm bảng hay cột**:

| Việc | Ở đâu |
| --- | --- |
| Trạng thái liên kết, gộp theo sản phẩm, chỉ chứng nhận còn hạn | `lib/products/product-certificates.ts` (thuần) |
| Nhà cung cấp xin gắn (chỉ ghi danh sách yêu cầu) | `app/supplier/portal/product-certificate-actions.ts` |
| Khối chọn chứng nhận dưới form sản phẩm | `app/supplier/portal/products/product-certificates-form.tsx` |
| Tải chứng nhận ngay trong khối (không rời trang) | cùng file: `fetch("/api/supplier-portal/certificates")` rồi ghép chứng nhận vừa quét vào danh sách chọn |
| Nhân viên duyệt/bỏ duyệt liên kết | `app/crm/products/[slug]/certificate-actions.ts`, hiện ở thẻ “Chứng nhận của nhà cung cấp” |
| Kiểm tra | `npm run check:certificates` (nằm trong `check:supplier-products`) |

Không mở lại ô tự khai chứng nhận ở trang sản phẩm: hồ sơ Giấy tờ L1 (AI quét đơn vị đứng tên
và ngày hết hạn) vẫn là nguồn duy nhất. Chứng nhận hết hạn không gắn được.

Nhà cung cấp thiếu chứng nhận thì tải ngay trong khối, dùng đúng API của mục Giấy tờ. Tệp đi
bằng `fetch` nên trang không chuyển đi đâu và dữ liệu đang nhập ở các khối phía trên còn nguyên;
quét xong chứng nhận xuất hiện luôn trong danh sách để tích gửi duyệt gắn.

## 6. Đợt A+B (30/10/2026) — Phase 2 ra trang người mua và vào tìm kiếm

Hai việc làm cùng một đợt. Cả hai đều **chỉ đọc** dữ liệu Phase 2: không đổi
điều kiện publish, không đổi giá tham khảo, không cần migration mới.

### A. Trang sản phẩm người mua (tiếng Anh)

| Hiển thị | Ở đâu | Nguồn |
| --- | --- | --- |
| Đóng gói có cấu trúc, ví dụ “25 kg bag · 60x40x40 cm · 20 units/carton” | dòng **Packaging** trong “Key terms” | `package_type`, `package_weight_kg`, `package_size`, `units_per_carton` qua `lib/public/product-extras-display.ts` |
| Giá mẫu, ví dụ “USD 5.00 per sample”; nhập 0 để hiển thị “Nhận mẫu miễn phí” | dòng **Sample price**, chỉ hiện khi có số | `sample_price_usd` |
| Chứng nhận gắn riêng cho sản phẩm | khối **Product certificates**: tên, đơn vị cấp, hạn dùng, đơn vị đứng tên | `certificates.approved_product_ids` |
| JSON-LD | `additionalProperty` (Packaging, Sample price, MOQ…) + `hasCertification` | như trên |

Quy tắc đã giữ:

- **Không** khai `Offer`/`price` trong JSON-LD. Giá trên trang là giá tham khảo qua RFQ,
  không phải chào bán giao dịch trực tiếp; `Offer` không có giá còn tệ hơn không khai.
- Chứng nhận chỉ lộ **tập con** của danh sách đã công khai ở hồ sơ nhà cung cấp
  (`publicSupplierCertificates`), rồi mới lọc theo `approved_product_ids`. Chưa duyệt,
  đã hết hạn, bị nhân viên ẩn hoặc chỉ mới `requested_product_ids` đều không hiện.
- Loại kiện nhà cung cấp gõ bằng tiếng Việt được dịch sang từ tiếng Anh đã biết
  (bao → bag, thùng → carton…). Từ chưa biết thì bỏ phần loại kiện và giữ khối lượng,
  không đẩy nguyên văn tiếng Việt lên trang tiếng Anh.
- Đóng gói có cấu trúc đứng trước mô tả đóng gói cũ (`packaging` / `spec`), chỉ lùi về
  mô tả cũ khi chưa khai cấu trúc.

### C. Hai form sửa cùng một bộ dữ liệu

CRM (`components/product-form.tsx`) và cổng nhà cung cấp (`app/supplier/portal/products/product-editor.tsx`)
sửa **cùng** các cột Phase 2: `keywords`, `sample_price_usd`, `package_type`, `package_weight_kg`,
`package_size`, `units_per_carton`. `createProductAction` / `updateProductAction` đọc chúng bằng đúng
`productExtrasFromForm` mà cổng nhà cung cấp dùng: cùng cách bỏ dấu từ khoá, cùng giới hạn, và ô nào
payload không gửi thì giữ giá trị đã lưu (không xoá trắng).

Trước đây CRM chỉ có ô **Bao bì / đóng gói** (`packaging`, văn bản tự do). Vì trang người mua ưu tiên
khối có cấu trúc, đổi bao bì sang 50kg ở CRM **không đổi gì** trên trang người mua khi sản phẩm đã khai
`package_type`/`package_weight_kg` — đây là lỗi mapping giữa hai form, không phải lỗi lưu. Nay CRM sửa
được đúng các ô đó và ghi chú ngay dưới ô văn bản tự do rằng người mua chỉ thấy dòng đó khi chưa khai
cấu trúc. Kiểm: `node scripts/check-crm-product-extras.mjs` (nằm trong `npm run check:extras`).

### B. Từ khoá thật sự tìm được

| Việc | Ở đâu |
| --- | --- |
| Từ khoá vào kết quả tìm kiếm | `app/(public)/search/page.tsx` truyền `keywords` vào `productSearchRelevance` |
| Xếp hạng | `lib/public/search-ranking.ts`: từ khoá chỉ cộng `coreTokens` |
| Thẻ sản phẩm công khai mang theo từ khoá | `lib/public/product-catalog.ts` (`keywords`, tối đa 3, lọc rỗng) |
| Chip “Related searches” trên trang danh mục | `lib/public/category-searches.ts` + `app/(public)/products/[slug]/page.tsx` |
| Kiểm tra | `npm run check:extras-buyer` (nằm trong `check:supplier-products`) |

Vì sao từ khoá xếp dưới tên sản phẩm: từ khoá là metadata người bán tự chọn. Nếu cho
nó cùng hạng với tên/grade thì một sản phẩm gõ sai từ khoá sẽ chen lên trước sản phẩm
đúng, và mã quy cách (W320…) khai trong ô từ khoá sẽ thành “đúng quy cách”. Vì vậy
từ khoá **không** cộng `productCodes`, **không** cộng `wholeCoreTokens`; nó chỉ giúp
sản phẩm xuất hiện và xếp trên nhóm chỉ khớp tên nhà cung cấp.

Chip gợi ý dựng từ từ khoá đang có trên sản phẩm đã publish trong danh mục, xếp theo số
sản phẩm dùng, tối đa 6, bỏ từ khoá trùng tên danh mục. Không có sản phẩm thì không có chip.
