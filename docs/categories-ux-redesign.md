# Phân tích UX & đề xuất thiết kế lại `/crm/categories` (Danh mục sản phẩm)

> Ngày: 18/10/2026 · Phạm vi: chỉ **phân tích + đề xuất** (chưa sửa code production).
> Cách khảo sát: trang thật `https://www.veximtrade.com/crm/categories` yêu cầu đăng nhập
> (tự chuyển về `/login`), nên bản phân tích này đối chiếu trực tiếp từ mã nguồn đang chạy
> production: `app/crm/categories/categories-manager.tsx` (531 dòng), `page.tsx`,
> `publication-queue.tsx`, `app/crm/layout.tsx`, `components/sidebar.tsx`,
> đối chiếu thêm trang public `app/(public)/products/[slug]/page.tsx` (nơi dữ liệu hiển thị)
> và 2 trang CRM “chuẩn TMĐT” hơn trong cùng hệ thống là `/crm/products`, `/crm/suppliers`.
>
> **Bản mockup trực quan đi kèm:** [`categories-redesign-mockup.html`](./categories-redesign-mockup.html)
> — mở bằng trình duyệt, bấm qua lại giữa *Danh sách* ↔ *Màn hình sửa* để cảm nhận bố cục đề xuất.

---

## 1. Kết luận ngắn gọn (đọc phần này là đủ để ra quyết định)

Trang hiện tại **không xấu về màu sắc hay chữ**, mà khó dùng vì **sai mô hình tổ chức**:

> Nó gộp **3 công việc khác nhau** vào **1 form cuộn dài duy nhất**, và bắt người dùng
> tự nhớ “thứ mình cần đang nằm ở đâu trong đống đó”.

| # | Việc đang bị gộp | Người làm thường xuyên? | Bản chất |
|---|---|---|---|
| A | Quản lý **cây danh mục** (thêm/bớt/sắp xếp/phân cấp) | Thỉnh thoảng | Kiểu “quản lý gian hàng” trên Shopee/Lazada/Shopify |
| B | Viết **nội dung landing page** cho buyer (giới thiệu, ảnh bìa, bảng thông số, FAQ, SEO) | Khi ra mắt/sửa ngành hàng | Kiểu trình soạn trang (CMS) |
| C | Cấu hình **trường dữ liệu sản phẩm** (`product_fields`: mã trường, kiểu nhập, điều kiện hiện) | Rất hiếm, tính kỹ thuật cao | Kiểu cấu hình hệ thống (PIM/schema) |

Người quen TMĐT (Shopee Seller Centre, Lazada, Tiki, Shopify, WooCommerce…) có sẵn một
“kỳ vọng” trong đầu: **vào là thấy bảng danh sách → quét trạng thái bằng mắt → bấm Sửa →
form ngắn, rõ mục → Lưu**. Trang này phá vỡ kỳ vọng đó ở cả 3 bước:

1. Vào trang **không thấy toàn cảnh** (không số lượng sản phẩm/NCC, không biết danh mục nào
   thiếu ảnh/thiếu nội dung, danh mục cha–con bị xé phẳng).
2. Bấm vào một danh mục là **rơi ngay vào form ~15 ô luôn hiện + hàng chục ô ẩn** trong
   2 tầng mục gập (accordion lồng accordion), không có mục lục, không biết đã đủ chưa.
3. **Lưu** ở thanh dính cuối trang, **Công khai** lại nằm ở một thẻ *bên dưới* thanh đó,
   **Xoá** thì giấu trong mục “Hiển thị & tìm kiếm” — 3 hành động quan trọng nhất nằm ở
   3 nơi khác nhau, mức độ nguy hiểm không tương xứng với vị trí.

**Đề xuất tóm tắt:** tách lại thành đúng mô hình TMĐT quen thuộc —

- **Màn 1 – Danh sách (mặc định):** bảng dạng cây, có lọc theo trạng thái, cột
  *Sản phẩm/NCC · Độ hoàn thiện · Cập nhật*, kéo–thả sắp xếp, thao tác nhanh.
- **Màn 2 – Sửa theo thẻ (tab):** thanh hành động dính **trên cùng** gộp
  *Quay lại · Xem trang · Lưu nháp · Công khai*, cột phải cố định gồm
  **Checklist trước khi công khai** + **Xem trước trực tiếp** (ảnh bìa/thẻ trang chủ/Google).
- Giữ nguyên các nguyên tắc nghiệp vụ tốt hiện có (lưu ≠ công khai, người soạn không tự
  công khai, đổi slug tự giữ chuyển hướng 301, chặn xoá khi đã có sản phẩm/RFQ).

Chi tiết, mức độ ưu tiên và lộ trình 3 giai đoạn ở mục 5–8. Nếu chỉ làm **Giai đoạn 0**
(không đổi database, không đổi server action), đã xử lý được khoảng 70% cảm giác “khó dùng”.

---

