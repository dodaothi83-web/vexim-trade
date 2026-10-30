# Seller Center của Alibaba: UX/UI hiện tại và cách mặc áo đó cho Vexim

Tài liệu nội bộ, 30/10/2026. Phạm vi: **luồng đăng sản phẩm** và **khu làm việc của người bán**
(My Alibaba workbench) — không phải trang sản phẩm dành cho người mua.

Kèm bản xem trước giao diện đề xuất: `docs/product-form-redesign-mockup.html`.

> Giới hạn nguồn: Seller Center nằm sau đăng nhập nên không có ảnh chụp công khai đáng tin.
> Phân tích dưới đây dựng từ (1) tài liệu chính thức của Alibaba (Learning Center, PIS), (2) các bài
> hướng dẫn thao tác thực tế trên backend mô tả đúng thứ tự màn hình và tên trường, (3) cấu trúc
> HTML/JSON mà trang sản phẩm công khai trả ra để đối chiếu ngược. Không có suy đoán nào về màu sắc
> cụ thể của Alibaba; phần "design language" là kết luận từ cách họ tổ chức thông tin và CTA.

## 1. Alibaba Seller Center đang tổ chức thế nào

### 1.1 Ba tầng, một đường đi

| Tầng | Người bán thấy gì |
| --- | --- |
| **Workbench (My Alibaba)** | Trang chủ dạng plugin: số liệu vận hành + các khối Sản phẩm, Đơn hàng, Khách hàng, Tin nhắn/RFQ. Người bán tự thêm/bớt khối. |
| **Product Management** | Danh sách sản phẩm theo trạng thái (đang bán / đã ẩn / chờ duyệt / bị từ chối / nháp), lọc theo nhóm, sửa hàng loạt bằng checkbox, "làm mới" tin đăng để lên hạng. |
| **Publish Product** | Một trang dài, chia khối, có thanh mục lục bên trái và vùng trợ giúp bên phải. Không phải wizard nhiều bước rời. |

Đường vào luôn là `My Alibaba → Business Management → Product Management → Publish Product`.
Người bán quen một cấu trúc cố định: rail trái để đi, thanh trên để biết mình đang ở đâu, nút hành động
dính đáy, panel phải để được nhắc.

### 1.2 Trang đăng sản phẩm — thứ tự thật của các khối

1. **Cổng danh mục**: ô tìm danh mục theo từ khoá, danh mục hay dùng, đọc quy định đăng, tick
   "Tôi đã đọc quy định, đăng sản phẩm". Chọn sai danh mục bị phạt và mất hiển thị — nên đây là
   bước chặn hẳn, không phải một ô select lẫn trong form.
2. **Thông tin cơ bản**: tên sản phẩm (từ khoá chính đặt trước), **3 ô từ khoá** (ô 1 là từ khoá lõi),
   ảnh (1 ảnh chính + 5 ảnh chi tiết, 1000×1000, tỉ lệ 1:1, ≤ 3 MB, JPEG/PNG, RGB), video.
3. **Thuộc tính**: thuộc tính hệ thống theo danh mục + **tối đa 10 thuộc tính tự khai**; giao diện
   khuyến khích điền hết và hiển thị **phần trăm hoàn thiện ở góc trên**.
4. **Thông tin giao dịch**: giá cố định hay thương lượng; giá theo **khoảng** hoặc **bậc thang**
   (nút "thêm bậc giá"); MOQ; năng lực cung cấp; giá FOB; đóng gói (bắt buộc); thanh toán; thời gian
   giao; cảng.
5. **Trang chi tiết**: rich text + ảnh (tối đa 15 ảnh), bảng thông số.
6. **Thông tin khác**: nhóm sản phẩm, hạn tin đăng (180 ngày), xác nhận video → **Gửi duyệt**
   (duyệt 1–3 ngày làm việc, bị trả về thì sửa theo gợi ý).

