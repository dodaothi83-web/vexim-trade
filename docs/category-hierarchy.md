# Cây danh mục 2 cấp: Danh mục lớn → Nhóm nhỏ → Bộ lọc thông số

Tài liệu này mô tả cách Vexim cấu hình ngành hàng trong CRM và cách dữ liệu đó hiển thị ra trang công khai. Toàn bộ nội dung buyer nhìn thấy đều lấy từ `/crm/categories`; không còn nhóm con hay grade nào viết cứng trong code.

## 1. Ba lớp cấu hình

| Lớp | Ở đâu trong CRM | Hiển thị ra sao |
| --- | --- | --- |
| **Danh mục lớn** (nhóm cha, `parent_id = null`) | `/crm/categories` → Sửa → *Thông tin cơ bản* → **Danh mục cha = “Không có”** | Thẻ lớn trên trang chủ; trang `/products/<slug>` liệt kê các nhóm nhỏ bên trong và gộp sản phẩm của chúng |
| **Nhóm nhỏ** (danh mục con, có `parent_id`) | Cùng màn hình → chọn **Danh mục cha** | Trang `/products/<slug>` riêng, breadcrumb có danh mục cha, thanh chuyển nhanh giữa các nhóm nhỏ cùng cha |
| **Bộ lọc thông số** | Sửa nhóm nhỏ → tab **Trường sản phẩm · Nâng cao** | Bộ lọc bên trái trang nhóm nhỏ (chỉ hiện khi có sản phẩm thực có giá trị hợp lệ) |

Thứ tự hiển thị: kéo–thả trong danh sách `/crm/categories` (cùng cấp).

## 2. Hành vi trang công khai

- **Trang danh mục lớn** (`/products/<slug>` của nhóm cha) hiển thị khối *Sub-categories in …* với từng nhóm nhỏ, số sản phẩm và liên kết tới trang nhóm nhỏ. Sản phẩm của các nhóm nhỏ được gộp vào cùng lưới sản phẩm để buyer xem ngay mà không phải bấm thêm.
- **Trang nhóm nhỏ** có breadcrumb `Home / Products / <Danh mục lớn> / <Nhóm nhỏ>` và thanh chuyển nhanh giữa các nhóm nhỏ cùng cha.
- **Thẻ trên trang chủ**: nếu danh mục cha bật *Hiển thị thẻ danh mục trên trang chủ*, các nhóm nhỏ **không** tạo thẻ riêng — chúng nằm trong danh sách “Product Sub-categories” của thẻ cha. Nếu danh mục cha chưa bật, nhóm nhỏ tự có thẻ riêng (dùng nội dung giới thiệu của chính nó).
- Danh mục không có nhóm nhỏ và không có nội dung giới thiệu thì thẻ trên trang chủ không hiển thị phần danh sách rỗng.

## 3. Bộ lọc thông số (thay cho grade viết cứng)

Trong tab **Trường sản phẩm · Nâng cao** của nhóm nhỏ, mỗi trường có:

- **Mã trường** (a-z, số, `_`) — ổn định, đổi mã sẽ làm sản phẩm cũ mất giá trị.
- **Tên hiển thị** buyer thấy.
- **Kiểu nhập**: chọn từ danh sách / văn bản.
- **Lựa chọn**: mỗi dòng một giá trị (tối đa 30).
- **Cho buyer lọc theo trường này**: bật để xuất hiện trong bộ lọc.

Ví dụ nhóm nhỏ *Cashew kernels*: trường `grade` với lựa chọn `W180, W240, W320, W450, SW, WS, LP, SP`, bật lọc. Bộ lọc grade chỉ hiện khi đã có sản phẩm mang giá trị đó.

> Bộ lọc MOQ, tỉnh/thành và mức kiểm chứng NCC là bộ lọc hệ thống, luôn có sẵn.

## 4. Migration cho Supabase

`supabase/migrations/20261021_category_parent_group_nuts.sql` (idempotent):

1. Tạo danh mục lớn `nuts-kernels` (*Hạt dinh dưỡng* / *Nuts & kernels*) nếu chưa có, bật thẻ trang chủ.
2. Đưa `cashew` và `macadamia` vào nhóm cha — **chỉ khi chúng chưa có cha**, không ghi đè quyết định đã chốt trong CRM.
3. Tạo nhóm nhỏ `macadamia` nếu chưa có.
4. Khai báo `product_fields` cho `cashew` khi đang trống.
5. Điền `grade` còn thiếu từ tên sản phẩm (`W180 … SP`) khi ô này đang trống.

Sau khi chạy, vào `/crm/categories` kiểm tra lại cây danh mục; nội dung tiếng Anh/Việt, ảnh bìa và SEO vẫn sửa bình thường trong CRM.

## 5. Đã bỏ khỏi code

- Danh sách nhóm con viết cứng (`CATEGORY_SUBGROUPS_EN/VI`) trên trang chủ và trang danh mục.
- Chip grade viết cứng cho cashew trong `components/category-product-grid.tsx`.
- Giờ mọi nhóm con và bộ lọc đều đọc từ dữ liệu danh mục trong DB.

## 6. Kiểm thử

```bash
npm run typecheck
node scripts/check-product-attributes.mjs
node scripts/check-auto-category.mjs
node scripts/check-supplier-category-scope.mjs
node scripts/check-buyer-shortlist-copy.mjs
```

Kiểm tra thủ công: `/` (thẻ cha + danh sách nhóm nhỏ), `/products/nuts-kernels` (trang danh mục lớn), `/products/cashew` (nhóm nhỏ + bộ lọc grade).