## 2. Bố cục hiện tại (chụp lại bằng sơ đồ từ code)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Menu trái CRM 240px (cố định)        │ Nội dung: layout đã có px-4, pt-16/8   │
│ VEXIM TRADE                          │ ┌────────────────────────────────────┐ │
│  VẬN HÀNH SÀN                        │ │ Manager lại bọc thêm max-w-7xl,    │ │
│   … Danh mục sản phẩm …              │ │ px-4, py-6  ← lồng khung 2 lần     │ │
│                                      │ │                                    │ │
│                                      │ │ Tổng quan / Danh mục               │ │
│                                      │ │ Danh mục sản phẩm        [+ Thêm]  │ │
│                                      │ │ ┌─────────┬──────────────────────┐ │ │
│                                      │ │ │ Tìm…    │  (trống: “Chọn danh   │ │ │
│                                      │ │ │ 20 mục  │   mục để bắt đầu”)   │ │ │
│                                      │ │ │ ─────── │  hoặc FORM SỬA:      │ │ │
│                                      │ │ │ ▸ ảnh   │  ① Thông tin cơ bản  │ │ │
│                                      │ │ │  Tên    │  ② Nội dung trang    │ │ │
│                                      │ │ │  Nháp·/…│  ③ ▸ Bảng TS/FAQ…    │ │ │
│                                      │ │ │ ▸ ảnh   │     ▸ Bảng thông số  │ │ │
│                                      │ │ │  Tên    │     ▸ TT mua hàng    │ │ │
│                                      │ │ │  …(cuộn │     ▸ Câu hỏi        │ │ │
│                                      │ │ │  65vh)  │  ④ ▸ Trường SP       │ │ │
│                                      │ │ │         │  ⑤ ▸ Hiển thị & SEO  │ │ │
│                                      │ │ │         │     └ Xoá (giấu ở đây)│ │ │
│                                      │ │ │         │  [Đóng] [Lưu thay đổi]│ │ │ ← thanh dính
│                                      │ │ │         │  ⑥ Trạng thái công   │ │ │ ← nằm DƯỚI thanh lưu
│                                      │ │ │         │     khai [Công khai] │ │ │
│                                      │ │ └─────────┴──────────────────────┘ │ │
│                                      │ └────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Giải phẫu form sửa — vì sao nó “dài và rối”

Form có **21 khoá dữ liệu** (`CategoryDraft`): tên, slug, thứ tự, giới thiệu, H1, nội dung,
kicker, ảnh bìa, alt ảnh, tiêu đề SEO, mô tả SEO, 2 cờ hiển thị, trạng thái công khai,
cột bảng thông số, hàng bảng thông số, thông tin mua hàng, FAQ, trường sản phẩm, bộ lọc.
Trong đó:

- **~15 ô luôn hiển thị**, còn lại nằm trong `<details>`; riêng khối “Bảng thông số, thông
  tin mua hàng & câu hỏi” mở ra lại chứa **3 `<details>` nữa** — muốn sửa 1 dòng thông số
  phải bấm mở **2 lần**.
- Danh mục mẫu đầy đủ như Hạt điều (Cashew) có 4 cột × 8 hàng thông số, 6 mục mua hàng,
  4 FAQ, cộng các trường sản phẩm → tổng số ô nhập thực tế **vượt 60 ô** trên một màn hình cuộn.
- Trường `filters` (bộ lọc cho buyer) **có trong dữ liệu và được gửi khi lưu nhưng không
  có ô nhập nào trên giao diện** — người dùng không cách nào biết/bảo trì nó ở đây.
- Ảnh bìa chỉ tải được **sau khi danh mục đã có ID**: tạo mới phải “Lưu trước → mở lại →
  mới tải ảnh”, nhưng giao diện chỉ nói điều này bằng một dòng chữ nhỏ trong khung đứt nét.

### 2.2 Dữ liệu thật làm bố cục càng khó quét

Seed hiện có **20 danh mục, 2 cấp** (ví dụ *Nuts & kernels → Cashew, Macadamia*;
*Pepper & spices → Pepper, Cinnamon, Star anise*; *Seafood → Pangasius, Shrimp*…),
nhưng danh sách bên trái **hiển thị phẳng theo `sort_order`**, không thụt cấp, không nhóm.
Người mới không phân biệt được đâu là ngành cha (trang tổng hợp), đâu là ngành con —
trong khi trên website public, hai cấp này hiển thị rất khác nhau.

---

## 3. Chấm điểm nhanh theo 10 nguyên tắc sử dụng (Nielsen)

Thang 1 (rất kém) – 5 (tốt). Điểm thấp không phải lỗi thẩm mỹ mà là lỗi cấu trúc.

