# Tài khoản người mua — phương án build tái dùng hạ tầng

Ngày: 2026-11-03 · Bổ sung cho `docs/buyer-account-plan-2026-11.md` (bản phân tích rủi ro).
Bản này trả lời câu: **cái nào đã có thì cắm vào, cái nào thật sự phải viết.**

---

## 0. Nguyên tắc

Hệ thống hiện tại đã có **bốn đường ống dùng chung**. Việc của người mua không cần đường ống
mới, chỉ cần cắm thêm đầu nối:

| Đường ống có sẵn | Cắm thêm gì cho người mua |
| --- | --- |
| `lib/auth/secret.ts` — một `AUTH_SECRET` ký mọi token | Một loại cookie thứ hai, cùng hàm ký |
| `lib/auth/abuse-protection.ts` — bảng `POLICIES` + Upstash + đường lùi | Hai dòng `buyer-sign-in`, `buyer-rfq` |
| `lib/email/send.ts::transport()` — một cửa gửi duy nhất, có chặn bounce | Một hàm soạn thư |
| `lib/db/{types,supabase,local}.ts` — một `DataStore`, hai cài đặt | Hai bảng, sáu hàm |

Nhờ vậy, so với bản phân tích trước, **ba bảng và một cột biến mất**, và một bước build biến mất.

---

## 1. Năm thứ bỏ được so với bản trước

| Bản trước | Vì sao bỏ được | Thay bằng |
| --- | --- | --- |
| Bảng `buyer_saved_products` | Danh sách yêu thích và so sánh đã lưu là **snapshot để hiển thị**, không cần truy vấn theo từng món | `buyer_users.saved jsonb` — một cột, đọc/ghi cùng dòng tài khoản |
| Cột `rfqs.buyer_user_id` | `rfqs.buyer_id → buyers.id`, và `buyers.email` **đã được lưu lowercase** khi tạo (`lib/rfq/submit.ts:287`) | Truy vấn theo email: tìm `buyers.id` của email → lọc RFQ |
| **Bước "claim" RFQ cũ** (§8 bước 6 của bản trước) | Không có gì phải chuyển: RFQ vốn đã thuộc về buyer theo email, xác minh email là đủ điều kiện hiển thị | Xoá hẳn bước 6 |
| Bảng `intent_id` chống gửi trùng | Upstash đã có trong `package.json`; `SET NX` là atomic và có TTL | `SETNX rfq:intent:{uuid}` — 0 thay đổi schema |
| Bảng `buyer_funnel_events` | `audit_log` đã là append-only với `action` + `meta jsonb` | Ghi `buyer_funnel` vào `audit_log`, trang Audit có sẵn để đọc |

Đánh đổi của `saved jsonb`: không truy vấn được "ai đã lưu sản phẩm X" (không cần), và
read-modify-write cần khử đua nếu người dùng mở hai tab. Một người dùng, tần suất thấp —
chấp nhận được; nếu sau này cần thống kê theo sản phẩm thì tách bảng lúc đó, dữ liệu vẫn giữ được.

---

## 2. Bảng mapping: việc → dùng cái gì → thêm cái gì