Điểm đáng học: **không giấu việc kiểm duyệt**. Nút cuối là "Gửi duyệt", không phải "Đăng", và trạng thái
chờ duyệt/bị trả về nằm ngay trên đầu sản phẩm trong danh sách.

### 1.3 Bốn cơ chế giữ người bán đi hết form

- **Điểm chất lượng hiển thị công khai với chính người bán**: PIS 0–5, trên 4 điểm là "Premium Product"
  và được nhiều hiển thị hơn. Đây là động lực mạnh nhất khiến người bán chịu điền thuộc tính.
- **Panel phải luôn có ích**: điểm, việc còn thiếu, mẹo, ví dụ điền.
- **Ví dụ ngay dưới từng ô**: "từ khoá thường dùng, không dùng mã nội bộ", "điền đủ 10 thuộc tính".
- **Nút hành động dính đáy**: Lưu nháp / Xem trước / Gửi duyệt luôn trong tầm tay, kèm trạng thái
  "có thay đổi chưa lưu".

### 1.4 Workbench (khu quản trị)

- Rail trái cố định; nội dung là **bảng + tab trạng thái**, không phải dashboard trang trí.
- Trang chủ là các **khối việc** (sản phẩm, đơn, khách, tin nhắn/RFQ) mà người bán tự sắp.
- Có SLA hiển thị thẳng: trả lời trong 4 giờ thì tỉ lệ hồi đáp tiếp theo cao hơn ~30%. Con số này được
  đặt cạnh danh sách tin nhắn, không nằm trong trang báo cáo riêng.
- Bảng danh sách nào cũng có: tab trạng thái, lọc, checkbox chọn hàng loạt, hành động hàng loạt.

## 2. Đối chiếu với Vexim hiện tại

| Hạng mục | Alibaba | Vexim hôm nay | Kết luận |
| --- | --- | --- | --- |
| Điều hướng form | 1 trang dài + mục lục trái | 3 bước (Thông tin / Ảnh / Xem lại) + thanh bước | **Giữ 3 bước** (đã chốt), thêm mục lục con trong bước 1 và nút "đi tới mục còn thiếu" |
| Cổng danh mục | Chặn trước khi vào form + tick đọc quy định | Select trong form, có cảnh báo ngoài nhóm hàng | Nên tách thành khối đầu tiên của bước 1, to hơn, có mô tả hậu quả chọn sai |
| Ảnh | 6 ô cố định, ô 1 là ảnh chính | Danh sách uploader + nút đặt ảnh chính | **Thiếu rõ nhất**: dựng lưới 6 ô, nhãn "Ảnh chính", kéo đổi thứ tự |
| Giá | Khoảng hoặc bậc thang, nút "thêm bậc" | Đã có bảng bậc giá inline (tối đa 4 bậc) | Giữ, chỉ đổi cách trình bày theo hàng giá |
| Điền đủ | Điểm 0–5 + "Premium", khuyến khích điền hết | Điểm 0–100, chỉ nhắc, không chặn | Đổi **cách trình bày** sang thẻ điểm + 3 việc kế tiếp; **không** thêm nhãn "premium" |
| Panel phải | Điểm + mẹo + ví dụ | Thẻ hoàn thiện + nhắc | Thêm khối "Ví dụ điền" theo danh mục |
| Thanh đáy | Lưu nháp / Xem trước / Gửi duyệt | Đã có, đã dính đáy | Giữ, thống nhất nhãn và thứ tự |
| Trạng thái duyệt | Tab trạng thái trong danh sách + nhãn trên đầu sản phẩm | Đã có `view` (ready/pending/changes/nomedia…) | Đổi sang hệ nhãn trạng thái màu, thêm đếm số ở tab |
| Danh sách sản phẩm | Bảng dày, chọn hàng loạt, thao tác hàng loạt | Lưới thẻ ở cổng NCC, bảng ở CRM | Cổng NCC: thêm chế độ bảng + lọc trạng thái; CRM: giữ bảng, thêm thanh chọn hàng loạt |
| Khung CRM | Rail trái + topbar + nội dung dày | Đã có sidebar + topbar | Chỉ tinh chỉnh mật độ và hệ nhãn, không đổi kiến trúc |