| Nguyên tắc | Điểm | Nhận xét gắn với code thực tế |
|---|---:|---|
| Nhìn là biết hệ thống đang ở trạng thái nào | 2/5 | Có nhãn Nháp/Công khai, nhưng **không có dấu “đang sửa chưa lưu”**: bấm sang danh mục khác, bản nháp dở vẫn nằm trong bộ nhớ (`drafts`) mà danh sách không hề đánh dấu mục nào đang sửa dở. |
| Dùng ngôn ngữ của người dùng | 2/5 | “Mã ổn định (a-z, số, _)”, “Chỉ hiện khi”, “Dòng giới thiệu trên trang chủ (kicker)”, “Thứ tự hiển thị: 10/20/30”, H1/SEO không có giải thích hay xem trước. Đây là từ của lập trình viên/SEO, không phải của người vận hành sàn. |
| Người dùng chủ động & có đường lui | 2/5 | “Đóng” không cảnh báo mất thay đổi; chuyển danh mục không cảnh báo; không có Hoàn tác sau khi lưu. |
| Nhất quán & theo chuẩn quen thuộc | 2/5 | Cùng CRM: Sản phẩm/NCC dùng **bảng + bộ lọc trên URL**, Danh mục lại dùng **master–detail tự chế**; người kiểm duyệt (`publication-queue.tsx`) lại thấy một bố cục dọc thứ ba cho cùng một đối tượng. Học 1 trang không áp dụng được sang trang kia. |
| Phòng lỗi trước khi xảy ra | 2/5 | Chỉ kiểm tra “slug + tên” lúc gửi về server; lỗi hiện bằng toast sau khi đã bấm Lưu. Công khai chỉ chặn khi thiếu tên/slug — **thiếu ảnh bìa/giới thiệu/SEO vẫn công khai được**. |
| Nhận diện hơn là ghi nhớ | 1/5 | Nội dung quan trọng bị giấu trong 2 tầng mục gập; muốn biết “FAQ có mấy câu” phải mở ra đếm (tiêu đề mục chỉ hiện số ở tầng trong). Không checklist, không xem trước → buộc phải nhớ cấu trúc trang public. |
| Linh hoạt & nhanh cho người thạo | 2/5 | Có tìm kiếm (tốt), nhưng không lọc trạng thái, không thao tác hàng loạt, sắp xếp phải mở từng mục sửa số thứ tự, không kéo–thả. |
| Gọn gàng, ít nhiễu | 3/5 | Màu/chữ sạch (điểm cộng), nhưng mỗi dòng danh sách đều có mũi tên `→` thừa, khung lồng khung (layout + manager cùng đệm `px-4`), thẻ lồng thẻ khiến trang “xám” và dài. |
| Báo lỗi dễ hiểu & chỉ cách sửa | 2/5 | Lỗi dồn vào toast góc màn hình, không neo vào ô sai, không cuộn tới ô lỗi. Tài liệu `docs/editor-workflow.md` còn ghi “nút công khai cũng lưu nội dung đang nhập” trong khi code hiện tại **không lưu** (chỉ cảnh báo bằng `confirm`) — tài liệu và sản phẩm lệch nhau càng làm người dùng hoang mang. |
| Trợ giúp đúng lúc | 2/5 | Có vài gợi ý nhỏ (placeholder, dòng slug cũ), nhưng không có hướng dẫn “một trang danh mục đủ tốt gồm những gì”, không đếm ký tự SEO, không xem trước kết quả Google/thẻ trang chủ. |

**Tổng quan: khoảng 2/5 — dùng được với người đã thuộc lòng hệ thống, nhưng trừng phạt
người mới và người dùng thỉnh thoảng** (đúng đối tượng “quen TMĐT, lạ trang này”).

---

## 4. Các vấn đề cụ thể (xếp theo mức độ gây hại)

### 🔴 P0 — Gây làm sai / mất việc

**P0-1. “Lưu” và “Công khai” tách rời cả về vị trí lẫn khái niệm.**
Thanh lưu dính ở cuối form, thẻ công khai nằm **dưới** thanh lưu (phải cuộn qua mới thấy).
Khi nội dung chưa lưu mà bấm Công khai, hệ thống bật hộp thoại dài giải thích “quyết định
này chỉ áp dụng cho bản đã lưu…” — tức là bắt người dùng hiểu cơ chế bên trong.
Trên TMĐT, chuẩn quen thuộc là **một thanh hành động duy nhất**: trạng thái + Lưu nháp +
nút hành động chính (Đăng/Công khai) đứng cạnh nhau, và hệ thống tự lưu trước khi công khai
hoặc chặn rõ ràng ngay tại nút. → Đây là điểm gây nhầm lẫn số 1.

**P0-2. Nút Xoá giấu trong mục “Hiển thị & tìm kiếm”.**
Hành động nguy hiểm nhất nằm ở cuối một mục gập về SEO — vừa khó tìm khi cần, vừa dễ bấm
nhầm khi không ngờ tới. Chuẩn TMĐT: “Vùng nguy hiểm” tách riêng, viền đỏ, ở cuối trang
sửa, ghi rõ hậu quả. (Server đã chặn xoá khi có sản phẩm/RFQ — rất tốt — nhưng giao diện
không nói trước điều đó.)

