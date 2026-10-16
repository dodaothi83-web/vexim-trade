# Phân quyền — ma trận và cách kiểm

Vexim Trade dùng RBAC (`lib/auth/permissions.ts`). Bốn vai trò: **admin**, **sale**,
**sourcing**, **viewer**.

## Ma trận kỳ vọng (dạng bảng)

| Route / nhóm trang              | anon | viewer | sale | sourcing | admin |
| ------------------------------- |:----:|:------:|:----:|:--------:|:-----:|
| `/`, `/rfq`, `/products/*`, `/suppliers/*`, `/blog/*`, `/how-we-verify`, `/for-suppliers`, `/login`, `/setup` | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 |
| `/crm*` (chưa đăng nhập)        | 🔄 307→/login | — | — | — | — |
| `/crm/dashboard`, `/crm/buyers`, `/crm/suppliers`, `/crm/products`, `/crm/mail`, `/crm/rfqs`, `/crm/settings/profile`, `/crm/settings` | — | 👁 200 | ✅ 200 | ✅ 200 | ✅ 200 |
| `/crm/rfqs/[id]` (chi tiết RFQ) | — | 👁 chỉ xem | ✅ thao tác | ✅ thao tác | ✅ thao tác |
| `/crm/buyers/new`               | — | 🚫 307 | ✅ 200 | 🚫 307 | ✅ 200 |
| `/crm/suppliers/new`            | — | 🚫 307 | ✅ 200 | ✅ 200 | ✅ 200 |
| `/crm/products/[id]/edit`       | — | 🚫 307 | ✅ 200 | ✅ 200 | ✅ 200 |
| `/crm/prospects*`               | — | 🚫 307 | ✅ 200 | 🚫 307 | ✅ 200 |
| `/crm/posts*`, `/crm/team`      | — | 🚫 307 | ✅ 200 | 🚫 307 | ✅ 200 |
| `/crm/templates`                | — | 🚫 307 | 🚫 307 | 🚫 307 | ✅ 200 |
| `/crm/mail/compose`             | — | 🚫 307 | ✅ 200 | ✅ 200 | ✅ 200 |
| `/crm/categories`               | — | 🚫 307 | ✅ 200 | ✅ 200 | ✅ 200 |
| `/crm/verifications`            | — | 🚫 307 | 🚫 307 | ✅ 200 | ✅ 200 |
| `/crm/settings/users`           | — | 🚫 307 | 🚫 307 | 🚫 307 | ✅ 200 |

Quyền `*.manage` tự động cấp quyền `*.view` tương ứng (xem `hasPermission` trong
`lib/auth/permissions.ts`).

## Cách chạy kiểm

1. **Kiểm tĩnh** — mọi `"use server"` file phải gọi `guard()` / `requireSession()` ở
   từng action; mọi CRM page phải có `requireSession()` hoặc `requirePagePermission()`:

   ```bash
   node scripts/check-permissions.mjs
   ```

2. **Kiểm smoke anonymous** — public routes trả 200, CRM 307→/login:

   ```bash
   # (bật dev server ở :3000 trước)
   node scripts/check-routes.mjs
   ```

3. **Kiểm runtime theo vai trò** — sinh cookie HMAC thủ công cho 4 user thử nghiệm
   (admin/sale/sourcing/viewer), gọi mọi route và so sánh với ma trận:

   ```bash
   cp .env.local .env.local.bak 2>/dev/null || true
   echo "AUTH_SECRET=vexim-trade-test-secret-0123456789abcdef"  > .env.local
   echo "VEXIM_SHOW_DEMO=true"                                   >> .env.local
   npm run dev &
   sleep 5
   curl -s -o /dev/null http://localhost:3000/        # nạp DB seed
   node scripts/check-role-matrix.mjs
   # Kết quả mong muốn: "✅ Ma trận khớp với khai báo quyền."
   kill %1
   mv .env.local.bak .env.local 2>/dev/null || rm .env.local
   ```

Cả 3 kiểm tra đều chạy **sạch** trước mỗi lần deploy.

## Lỗ hổng đã sửa trong đợt audit này

- `app/crm/rfqs/[id]/actions.ts` và `outreach-actions.ts` đang gọi
  `guard("suppliers.manage")` thay vì `guard("rfq.manage")` — sourcing không có
  `suppliers.manage` (có `rfq.manage`) nên bị chặn nhầm. Đã đổi.
- `app/crm/suppliers/[slug]/verification-actions.ts` export một function thường
  `inVnBounds` từ file `"use server"` khiến Next 16 báo lỗi “Server Actions must be
  async functions” khi render trang supplier chi tiết → tách helper sang
  `lib/verification.ts` và đổi các action trả về `Promise<void>` (throw trên lỗi
  thay vì `return { ok: false }`) để tương thích `formAction`.
- `/crm/rfqs` list dùng `requirePagePermission("rfq.manage")` nên viewer bị đá
  về dashboard dù quyền chỉ xem. Đổi sang `rfq.view` + thêm quyền `rfq.view` cho
  viewer (và tự suy ra từ `rfq.manage`); trang chi tiết RFQ ẩn các form thao tác
  (`canManageRfq`) và hiện thông báo “chế độ chỉ xem”.
- `settings.view` chỉ có admin, ngăn mọi nhân viên (kể cả sale/sourcing) vào
  trang Cài đặt (để xem thông tin cấu hình / đổi chữ ký). Đã cấp cho mọi vai
  trò đăng nhập được; `users.manage` vẫn chặn riêng.
- `supabase/schema.sql` bổ sung `email_messages.rfq_id` / `rfq_match_id` (uuid,
  nullable, foreign key, index) và mở rộng CHECK `kind` cho 3 loại RFQ email
  (`rfq_outreach`/`rfq_followup`/`shortlist_buyer`) để production không lỗi khi
  insert từ block (3).