**Kết luận ngắn:** kiến trúc của mình đã đúng hướng (3 bước, panel phải, thanh đáy, trạng thái duyệt).
Cái còn thiếu là **lớp áo**: mật độ thông tin, hệ khối có số thứ tự, lưới ảnh theo ô, hàng giá, nhãn
trạng thái, và một rail trái thật sự ở khu quản trị.

## 3. Đề xuất "lớp áo mới"

### 3.1 Token (dùng lại token sẵn có, không thêm bảng màu mới)

| Vai trò | Giá trị |
| --- | --- |
| Nền làm việc | `#f6f7f9` (ink-50 nghiêng xám) |
| Mặt thẻ | trắng, viền `#e6e8eb`, bán kính 14px, bóng 1 tầng rất nhẹ |
| Chữ | ink-900 (tiêu đề), ink-700 (thân), ink-500 (nhãn/phụ), ink-400 (gợi ý) |
| Hành động chính | brand-700 (giữ nguyên) — **một** màu cho CTA, không dùng cho nhãn |
| Cần xử lý | amber-50/amber-800 |
| Lỗi | rose-50/rose-700 |
| Đã xong | brand-50/brand-700 |
| Cỡ chữ | 11 nhãn nhỏ · 12.5 phụ · 14 thân · 16 tiêu đề khối · 22–26 tiêu đề trang |

Quy tắc: mỗi khối chỉ có **một** việc chính; màu nhấn chỉ dành cho nút và nhãn trạng thái; số liệu luôn
`tabular-nums`.

### 3.2 Khung làm việc (áp cho cả cổng NCC và CRM)

```
┌ rail 232px ┬ mục lục 184px ┬──────────────────────────────┬ rail phải 288px ┐
│ nhóm menu  │ ✓ Ngành hàng  │ tiêu đề · nhãn trạng thái     │ ảnh + giá + MOQ │
│ + số đếm   │ ✓ Tên & từ khoá│ ────────────────────────────  │ vòng % hồ sơ    │
│            │   03 Ảnh & tệp │ khối 01…07 xếp dọc, cùng trang│ việc còn thiếu  │
│            │ ✓ Quy cách     │                               │ ví dụ điền      │
│            │ ✓ Giá & ĐKB    │ khối 08  Xem lại & gửi        │ (dính khi cuộn) │
│            │   06 Đóng gói  │ ────────────────────────────  │                 │
│            │   07 Nội dung  │ [dính đáy] Lưu nháp · Gửi duyệt│                │
└────────────┴────────────────┴──────────────────────────────┴─────────────────┘
```

**Không có bước 2, bước 3.** Alibaba cũng không có: trang *Publish Product* là một trang dài, điều hướng
chỉ là mục lục neo. Wizard ba bước là thứ Vexim tự thêm, và nó gây ba vấn đề: giấu yêu cầu ảnh cho tới khi
nhập xong phần chữ, bắt bấm ba lần cho một sản phẩm, và biến "xem lại" thành một bước chặn thay vì một khối.

### 3.3 Thành phần cần dựng (một lần, dùng cho cả hai nơi)

`AppRail`, `PageHead` (tiêu đề + nhãn trạng thái + CTA), `TocNav` (mục lục neo, có dấu ✓), `FormSection` (số thứ tự + tiêu đề
+ mô tả + các ô), `Field` (nhãn, bắt buộc, gợi ý dưới ô, lỗi tại chỗ), `MediaSlots` (6 ô, ô 1 là ảnh
chính), `PriceLadder`, `CompletenessCard` (vòng điểm + 3 việc kế tiếp), `StatusPill`, `StickyActionBar`,
`DataTable` (tab trạng thái + chọn hàng loạt).