**P0-3. Không có cảnh báo “chưa lưu”.**
Bấm sang danh mục khác hoặc “Đóng” giữa chừng: không dấu chấm trên mục đang sửa dở,
không hộp thoại xác nhận. Người dùng quay lại tưởng đã lưu. Shopee/Shopify đều có
thanh “Bạn có thay đổi chưa lưu” rất nổi bật.

**P0-4. Tạo mới bị cụt luồng vì ảnh.**
“Thêm danh mục” → điền form → mới biết phải lưu rồi mới tải được ảnh → lưu xong phải tự
tìm lại đúng mục vừa tạo. Chuẩn đúng: tạo nhanh 3 ô (Tên · Đường dẫn · Danh mục cha) →
hệ thống tạo bản nháp và **tự mở màn hình sửa** → bổ sung ảnh/nội dung sau.

### 🟠 P1 — Khó tìm, khó quét, tốn thời gian

**P1-5. Danh sách phẳng, câm thông tin.** Mỗi dòng chỉ có ảnh + tên + “Nháp · /slug”.
Thiếu: số sản phẩm/NCC thuộc danh mục, còn thiếu gì (ảnh/nội dung/trường sản phẩm),
cập nhật lần cuối bởi ai, phân cấp cha–con. Hệ quả: muốn biết “danh mục nào đang hỏng”
phải mở từng cái — đúng việc mà trang danh sách sinh ra để tránh.

**P1-6. Sắp xếp bằng con số trừu tượng.** “Thứ tự hiển thị: 30” — 30 so với cái gì?
Muốn đưa Cà phê lên trên Tiêu phải mở cả hai ra xem số rồi đoán số chen vào.
TMĐT giải quyết bằng **kéo–thả ngay trên danh sách** (hoặc nút ↑↓).

**P1-7. Mục gập 2 tầng giấu nội dung.** “Bảng thông số / Thông tin mua hàng / Câu hỏi /
Trường sản phẩm” — 4 thứ khác nhau bị nén vào các hộp gập không có tóm tắt trạng thái
(đã có/chưa có/bao nhiêu mục) ở trạng thái đóng. Người dùng mới thậm chí không biết
các tính năng này tồn tại.

**P1-8. Thứ tự các khối ngược với tần suất dùng.** Việc hằng ngày (tên, ảnh, giới thiệu)
và việc hiếm/ kỹ thuật (trường sản phẩm có “điều kiện hiển thị theo lựa chọn trước”)
có trọng lượng thị giác ngang nhau. Khối kỹ thuật nên ở thẻ riêng, có cảnh báo
“sửa ở đây ảnh hưởng form nhập sản phẩm của NCC”, lý tưởng là chỉ hiện với vai trò được giao.

**P1-9. Sửa trong bóng tối — không xem trước.** Người soạn không thấy: ảnh bìa sẽ cắt
thế nào trên trang public (tỉ lệ 21:9 toàn chiều ngang), thẻ danh mục trên trang chủ
trông ra sao, kết quả Google (tiêu đề/mô tả SEO) dài ngắn thế nào. Phải bấm “Xem trang”
mở tab khác — mà “Xem trang” với bản nháp thì không phản ánh nội dung đang sửa.

**P1-10. Trên điện thoại gần như không dùng được.** Cột danh sách (cao tối đa 65% màn
hình, tự cuộn) xếp **trên** form: mỗi lần đổi danh mục lại phải cuộn qua cả danh sách.
Thanh lưu dính cuối + thẻ công khai phía dưới dễ che nội dung. (Nếu đối tượng chỉ dùng
máy tính, hạ mức này xuống P2 — nhưng vẫn nên sửa vì chi phí thấp.)

### 🟡 P2 — Gọn gàng & nhất quán (sửa nhanh, hiệu quả cảm nhận cao)

- **P2-11. Lồng khung 2 lần:** `app/crm/layout.tsx` đã có `max-w-[1500px] px-4…`, trong
  `CategoriesManager` lại `max-w-7xl px-4 py-6` → trang hẹp và lệch nhịp với các trang CRM khác.
- **P2-12. Trộn Anh–Việt không theo quy tắc:** nhãn tiếng Việt, nội dung bắt nhập tiếng Anh,
  có chỗ ghi chú “Admin: ô tiếng Anh” (trong `ImagePicker`) có chỗ không. Cần quy ước:
  nhãn + hướng dẫn = tiếng Việt; ô nào buyer sẽ đọc thì gắn nhãn nhỏ **[Buyer thấy · EN]**.
- **P2-13. Chữ siêu nhỏ ở các trình sửa con** (10–11px, viết hoa, tracking rộng) trong
  bảng thông số/trường sản phẩm — khó đọc, trông “kỹ thuật”, dễ nhập sai cột.
- **P2-14. Thuật ngữ cần “phiên dịch”** (xem bảng đổi tên ở mục 6.4) và các nút icon
  `−` không có chữ ở trình sửa con khiến người mới không dám bấm.

### ✅ Những gì đang tốt — phải giữ khi thiết kế lại