| # | Việc (theo đề bài) | Dùng lại | Phải viết thêm |
| --- | --- | --- | --- |
| 1 | Phiên người mua 30 ngày | `session.ts`: tách `signPayload`/`verifyPayload` ra khỏi `createSessionToken` (~15 dòng đổi, không đổi hành vi) | `lib/auth/buyer-session.ts` — cookie `vxt_buyer`, payload `{uid,email,exp}`, **không `role`** |
| 2 | Magic link + mã 6 số, 1 lần, 15 phút | Cách `generateAccessToken` đã dùng cho link trạng thái (`lib/rfq/index.ts`) | Bảng `buyer_sign_in_tokens` + `lib/buyer/sign-in-token.ts`: phát (link + code cùng một dòng, **lưu hash**), xác minh bằng `timingSafeEqual`, `attempts >= 5` → huỷ |
| 3 | Chống dò / chống spam gửi thư | `checkAuthRateLimit()` + `POLICIES` | 2 luồng: `buyer-sign-in` (5/giờ mỗi IP, 3/15 phút mỗi email), `buyer-rfq` (đếm theo **tài khoản**, 10/ngày) |
| 4 | Chống bot ở form đăng nhập và form gửi | `FormChallenge` component + `verifyFormChallenge()` | Thêm `"buyer-sign-in"` vào `ChallengePurpose` + `CHALLENGE_PURPOSES` |
| 5 | Gửi thư đăng nhập < 1 phút | `transport()` + `planDelivery()` (chặn bounce) + `wrapPlainEmail()` | `lib/email/buyer-auth.ts` (~70 dòng): tiêu đề, link, mã, hạn 15 phút, câu "nếu bạn không yêu cầu, bỏ qua thư này" |
| 6 | Tài khoản: email, verified_at, company_name, marketing | — | Bảng `buyer_users`; **KHÔNG** đụng `app_users`, **KHÔNG** đụng `buyers` (bảng CRM vẫn là nơi lưu hồ sơ kinh doanh do nhân viên đọc) |
| 7 | "Lần đầu chỉ hỏi Tên công ty" | Trường `buyers.company` đã có sẵn từ RFQ đầu tiên → **điền trước nếu có** | Một prompt sau xác minh, ghi vào `buyer_users.company_name` khi trống |
| 8 | Bỏ 3 ô Company/Name/Email khi đã đăng nhập | `RfqForm` đã có `data` state và `requiredChecks` | Ẩn 3 ô khi có phiên, lấy giá trị từ tài khoản; `requiredChecks` bỏ 3 mục tương ứng |
| 9 | Giữ nội dung đã nhập khi bị chặn | — | `sessionStorage` draft (`vexim:rfq-draft:v1`), khôi phục sau khi đăng nhập; **không** localStorage (dữ liệu khách hàng) |
| 10 | Đăng nhập xong tự gửi tiếp, không gửi trùng | Upstash có sẵn | `SET NX` theo `intent_id`; đường lùi: cùng email + cùng `product_text` trong 90 giây → trả RFQ cũ |
| 11 | `/my`: danh sách yêu cầu + trạng thái + mã | `listRfqs()` + `Rfq.status`, `Rfq.code` | Thêm filter `buyerEmail` vào `listRfqs`; **cần thêm `getBuyerByEmail`** (chưa có) |
| 12 | `/my`: báo giá + bảng so sánh | `RfqMatch.quote_*`, `sent_to_buyer_at`; `components/public/product-comparison-table.tsx` | Một projection `BuyerRfqQuote` kiểu `Pick` (như `SupplierRfqInvitation`) — **không** `internal_note`, **không** liên hệ NCC |
| 13 | `/my`: so sánh đã lưu + link chia sẻ | `/compare?products=a,b` và `parseComparisonIds` đã đủ | Chỉ lưu mảng id trong `saved` jsonb |
| 14 | Yêu thích trước khi đăng nhập | Toàn bộ khuôn của `product-comparison-provider.tsx` (localStorage, `ready`, cap, dedupe) | Provider thứ hai, khoá riêng `vexim:saved-products:v1`; đồng bộ **gộp** (union theo id) khi đăng nhập, không ghi đè |
| 15 | Header: "Sign in" → 2 lựa chọn | `PublicSignInLink` (dùng ở 4 nơi) + `AccountTypeChooser` | Thêm menu; tách `/buyer/sign-in` khỏi `/login` của nhân viên |
| 16 | Câu giới thiệu giá trị ở bước đăng nhập | `AuthSplitShell` (ảnh + khoảng trắng trên, đúng gu đã chốt) + `lib/i18n/auth.ts` | Thêm nhánh `buyerAuth` vào từ điển VI/EN → `check:auth-i18n` phủ luôn |
| 17 | Xoá tài khoản | — | Xoá `buyer_users` (+ token), **giữ** `buyers`/`rfqs`, ghi lý do vào `buyers.notes`; hiện đúng câu đó trước khi bấm |
| 18 | Đo phễu §8 | `audit_log` + trang Audit có sẵn | `lib/buyer/funnel.ts` (~40 dòng), 3 điểm ghi: form mở, chặn vì chưa đăng nhập, gửi xong (+ `source`) |
| 19 | Noindex `/my`, `/buyer` | `middleware.ts::ALWAYS_NOINDEX_PREFIXES` | Thêm 2 tiền tố |

---

## 3. Code mới thật sự

| File | Việc | Ước lượng |
| --- | --- | --- |
| `lib/auth/buyer-session.ts` | Cookie `vxt_buyer`, đọc/ghi/kết thúc phiên | ~90 |
| `lib/buyer/sign-in-token.ts` | Phát + xác minh link/mã, hạn 15 phút, 5 lần thử | ~120 |
| `lib/buyer/accounts.ts` | Tìm/tạo theo email, company lần đầu, `saved`, xoá | ~120 |
| `lib/buyer/funnel.ts` | Ghi `audit_log` | ~40 |
| `lib/email/buyer-auth.ts` | Thư magic link + mã | ~70 |
| `app/(public)/buyer/sign-in/page.tsx` | Dùng `AuthSplitShell`, câu giới thiệu §6 | ~80 |
| `components/buyer-sign-in-form.tsx` | Email → gửi; nhập mã 6 số; `FormChallenge` | ~160 |
| `app/(public)/my/page.tsx` + 2 component | Yêu cầu, báo giá, so sánh, yêu thích, tuỳ chọn | ~350 |

**~1.000 dòng mới**, trong đó 1/3 là giao diện.

## 4. Sửa file cũ

