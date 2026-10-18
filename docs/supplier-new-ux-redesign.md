# Phân tích UX & đề xuất thiết kế lại `/crm/suppliers/new` (Thêm nhà cung cấp)

> Ngày: 18/10/2026 · Trạng thái: **phân tích + đề xuất, chưa sửa code** (chờ duyệt như trang Danh mục).
> Khảo sát từ mã nguồn production: `app/crm/suppliers/new/page.tsx`,
> `components/supplier-form.tsx` (338 dòng, **dùng chung cho cả Thêm mới và Sửa**),
> `app/crm/suppliers/[slug]/edit/page.tsx`, `createSupplierAction` trong `app/actions.ts`,
> trang chi tiết NCC (đích đến sau khi tạo) và danh sách `/crm/suppliers`.
>
> **Mockup trực quan:** [`supplier-new-redesign-mockup.html`](./supplier-new-redesign-mockup.html)
> — gõ thử tên "Cashew" để xem cảnh báo trùng, bấm **Tạo hồ sơ nháp** để xem bước tiếp theo.

---

## 1. Kết luận ngắn gọn

Trang này **ít rối hơn trang Danh mục cũ** (chỉ cần tên là lưu được, có tự gán ngành,
lưu xong chuyển sang trang chi tiết) — nhưng mắc một lỗi cốt lõi khác:

> **Trang "Thêm mới" đang dùng nguyên form của trang "Sửa hồ sơ đầy đủ".**
> Lời hứa ở tiêu đề là *"Chỉ cần tên để lưu hồ sơ, bổ sung sau"*, nhưng thứ người dùng
> nhìn thấy là **31 ô nhập**, trong đó có cả những thứ chưa thể biết/chưa nên quyết
> ở thời điểm tạo: chấp thuận công khai giá (pháp lý, hạn 180 ngày), tên hiển thị &
> đường dẫn công khai, điều kiện giao hàng, thị trường xuất khẩu…

Hệ quả thực tế: nhân viên mới không biết nên điền gì trước → hoặc **bỏ dở**, hoặc
**điền bừa cho xong**, hoặc tạo trùng hồ sơ đã có (hệ thống không hề cảnh báo trùng).
Người quen TMĐT kỳ vọng "Thêm nhà cung cấp" giống "Thêm shop/NCC" trên sàn: **một
form ngắn tạo nhanh → vào trang quản lý của NCC đó → bổ sung theo checklist**.

**Đề xuất:** tách trải nghiệm tạo mới khỏi form sửa —

- **Trang Thêm mới (đề xuất):** 1 thẻ form ngắn gọn (~10 ô thật sự cần lúc tạo) +
  cột phải *"Sau khi tạo sẽ làm gì"* (4 bước) + **cảnh báo trùng hồ sơ ngay khi gõ**.
  Mọi trường nâng cao dời sang trang Sửa (vốn đã có sẵn), kèm dòng dẫn
  *"Các thông tin còn lại bổ sung ở trang Sửa sau khi tạo"*.
- **Trang Sửa:** giữ nguyên dữ liệu/quyền, sắp xếp lại theo **tab** giống hệt khung
  trang Danh mục vừa làm (Cơ bản · Liên hệ & địa chỉ · Thương mại · Giới thiệu &
  hiển thị · Ghi chú), thanh Lưu dính trên cùng.
- Giữ nguyên các nguyên tắc nghiệp vụ đúng hiện có (xem mục 4).

---

## 2. Bố cục hiện tại