1. **Tách Lưu khỏi Công khai + nguyên tắc “người soạn không tự công khai”**
   (`publication-actions.ts` + kiểm tra `updated_by`) — đây là kiểm soát chất lượng đúng
   kiểu B2B, chỉ cần *trình bày* lại cho dễ hiểu, không bỏ.
2. Đổi slug vẫn giữ slug cũ chuyển hướng 301 và có ghi chú trên form.
3. Chặn xoá ở server khi đã có sản phẩm/RFQ, gợi ý chuyển Nháp thay thế.
4. Có tìm kiếm danh mục, ảnh thu nhỏ, nhãn trạng thái, toast kết quả, nút AI soạn nháp
   (chỉ điền nháp, không tự lưu) — hướng đi đúng.
5. Người kiểm duyệt có màn hình riêng chỉ-đọc + quyết định công khai (`publication-queue.tsx`)
   — tách quyền rõ; khi làm lại nên dùng **chung khung hiển thị** với màn sửa để hai vai
   trò nhìn cùng một cấu trúc.

---

## 5. Đối chiếu với “chuẩn TMĐT” mà người dùng đã quen

| Kỳ vọng quen thuộc (Shopee/Lazada Seller, Shopify, WooCommerce) | Trang hiện tại | Đề xuất |
|---|---|---|
| Vào là thấy **bảng danh sách** toàn bộ, quét 1 mắt biết trạng thái | Thấy cột hẹp 280px + vùng trống “Chọn danh mục để bắt đầu” | Danh sách là màn hình mặc định, đầy đủ cột thông tin (§6.1) |
| Lọc nhanh: Tất cả / Đang bán / Đã ẩn / Vi phạm–thiếu thông tin | Chỉ có ô tìm kiếm | Thẻ lọc (tab) + tìm kiếm, đếm số từng nhóm (§6.1) |
| Mỗi dòng có **số liệu**: tồn kho/số sản phẩm, ngày sửa | Không có | Cột Sản phẩm · NCC · Độ hoàn thiện · Cập nhật (§6.1) |
| Sửa = trang riêng hoặc panel rõ ràng, **chia mục có mục lục** | 1 cột cuộn + accordion 2 tầng | Tab dọc bên trái + panel theo chủ đề (§6.2) |
| **Thanh lưu dính trên cùng**, báo “chưa lưu” | Thanh dính dưới; công khai nằm dưới nữa; không báo chưa lưu | Thanh hành động dính trên cùng, chấm “● Chưa lưu” (§6.2) |
| Xem trước như buyer thấy | Mở tab public (không gồm thay đổi nháp) | Cột xem trước trực tiếp + bản Google + thẻ trang chủ (§6.2) |
| Thêm mới = form ngắn/từng bước | Mở nguyên form dài, ảnh bị khoá tới khi lưu | Hộp thoại 3 ô → tạo nháp → tự vào màn sửa (§6.3) |
| Sắp xếp = kéo thả | Gõ số thứ tự | Kéo–thả trên danh sách, tự lưu thứ tự (§6.1) |
| Xoá ở “vùng nguy hiểm”, có giải thích | Giấu trong mục SEO | Vùng nguy hiểm cuối tab Cơ bản (§6.2) |

Điểm khác biệt cần tôn trọng: Vexim là sàn B2B có kiểm duyệt 2 người, không phải shop tự
đăng bán. Vì vậy **không** sao chép nút gạt “bật/tắt bán” tức thì của Shopee; thay vào đó
dịch nó thành quy trình trạng thái dễ hiểu: `Nháp → (đủ checklist) → Công khai`, trong đó
nút Công khai tự bị khoá kèm lý do (“Bạn là người sửa cuối — cần người khác duyệt”).

---

## 6. Thiết kế đề xuất

### 6.1 Màn hình 1 — Danh sách danh mục (mặc định, thay master–detail hiện tại)

```
┌───────────────────────────────────────────────────────────────────────┐
│ Danh mục sản phẩm                                  [+ Thêm danh mục]  │
│ 20 danh mục · 12 đang công khai · 3 danh mục chưa đủ điều kiện đăng   │
├───────────────────────────────────────────────────────────────────────┤
│ [Tất cả 20] [Đang công khai 12] [Bản nháp 8] [Thiếu ảnh 4] [Chưa hoàn thiện 6] │
│ 🔍 Tìm theo tên hoặc đường dẫn…        [Trạng thái ▾] [Sắp xếp: Thứ tự ▾]   │
├───────────────────────────────────────────────────────────────────────┤
│ ⠿ │ 🖼 Cashew kernels        /cashew        ● Công khai │ 14 SP · 6 NCC │ ██████░░ 85% │ 12/10 bởi Lan Anh │ [Xem] [Sửa] [⋯] │
│ ⠿ │ └ Macadamia             /macadamia     ● Công khai │  …            │ …            │ …                   │ …                 │
│ ⠿ │ 🖼 Coffee                /coffee        ○ Bản nháp  │  9 SP · 4 NCC │ ████░░░░ 55% │ Thiếu: ảnh bìa, FAQ │ [Xem] [Sửa] [⋯] │
│ … kéo–thả để đổi thứ tự · danh mục con thụt vào dưới danh mục cha …        │
└───────────────────────────────────────────────────────────────────────┘
```