### 3.4 Lộ trình

- **Đợt 1 — Form đăng sản phẩm** (tác động trực tiếp tới nhà cung cấp): khung 3 cột, mục lục neo, tám khối
  có số thứ tự, lưới 6 ô ảnh, thẻ điểm hoàn thiện, thanh đáy thống nhất. Giữ nguyên dữ liệu, cổng duyệt,
  toàn bộ logic đã có.
- **Đợt 2 — Danh sách sản phẩm + khu quản trị**: bảng có tab trạng thái và chọn hàng loạt ở cổng NCC;
  đồng bộ hệ nhãn trạng thái; làm lại trang chủ CRM theo khối việc thay vì danh sách dài.

Mỗi đợt phải: `tsc`, `npm run build`, `check:supplier-products`, và quét toàn bộ script — giữ đúng mức
nền 17 lỗi đã có, không phát sinh lỗi mới.

## 4. Những gì **không** copy

- **PIS/Premium như một lời hứa hạng**: mình chỉ nhắc, không chấm điểm để gắn nhãn "cao cấp" hay
  "được ưu tiên hiển thị".
- **"Làm mới tin đăng"** để đẩy hạng: không có cơ chế đó ở Vexim, và không nên tạo cảm giác gian lận thứ hạng.
- **Chấm điểm gây xấu hổ**: không hiện "hồ sơ của bạn kém", chỉ hiện việc kế tiếp làm được.
- **Nhồi 12px toàn trang**: bảng dày được, nhưng form nhập liệu phải 14px, mobile 16px (đã có luật iOS).
- **Nhãn bảo chứng mình không kiểm chứng được** (Trade Assurance, "Easy Return"…).
- **Màu cam thương hiệu của Alibaba**: mình giữ brand teal + accent amber để không lẫn nhận diện.

## 5. Đã ship: form một trang, tám khối (30/10/2026)

`app/supplier/portal/products/product-editor.tsx` bỏ hẳn wizard ba bước. Lý do và bằng chứng ở §1.2 và §3.2.

| # | Khối | Trường |
| --- | --- | --- |
| 01 | Ngành hàng | danh mục (cổng chặn, kiểm tra phạm vi) |
| 02 | Tên & từ khoá | tên · từ khoá (ngay dưới tên) · mô tả ngắn |
| 03 | Ảnh & tệp | 6 ô ảnh (ô 1 = ảnh chính) · catalogue PDF · tệp nội bộ/người mua |
| 04 | Quy cách & năng lực | quy cách · năng lực/tháng · vùng nguyên liệu · xuất xứ nguyên liệu · thông số danh mục · OEM/ODM/mẫu |
| 05 | Giá & điều kiện bán | bảng giá bậc + MOQ + Incoterm · giá mẫu · công khai giá + cam kết |
| 06 | Đóng gói & giao hàng | bao bì · loại kiện · khối lượng · kích thước · đơn vị/thùng · thời gian giao · cảng xuất · thanh toán |
| 07 | Nội dung chi tiết | mô tả rich text (đặt cuối, như Alibaba) |
| 08 | Xem lại & gửi | 4 nhóm đọc lại + nút Sửa cuộn về đúng khối · danh sách chặn · gửi duyệt |

**Sửa so với bản ba bước** — bốn lỗi nhóm trường:

1. Bảng giá, MOQ, Incoterm từng nằm trong "Thông tin cơ bản", chèn giữa danh mục và mô tả → nay tách ra khối 05.
2. OEM/ODM/gửi mẫu (năng lực) từng nằm trong "Thương mại & xuất khẩu" → nay ở khối 04.
3. "Bao bì" và bốn ô đóng gói có cấu trúc từng bị chẻ đôi và đứng **sau** năng lực/tháng → nay gom một khối 06, đóng gói đứng trước.
4. Ảnh từng là bước 2, từ khoá từng nằm cuối khối thông tin cơ bản → nay ảnh ngay sau tên, từ khoá ngay dưới tên.