```
Thêm nhà cung cấp
"Chỉ cần tên để lưu hồ sơ. Thông tin liên hệ và mặt hàng có thể bổ sung sau."
┌─ Thông tin nhà cung cấp ──────────────────────────────── [Bản nháp] ┐
│ Tên* · Người liên hệ · Điện thoại · Email · Mặt hàng chính          │
│ [Ngành hệ thống tự gán: (trống — chưa có dữ liệu)]                  │
│ Tỉnh/Thành phố · Loại hình                                          │
├─ Giới thiệu cho khách hàng ─────────────────────────────────────────┤
│ Giới thiệu ngắn (tiếng Anh)              [AI soạn nháp]             │
│ ┌ Quyền hiển thị giá của sản phẩm (khối xám, chữ nhỏ, pháp lý) ┐   │
│ │ ☐ NCC đã chấp thuận công khai giá sản phẩm (hạn 180 ngày…)   │   │
│ └────────────────────────────────────────────────────────────────┘   │
│ ▸ Tên hiển thị và đường dẫn (gập): tên hiển thị, slug, tên TM, web │
├─ ▸ Địa chỉ, giấy tờ & thông tin khác (gập) ─────────────────────────┤
│ Địa chỉ · Mã số thuế · Chức vụ LH · Zalo · Quốc gia · Vai trò ·     │
│ Năm TL · Số NV · TG giao hàng · MOQ · Công suất · Thanh toán ·      │
│ Thị trường đã phục vụ · OEM · [Cảng] [Incoterm] [Thị trường XK] ·   │
│ Ghi chú nội bộ                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ Bản nháp · "Lưu không tự đổi trạng thái…"        [Lưu nhà cung cấp] │
└─────────────────────────────────────────────────────────────────────┘
```

### Đếm thực tế trên trang Thêm mới

| Nhóm | Số ô | Ghi chú |
|---|---:|---|
| Thông tin nhà cung cấp (luôn hiện) | 8 | tên, liên hệ, điện thoại, email, mặt hàng, tỉnh, loại hình (+hộp tự gán ngành chỉ-đọc) |
| Giới thiệu cho khách hàng (luôn hiện) | 2 | giới thiệu EN, checkbox chấp thuận giá |
| "Tên hiển thị và đường dẫn" (gập) | 4 | tên hiển thị, slug, tên thương mại, website |
| "Địa chỉ, giấy tờ & thông tin khác" (gập) | 17 | gồm **Zalo**, mã số thuế, 3 nhóm chip chọn nhiều… |
| **Tổng** | **31 ô** | chỉ **1 ô bắt buộc** (Tên) |

---

## 3. Các vấn đề (theo mức độ)

### 🔴 P0 — Sai việc, sai thời điểm

**P0-1. Ô "chấp thuận công khai giá" xuất hiện ngay khi tạo mới.**
Đây là xác nhận pháp lý ("NCC đã chấp thuận bằng văn bản, hiệu lực 180 ngày")
nhưng lại nằm ở form tạo — khi chưa có sản phẩm nào, chưa có văn bản nào để kiểm.
Rủi ro: tick bừa lúc tạo → hệ thống ghi nhận ngày chấp thuận từ thời điểm tạo
(`createSupplierAction` tự đặt `fob_updated_at = now` nếu tick). Nên dời sang
trang Sửa/chi tiết, đặt cạnh ngữ cảnh giá sản phẩm, và chỉ bật khi đã có ít nhất
một sản phẩm. (Khối này đang làm đúng ở logic hết hạn 180 ngày — chỉ sai vị trí.)

**P0-2. Không cảnh báo tạo trùng.**
Danh sách NCC đã có sẵn ở server, nhưng form không đối chiếu gì: nhập trùng tên /
mã số thuế / website với NCC cũ vẫn tạo thêm hồ sơ mới lặng lẽ. Với dữ liệu CRM,
trùng hồ sơ là lỗi đắt nhất (sản phẩm, RFQ, xác minh bị chia đôi). Chuẩn TMĐT/CRM:
gõ tên là thấy ngay *"Có thể trùng: Cashew Mill A (đã có hồ sơ) → Mở hồ sơ"*.