Quy tắc:

- **Dạng cây:** danh mục con thụt cấp dưới cha (dữ liệu `parent_id` đã có sẵn), cha có
  nút thu/mở. Nhãn cấp: “Ngành tổng hợp” / “Ngành con” khi cần phân biệt.
- **Độ hoàn thiện** = tỉ lệ trong checklist công khai (§6.2), hiển thị dạng thanh + chữ
  “Thiếu: ảnh bìa, FAQ” — trả lời ngay câu hỏi “còn thiếu gì”.
- **Thao tác nhanh theo dòng:** Xem trang (nếu đã công khai) · Sửa · menu `⋯`
  (Công khai/Ẩn — vẫn qua xác nhận và luật 2 người · Nhân bản? *nếu nghiệp vụ cần* · Xoá…).
- **Kéo–thả sắp xếp** ghi lại `sort_order` hàng loạt; bỏ hẳn ô “Thứ tự hiển thị” khỏi form.
- Bộ lọc + tìm kiếm đặt trên **URL** (`?status=draft&q=…`) giống `/crm/products` để
  gửi link cho nhau được và nút Back hoạt động đúng kỳ vọng.
- Số sản phẩm/NCC mỗi danh mục: tính ở server từ dữ liệu sẵn có (sản phẩm theo `category`,
  liên kết `supplier_categories`) — không cần đổi cấu trúc DB.

### 6.2 Màn hình 2 — Sửa danh mục (tab + cột xem trước)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ← Danh sách   Cashew kernels  [Bản nháp] ● Chưa lưu      [Xem trang] [Lưu nháp] [Công khai] │
├──────────────┬──────────────────────────────────────┬─────────────────────────┤
│ ● Cơ bản     │  (panel thay đổi theo tab)           │ ✓ Sẵn sàng công khai   │
│ ● Nội dung   │                                      │  ☑ Tên & đường dẫn     │
│ ◐ Thông số   │  Tên danh mục [Buyer thấy · EN]      │  ☑ Ảnh bìa             │
│ ○ Sản phẩm*  │  [ Cashew kernels              ]     │  ☐ Giới thiệu ≥ …      │
│ ○ Mua hàng   │  Đường dẫn  /products/[ cashew ]     │  ☐ Câu hỏi thường gặp  │
│ ○ SEO        │  Danh mục cha [Nuts & kernels ▾]     │  → Đủ mục bắt buộc mới │
│              │                                      │    bật nút Công khai   │
│              │  ┌ Vùng nguy hiểm ────────────────┐  │                         │
│              │  │ Xoá danh mục…        [Xoá…]    │  │ 👁 Xem trước            │
│              │  └────────────────────────────────┘  │ [Trang public|Trang chủ]│
│              │                                      │  ┌───────────────────┐  │
│              │                                      │  │ (ảnh bìa 21:9)    │  │
│              │                                      │  │ Cashew kernels    │  │
│              │                                      │  │ intro rút gọn…    │  │
│              │                                      │  └───────────────────┘  │
└──────────────┴──────────────────────────────────────┴─────────────────────────┘
 * tab “Sản phẩm” = trường thông số cho từng sản phẩm — gắn nhãn “Nâng cao”