**Giữ nguyên:** `supplier_category_proposal`, `name`, `keywords`, `description`, `spec`, `description_detail`,
`raw_material_region`, `input_material_origin`, `monthly_capacity`, `packaging`, `package_*`, `units_per_carton`,
`sample_price_usd`, `lead_time_*`, `export_port`, `incoterm_place`, `payment_terms`, `price_publicly_visible`,
`confirm_supplier_price_consent`, bảng giá theo số lượng; server action, cổng duyệt, `productCanSubmit`,
`productCompleteness`, toàn bộ câu chữ.

**Neo và tiện ích:** mục lục trái có dấu ✓ theo khối đã đủ; nút "Bổ sung: {mục}" trong thẻ hoàn thiện cuộn tới
khối chứa mục đó; nút "Sửa" ở khối 08 cuộn về đúng khối; lưu thiếu trường bắt buộc thì cuộn tới ô đó;
`?step=2` sau khi tạo mới vẫn dùng được — cuộn thẳng tới khối ảnh.

**Kiểm tra:** `check-supplier-product-wizard.mjs` được viết lại để canh cấu trúc một trang (8 khối, mục lục,
neo, 4 nút Sửa, danh sách chặn) thay vì canh panel bước; `check-product-completeness.mjs` và
`check-product-extras.mjs` cập nhật theo khối. `tsc`, `npm run build`, `check:supplier-products`,
`check:typography` xanh; quét toàn bộ script **17 = mức nền**.

### 5.1 Quy tắc bề rộng ô nhập (sửa sau khi soi bản chạy thật)

- **Cùng loại nội dung thì cùng bề rộng.** Khối 06 dùng lưới 6 cột ở `xl`: bao bì chiếm cả hàng (câu dài), còn
  loại kiện / khối lượng / kích thước / số đơn vị / cảng xuất / thời gian giao mỗi ô 2 cột — không còn cảnh ô
  kích thước rộng gấp đôi ô số đơn vị nằm cạnh nhau.
- **Ô chỉ có một giá trị cố định thì hẹp.** Tiền tệ trong bảng giá là ô 136px (chỉ USD), giá mẫu là ô 188px.
- **Bảng bậc giá dùng `table-fixed` + `colgroup`**: Incoterm 96px, nút xoá 44px, ba cột Từ / Đến / Giá chia đều.
- **Tải ảnh không cần lưu nháp trước.** Ảnh của sản phẩm mới đi vào kho ảnh của nhà cung cấp (xem §5.2), nên
  không còn nút "Lưu nháp rồi tải ảnh" và không còn câu nhắc phải lưu trước.

### 5.2 Kho ảnh của nhà cung cấp

- **Một kho ảnh cho mỗi tài khoản**, tối đa 12 ảnh, nằm trong `media_assets` với `owner_type = 'supplier'`,
  `product_id = null`, `audience = 'internal'`. Bảng đã cho phép từ trước nên **không cần migration mới**.
- **Tải trước, gắn sau.** Người bán chọn ảnh trong kho và bấm **Lưu**; lúc tạo sản phẩm, server gắn tối đa 8 ảnh
  đã chọn vào sản phẩm (đổi `owner_type` sang `product`, `product_id` = sản phẩm mới, vẫn `internal`).
  Ảnh không chọn vẫn nằm trong kho cho sản phẩm khác.
- **Ảnh trong kho không bao giờ công khai.** Tệp ở namespace `supplier-media/<supplier_id>/` — không nằm trong
  danh sách đường dẫn của `/public-media`, còn `/api/media/file` chỉ trả cho chính người đã tải lên.
- **Thứ tự thao tác:** kho ảnh → chọn ảnh → điền thông tin → Lưu. Ảnh chưa gắn không chặn việc gửi duyệt;
  điều kiện gửi duyệt vẫn là sản phẩm có ít nhất một ảnh đã gắn.