**P0-3. Hai cặp trường trùng nhau khiến người nhập không biết điền ở đâu:**
- **Vai trò** (manufacturer/trader/agent/exporter — ở mục gập) vs **Loại hình**
  (nhà máy/thương mại/HTX — ở thẻ đầu): hai cách phân loại chồng lấn, form tạo chỉ
  hiện một, form sửa hiện cả hai.
- **Thị trường đã phục vụ** (ô text tự do, mục gập) vs **Thị trường xuất khẩu**
  (chip chọn nhiều, ngay bên dưới): cùng một thông tin, hai nơi nhập, dễ lệch nhau.
Hệ quả: cùng một NCC, người A điền chỗ này, người B điền chỗ kia → dữ liệu rỗng nửa vời.

### 🟠 P1 — Khó dùng, dễ bỏ cuộc

**P1-4. Zalo bị chôn trong mục gập "Địa chỉ, giấy tờ & thông tin khác"** — trong khi
với NCC Việt Nam, Zalo thường là kênh liên hệ chính, quan trọng hơn cả email.
Ngược lại Website (ít dùng khi mới tạo) cũng bị gập chung, còn Tỉnh/TP thì ở thẻ đầu:
thứ tự trường không theo mức độ cần thiết lúc tạo.

**P1-5. Hộp "Ngành hệ thống tự gán" chiếm vị trí vàng ở đầu form nhưng lúc tạo
luôn trống** ("Chưa có dữ liệu mặt hàng — sẽ tự cập nhật…") và người dùng không
thao tác gì được ở đó. Đặt ở đầu form khiến người mới tưởng phải chọn ngành mà
không thấy chỗ chọn. Nên thu thành một dòng gợi ý nhỏ ngay dưới ô Mặt hàng chính,
chỉ hiện khi đã suy ra được ngành.

**P1-6. Không có "bản đồ hành trình".** Tạo xong sẽ đi đâu, còn những bước nào để
NCC bán được cho buyer (thêm sản phẩm → kiểm giấy tờ → nộp duyệt → công khai)?
Trang tạo không nói một câu; người mới tạo xong rơi vào trang chi tiết 390 dòng
rồi tự mò. Thiếu một khung 4 bước đơn giản ở cột phải (như checklist đã làm ở
trang Danh mục).

**P1-7. Lỗi chỉ báo bằng toast.** Thiếu tên → toast; email sai định dạng → phải gửi
về server mới biết. Không có lỗi tại ô, không viền đỏ. (Trang Danh mục đã sửa
kiểu này; nên nhất quán.)

**P1-8. Đường dẫn công khai (slug) tự sinh từ tên tiếng Việt cho URL xấu**
("Công ty TNHH Hạt Điều Bình Phước" → dạng `c-ng-ty-tnhh-h-t-i-u`) và người dùng
không được xem trước URL ở form tạo. Tên hiển thị/slug nên dời về trang Sửa với
xem trước `veximtrade.com/suppliers/<slug>` như đã làm cho Danh mục.

### 🟡 P2 — Gọn gàng & nhất quán

- **P2-9.** Form tạo và sửa **giống hệt nhau** nên người dùng không phân biệt được
  "tạo nhanh" với "khai đầy đủ". Nên tách `mode` tạo/sửa trong cùng component
  (không nhân đôi logic lưu).
- **P2-10.** Nhãn trạng thái "Bản nháp" ở đầu form tạo gây hiểu nhầm (chưa tạo mà
  đã có trạng thái?) — bỏ ở form tạo, giữ ở form sửa.
- **P2-11.** Chiều rộng `max-w-5xl` một cột dài; trên màn hình rộng thừa khoảng
  trống bên phải — chỗ đó nên là cột hướng dẫn/checklist như trang Danh mục mới.
- **P2-12.** Ô "Khác…" trong nhóm chip chỉ chốt giá trị khi rời ô (blur): bấm Enter
  gửi form ngay có thể mất phần vừa gõ. Cần chốt khi Enter/dấu phẩy.