```

Quy tắc:

- **Một thanh hành động dính trên cùng duy nhất:** Quay lại · tên + trạng thái · chấm
  “Chưa lưu” (tự biến mất sau khi lưu) · Xem trang · **Lưu nháp** · **Công khai/Ẩn**.
  Xoá bỏ thanh dính dưới + thẻ công khai rời hiện tại. Bấm Công khai khi đang sửa dở:
  hệ thống **tự lưu trước rồi mới công khai** (hoặc báo rõ “hãy Lưu trước” ngay tại nút —
  chọn một, và sửa lại `docs/editor-workflow.md` cho khớp code).
- **Tab dọc** thay accordion: *Cơ bản · Nội dung & ảnh · Thông số tham khảo ·
  Trường sản phẩm (Nâng cao) · Mua hàng & FAQ · SEO & hiển thị*.
  Mỗi tab có chấm trạng thái (đủ/thiếu) — nhìn mục lục là biết còn việc ở đâu, đúng cảm
  giác “làm theo checklist” của các trình quản trị TMĐT hiện đại.
- **Cột phải cố định** gồm (1) Checklist công khai — các mục bắt buộc do nghiệp vụ định
  (tên, slug, ảnh bìa, giới thiệu; mục nên-có: FAQ, trường sản phẩm…), bấm vào mục nhảy
  tới đúng tab/ô; (2) **Xem trước trực tiếp**: thẻ như trên trang chủ + khung trang
  public thu nhỏ + mẫu kết quả Google (tiêu đề/mô tả tự cắt theo độ dài), cập nhật theo
  từng phím gõ — sửa SEO không còn là đoán mò.
- **Ngôn ngữ thân thiện + giữ thuật ngữ trong ngoặc:** xem bảng 6.4. Mọi ô buyer đọc
  được gắn nhãn `[Buyer thấy · EN]`; ô kỹ thuật gắn `[Nội bộ]`.
- **Báo lỗi tại chỗ:** ô sai viền đỏ + dòng lỗi ngay dưới + tự cuộn tới ô đầu tiên bị lỗi;
  toast chỉ đóng vai trò xác nhận thành công.
- **Chặn rời trang khi chưa lưu** (cả nút Back, chuyển tab không sao vì cùng bản nháp).
- Thêm truờng **Danh mục cha** vào tab Cơ bản (dữ liệu đã có `parent_id` nhưng form hiện
  tại không cho sửa!) để việc phân cấp làm được trên giao diện.

### 6.3 Luồng thêm mới (3 bước nhẹ)

1. Bấm **+ Thêm danh mục** → hộp thoại nhỏ: *Tên (EN) · Đường dẫn (tự sinh từ tên, sửa
   được) · Danh mục cha (không bắt buộc)*.
2. Tạo bản nháp → **tự chuyển vào màn sửa**, tab Nội dung, con trỏ ở ô Giới thiệu,
   thông báo “Đã tạo bản nháp — bổ sung ảnh và nội dung rồi gửi công khai”.
3. Ảnh tải được ngay (vì đã có ID) — xoá điểm cụt hiện tại.

### 6.4 Đổi tên cho dễ hiểu (giữ nguyên dữ liệu, chỉ đổi nhãn)

| Nhãn hiện tại | Nhãn đề xuất | Ghi chú |
|---|---|---|
| Đường dẫn | Đường dẫn trang (slug) `…/products/[cashew]` | Hiện nguyên tiền tố để khỏi đoán |
| Thứ tự hiển thị | *(bỏ khỏi form — kéo thả ở danh sách)* | Nếu giữ: “Vị trí trong danh sách (số nhỏ hiện trước)” kèm xem trước thứ tự |
| Dòng giới thiệu trên trang chủ | Câu mô tả ngắn trên thẻ trang chủ | Kèm hình thẻ xem trước |
| Tiêu đề trang (H1) | Tiêu đề lớn đầu trang (H1) | Ghi rõ để trống sẽ tự dùng “{Tên} suppliers in Vietnam” |
| Tiêu đề/Mô tả tìm kiếm | Tiêu đề/Mô tả trên Google (SEO) | Kèm khung xem trước Google + đếm ký tự |
| Mã ổn định (a-z, số, _) | Mã trường (không đổi sau khi đã có sản phẩm) | Cảnh báo hậu quả khi đổi |
| Chỉ hiện khi | Chỉ hiện khi trường trước chọn… | Viết thành câu đầy đủ |
| Bảng thông số | Bảng thông số tham khảo trên trang danh mục | Phân biệt với trường sản phẩm (đã có tài liệu `docs/category-product-attributes.md`, cần đưa tóm tắt 1 câu vào giao diện) |
| Trường thông số cho từng sản phẩm | Trường dữ liệu NCC phải điền cho mỗi sản phẩm · *Nâng cao* | Thêm dòng “Thay đổi ở đây làm thay đổi form nhập sản phẩm” |
| Hiển thị trên trang chủ / Cho phép Google lập chỉ mục | Giữ nguyên, thêm câu giải thích 1 dòng + lý do bị khoá khi thiếu quyền | Hiện tại checkbox bị `disabled` không lời giải thích |

### 6.5 Hình thức (visual) — giữ hệ màu hiện có, sửa “nhịp” trang

- Bỏ lớp bọc trùng (`max-w-7xl px-4 py-6` trong manager) — dùng đúng khung của
  `app/crm/layout.tsx` như mọi trang CRM khác để các trang thẳng hàng nhau.
- Danh sách: bảng trắng 1 thẻ duy nhất (như `/crm/products`), hàng cao ~56px, trạng thái
  dùng **chấm màu + chữ** (xanh = công khai, xám = nháp, hổ phách = chưa hoàn thiện).
- Form sửa: panel trắng theo tab, nhãn 13px (bỏ kiểu 10–11px viết hoa ở trình sửa con),
  khoảng cách đều 16–20px, nút icon có kèm chữ hoặc tooltip.
- Mật độ “vừa” kiểu Seller Centre: không phóng to như trang public, không nén như bảng kế toán.

---

## 7. Lộ trình thực hiện (theo mức rủi ro tăng dần)

### Giai đoạn 0 — “Gọn & rõ” (không đổi DB, không đổi server action) ⭐ làm trước

1. Chuyển Xoá thành **Vùng nguy hiểm** cuối tab/khối Cơ bản; gộp Công khai vào cùng
   thanh với Lưu (một thanh dính trên cùng), bỏ thẻ công khai rời phía dưới.
2. Thay accordion 2 tầng bằng **tab** (hoặc tối thiểu: accordion 1 tầng, tiêu đề kèm
   số mục + trạng thái Đã có/Chưa có); tách “Trường sản phẩm” thành mục riêng có nhãn Nâng cao.
3. Thêm: chấm **Chưa lưu**, cảnh báo khi rời/chuyển danh mục, lỗi tại ô, đổi nhãn theo §6.4,
   sửa `docs/editor-workflow.md` cho khớp hành vi Lưu/Công khai.
4. Danh sách: thêm huy hiệu trạng thái rõ, cột “Cập nhật” (dữ liệu `updated_at/updated_by`
   đã có), gom cha–con bằng thụt cấp, mặc định mở sẵn danh mục đầu tiên thay vì ô trống.
5. Bỏ khung lồng đôi; thêm bộ lọc trạng thái (lọc phía client là đủ ở quy mô 20 mục).

*Rủi ro: thấp — chỉ JSX/CSS phía client. Kiểm chứng: `npm run typecheck && npm run build`
+ kiểm thử tay các luồng lưu/công khai/xoá theo phân quyền.*

### Giai đoạn 1 — “Giống TMĐT” (thêm truy vấn/server action nhỏ)

6. Trang danh sách đầy đủ §6.1: số SP/NCC, độ hoàn thiện, kéo–thả sắp xếp
   (server action cập nhật `sort_order` hàng loạt), lọc/tìm trên URL.
7. Cột xem trước (trang chủ + Google) và checklist công khai với tiêu chí bắt buộc
   dùng chung cho cả nút Công khai và màn kiểm duyệt — đồng thời **siết điều kiện công
   khai ở server** (hiện chỉ cần tên + slug).
8. Hộp thoại tạo mới 3 ô (§6.3) + ô Danh mục cha trong form.

*Rủi ro: trung bình — chạm `listCategories` (chỉ đọc thêm số đếm) và thêm 1 action sắp xếp.*

### Giai đoạn 2 — “Chuẩn hoá nền” (khi danh mục/sản phẩm nhiều lên)

9. Tách route sửa riêng `/crm/categories/[id]` (tab trên URL) để gửi link, Back/Forward
   đúng kỳ vọng; màn kiểm duyệt dùng chung khung xem với màn sửa (chỉ khác quyền sửa).
10. Cân nhắc trạng thái trung gian “Chờ duyệt” nếu quy trình 2 người cần hàng đợi rõ
    (hiện người duyệt phải tự tìm trong danh sách nháp) + lịch sử thay đổi theo danh mục.
11. Tự lưu nháp định kỳ + khôi phục khi mất mạng (hệ thống đã có cơ chế fallback local).

---

## 8. Tiêu chí nghiệm thu cho bản sửa (để khỏi tranh luận cảm tính)

- [ ] Người mới (chưa từng vào trang) tìm và mở đúng danh mục “Cà phê” để sửa trong < 10 giây.
- [ ] Đổi ảnh bìa + lưu: tối đa 3 lần bấm sau khi vào trang, không phải cuộn qua khối không liên quan.
- [ ] Nhìn danh sách trả lời được ngay: danh mục nào đang công khai / thiếu ảnh / chưa có FAQ.
- [ ] Không thao tác nào (chuyển mục, đóng, Back) làm mất thay đổi mà không cảnh báo.
- [ ] Nút Công khai luôn cho biết *vì sao chưa bấm được* ngay tại vị trí nút.
- [ ] Xoá chỉ xuất hiện trong Vùng nguy hiểm, kèm hậu quả; bị chặn sẵn khi có SP/RFQ (có ghi lý do).
- [ ] Màn sửa dùng được ở bề rộng 390px: tab thành menu chọn, thanh hành động không che nội dung.
- [ ] `npm run typecheck` và `npm run build` đạt; luồng theo vai trò (admin/sourcing/reviewer)
      giữ đúng ma trận quyền hiện tại.

---

## 9. Cần anh/chị chốt trước khi sửa code thật

1. **Mức đầu tư:** Giai đoạn 0 (sửa cảm giác, ít rủi ro) hay làm thẳng tới Giai đoạn 1
   (danh sách kiểu TMĐT + xem trước)? — *Khuyến nghị: 0 → dùng thử → 1.*
2. **Checklist công khai:** những mục nào là *bắt buộc* mới được công khai
   (đề xuất: Tên + Đường dẫn + Ảnh bìa + Giới thiệu; FAQ/SEO là *nên có*)?
3. **Ai được sửa “Trường sản phẩm” (Nâng cao)?** Giữ cho mọi vai trò có `categories.manage`
   như hiện tại, hay tách riêng (vd chỉ admin/sourcing trưởng)?
4. Xác nhận nguyên tắc giữ nguyên: **người sửa cuối không được tự công khai** — bản thiết
   kế sẽ trình bày việc này bằng checklist + nút bị khoá có lý do, thay vì hộp thoại sau khi bấm.

> Sau khi chốt 4 điểm trên, bước tiếp theo là sửa thật theo giai đoạn đã chọn trên cùng
> branch này, kèm `typecheck/build` và hướng dẫn kiểm thử theo vai trò.