| File | Sửa gì | Ước lượng |
| --- | --- | --- |
| `lib/db/types.ts` | 6 hàm: `getBuyerUserByEmail`, `createBuyerUser`, `updateBuyerUser`, `deleteBuyerUser`, `createSignInToken`, `consumeSignInToken`, `getBuyerByEmail` | ~15 |
| `lib/db/supabase.ts` | Cài đặt 7 hàm | ~120 |
| `lib/db/local.ts` | Cài đặt 7 hàm + `migrateBuyerUserDefaults` cho file JSON cũ | ~90 |
| `supabase/schema.sql` + 1 migration | `buyer_users`, `buyer_sign_in_tokens` (+ index `lower(email)` unique) | ~60 |
| `lib/auth/session.ts` | Tách hàm ký, không đổi hành vi | ~15 |
| `lib/auth/abuse-protection.ts` | 2 luồng | ~10 |
| `lib/security/challenge.ts` | 1 purpose | ~3 |
| `app/(public)/rfq/rfq-form.tsx` | Ẩn 3 ô khi có phiên, draft, `intent_id` | ~80 |
| `lib/rfq/submit.ts` | Nhận phiên, khoá chống trùng, bỏ yêu cầu 3 ô khi có phiên | ~30 |
| `components/public-sign-in-link.tsx` + `public-header-controls.tsx` | Menu 2 lựa chọn / menu người mua | ~60 |
| `app/(auth)/register/account-type-chooser.tsx` + `lib/i18n/auth.ts` | Buyer card trỏ `/buyer/sign-in`; thêm `buyerAuth` VI/EN; xoá 6 chuỗi "no account needed" | ~90 |
| 3 guard + docs | Đảo quy tắc, viết lại sơ đồ luồng A | ~60 |

**~630 dòng sửa.**

## 5. Cỡ việc

| | Bản trước | Phương án này |
| --- | --- | --- |
| Bảng mới | 3 | **2** |
| Cột mới trên bảng cũ | 2 | **0** |
| Bước build | 9 | **7** (mất bước claim) |
| Tổng dòng | — | ~1.630 |
| Thời gian | 4–6 ngày | **3–4 ngày** |

## 6. Thứ tự build (mỗi bước một commit, một PR)

**Tiến độ:** ① xong (`09d8519`), ② xong (`85e7c3a`) — PR #81. Đăng nhập chạy thật trên dev
server: phát mã, nhập sai, nhập đúng, dùng lại, link, link dùng lại, tạo/đọc/xoá tài khoản.
Còn ③④⑤⑥⑦.

1. **Nền dữ liệu**: 2 bảng, 7 hàm store, `getBuyerByEmail`, migration. Chưa có giao diện.
2. **Đăng nhập**: `sign-in-token`, `buyer-session`, abuse-protection, challenge purpose, thư, trang
   `/buyer/sign-in`, form mã 6 số. *Đây là bước dài nhất; dừng lại cho bạn thử luồng thật.*
3. **Cổng gửi**: ẩn 3 ô khi có phiên, draft `sessionStorage`, `intent_id`, chặn khi chưa đăng nhập,
   gợi ý Tên công ty lần đầu.
4. **Header + i18n + guard**: "Sign in" 2 lựa chọn, `/register` buyer card, đảo 6 chuỗi, sửa 3 guard.
5. **`/my`**: yêu cầu + báo giá + so sánh báo giá + tuỳ chọn (email mặc định TẮT, xoá tài khoản).
6. **Yêu thích**: provider localStorage → đồng bộ gộp khi đăng nhập; so sánh đã lưu + link chia sẻ.
7. **Đo phễu + docs**: 3 điểm ghi `audit_log`, trang Audit, `rfq-van-hanh.md`, chính sách bảo mật.

Bước 1–2 độc lập, có thể làm ngay mà không đụng form gửi hay header — nghĩa là nếu bạn muốn xem
luồng đăng nhập chạy thật trước rồi mới quyết tiếp, mình dừng đúng chỗ đó được.

## 7. Ba rủi ro còn lại sau khi tối ưu (đã ghi ở bản phân tích, nhắc lại cho đủ)

1. **Gửi trùng** khi tự gửi tiếp — chặn bằng `SET NX` (bước 3). Không làm bước 3 cùng lúc với
   bước 2 thì đừng bật tự-gửi-tiếp.
2. **Mã 6 số bị dò** — 5 lần sai huỷ token + rate limit theo email; so sánh hash `timingSafeEqual`.
3. **`saved` jsonb ghi đè** khi hai tab cùng lưu — chấp nhận; ghi theo kiểu đọc-sửa-ghi và
   luôn gửi kèm `updated_at` cũ để phát hiện lệch.

## 8. Cần bạn chốt (rút gọn từ 8 câu còn 4)

| # | Câu hỏi | Đề xuất |
| --- | --- | --- |
| 1 | Giữ PoW tự chủ, không thêm Turnstile? | **Giữ PoW** — đã có tài liệu, không phụ thuộc ngoài |
| 2 | Phiên 30 ngày? | **30 ngày**, trượt hạn mỗi lần dùng |
| 3 | Câu hỏi trực tiếp cho NCC cũng phải đăng nhập? | **Có** — cùng đường gửi, cùng lý do |
| 4 | Yêu thích lưu `jsonb` trên tài khoản (thay vì bảng riêng)? | **Có** — đủ dùng, ít code hơn hẳn; tách bảng sau nếu cần thống kê |

Bạn chốt 4 câu này thì mình bắt đầu bước 1 và 2 ngay trong nhánh này.