### ✅ Đang tốt — giữ nguyên

1. Chỉ **Tên là bắt buộc**, tự focus vào ô tên; lưu xong **chuyển thẳng tới trang
   chi tiết** của NCC vừa tạo (đúng kỳ vọng "tạo → quản lý tiếp").
2. Lưu không tự đổi trạng thái/cấp xác minh; chuyển trạng thái bằng nút riêng ở
   form sửa; tạo mới luôn là nháp, `verification_level = 0` (chốt ở server).
3. Tự gán ngành từ mặt hàng chính/sản phẩm — ý tưởng đúng, chỉ cần đổi vị trí hiển thị.
4. Logic chấp thuận giá hết hạn sau 180 ngày + cảnh báo + xác nhận lại (chỉ dời vị trí).
5. AI soạn giới thiệu chỉ điền nháp, không tự lưu.

---

## 4. Thiết kế đề xuất

### 4.1 Trang Thêm mới — "Tạo hồ sơ trong 1 phút"

```
← Nhà cung cấp / Thêm mới
┌─ Tạo hồ sơ nhà cung cấp ──────────────┐ ┌─ Sau khi tạo sẽ làm gì ────┐
│ DOANH NGHIỆP                          │ │ ① Tạo hồ sơ nháp (trang này)│
│  Tên nhà cung cấp*                    │ │ ② Thêm sản phẩm             │
│  Loại hình [Nhà máy ▾]  Tỉnh [____]   │ │ ③ Kiểm giấy tờ & nhà máy    │
│  Mặt hàng chính [hạt điều W320…]      │ │ ④ Nộp duyệt → Công khai     │
│   → Ngành tự gán: [Hạt điều] (gợi ý)  │ │                             │
│ LIÊN HỆ (để đội sale liên lạc lại)    │ │ Hồ sơ mới luôn là Bản nháp, │
│  Người liên hệ   Điện thoại / Zalo    │ │ chưa hiện cho buyer.        │
│  Email           Website (nếu có)     │ │                             │
│ ⚠ Có thể trùng: Cashew Mill A [Mở]   │ │ ☐ Kiểm tra trùng trước khi  │
│                                       │ │   tạo là thói quen tốt…     │
│ [Huỷ]              [Tạo hồ sơ nháp →]  │ └─────────────────────────────┘
└───────────────────────────────────────┘
  Các thông tin còn lại (địa chỉ, giấy tờ, điều kiện thương mại,
  giới thiệu cho buyer…) bổ sung ở trang Sửa sau khi tạo.
```

Quy tắc:

- **Chỉ giữ ~10 ô:** Tên*, Loại hình, Tỉnh/TP, Mặt hàng chính, Người liên hệ,
  Điện thoại, **Zalo (đưa lên cạnh Điện thoại)**, Email, Website. Tất cả trường
  còn lại dời sang trang Sửa — dữ liệu vẫn nguyên vẹn, server không đổi.
- **Cảnh báo trùng theo thời gian thực:** trang đã tải sẵn danh sách NCC ở
  server; khi gõ tên/mã số thuế gần giống, hiện hộp vàng *"Có thể trùng: …
  [Mở hồ sơ]"* ngay dưới ô tên. Không chặn cứng (có thể là chi nhánh khác),
  chỉ cảnh báo + cho đường tắt.
- **Bỏ khỏi form tạo:** khối chấp thuận giá, tên hiển thị/slug/tên thương mại,
  vai trò (legacy), thị trường, cảng/incoterm, MOQ/công suất, ghi chú nội bộ.
  Dòng cuối form ghi rõ nơi bổ sung để người dùng không lo "thiếu".
- **Thanh hành động dính trên cùng** (giống trang Danh mục): ← Danh sách ·
  [Huỷ] · [Tạo hồ sơ nháp]. Bỏ nhãn trạng thái "Bản nháp" ở đầu form.
- Lỗi tại ô (tên trống, email sai format kiểm ngay phía client + server giữ nguyên).

### 4.2 Trang Sửa — dùng lại khung tab của Danh mục

`SupplierForm` thêm `mode: "create" | "edit"`. Khi `edit`, bố cục mới:

| Tab | Nội dung (từ form hiện tại) |
|---|---|
| 1 · Thông tin cơ bản | Tên, tên thương mại, tên hiển thị + xem trước URL, loại hình, tỉnh, địa chỉ, quốc gia, mã số thuế, năm thành lập, số nhân viên |
| 2 · Liên hệ | Người liên hệ, chức vụ, điện thoại, **Zalo**, email, website |
| 3 · Mặt hàng & thương mại | Mặt hàng chính, ngành tự gán (chỉ-đọc), MOQ, công suất, thời gian giao, thanh toán, cảng, incoterm, thị trường (hợp nhất 2 trường thị trường làm 1 — cần chốt nghiệp vụ), OEM |
| 4 · Giới thiệu & hiển thị | Giới thiệu EN + AI, **khối chấp thuận giá** (chỉ hiện khi đã có sản phẩm), ảnh đại diện/bìa (đang nằm ngoài form ở trang edit — gom vào đây) |
| 5 · Ghi chú nội bộ | Ghi chú |

Thanh Lưu dính trên cùng + trạng thái + "Bước tiếp theo" (chuyển trạng thái)
giữ nguyên vị trí nổi bật như hiện nay, chỉ gom lên thanh hành động.

### 4.3 Cần chốt nghiệp vụ trước khi làm

1. **"Vai trò" (legacy) vs "Loại hình":** ẩn "Vai trò" khỏi giao diện (vẫn giữ dữ
   liệu cũ) hay giữ cả hai? — *Đề xuất: ẩn, chỉ dùng Loại hình.*
2. **"Thị trường đã phục vụ" (text) vs "Thị trường xuất khẩu" (chip):** hợp nhất
   thành chip, ô text cũ hiển thị dạng "khác"? — *Đề xuất: hợp nhất vào chip.*
3. Chấp thuận giá: dời sang tab *Giới thiệu & hiển thị* ở trang Sửa và chỉ cho
   tick khi NCC đã có ≥1 sản phẩm — *cần xác nhận đúng ý nghiệp vụ.*

---

## 5. Lộ trình & kiểm chứng

| Giai đoạn | Nội dung | Rủi ro |
|---|---|---|
| **A (làm trước)** | Form tạo rút gọn + cột bước tiếp theo + cảnh báo trùng + lỗi tại ô; form sửa giữ nguyên bố cục cũ | Thấp — thêm `mode` vào `SupplierForm`, trang `/new` truyền thêm danh sách rút gọn (tên/mã thuế/website) để soi trùng. Không đổi server action/DB. |
| **B** | Trang Sửa theo tab như Danh mục; gom ảnh đại diện/bìa vào tab; hợp nhất 2 trường thị trường & ẩn Vai trò (sau khi chốt mục 4.3) | Trung bình — chạm trang edit + `SupplierForm`; phải giữ các bất biến script kiểm thử đang chốt (lưu không đổi trạng thái, không sửa cấp xác minh, không nhập giá FOB ở hồ sơ). |
| **C (tuỳ chọn)** | Checklist hoàn thiện hồ sơ ở trang chi tiết NCC (thiếu liên hệ/sản phẩm/giấy tờ…) giống checklist Danh mục | Trung bình — hiển thị ở `suppliers/[slug]/page.tsx`. |

Kiểm chứng mỗi giai đoạn: `npm run typecheck && npm run build`,
`node scripts/check-editor-workflow.mjs` (đang chốt các bất biến của form này),
`node scripts/check-reviewer-publication.mjs`, tạo thử NCC ở chế độ demo và đi hết
luồng tạo → sửa → thêm sản phẩm.
