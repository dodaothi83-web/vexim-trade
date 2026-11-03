# Tài khoản người mua + `/my` — phân tích trước khi build

Ngày: 2026-11-03 · Nhánh: `arena/1e84407a-vexim-trade` · Gộp chung nhánh với "Yêu thích"
Đối chiếu với code tại `fd13383`.

> **Đọc kèm `docs/buyer-account-build-map-2026-11.md`.** Bản đó là phương án thi công tái dùng
> hạ tầng: bỏ 3 bảng và 1 cột so với bản này (yêu thích lưu `jsonb` trên tài khoản, truy vấn theo
> `buyers.email` thay vì `buyer_user_id`, chống gửi trùng bằng Upstash `SET NX`, đo phễu ghi vào
> `audit_log`). Nhờ vậy bước "claim" ở §8 biến mất. Bản này giữ nguyên giá trị ở phần rủi ro (§4).

---

## 1. Kết luận

**Làm được, và phần lớn hạ tầng đã có sẵn.** Phiên bản đề bài này không cần xây một hệ thống
xác thực mới: đã có phiên cookie ký HMAC, đã có giới hạn lượt chạy trên Upstash với đường lùi,
đã có challenge chống bot tự chủ, đã có Resend + chống bounce, đã có `/compare?products=…` làm
link chia sẻ, và mô hình `RfqMatch.quote_*` + `sent_to_buyer_at` đã đủ dữ liệu cho màn "báo giá
đã nhận".

Ba việc phải **chỉnh lại so với đề bài**, vì code hiện tại không giống giả định trong đề:

1. **Không có Turnstile** trong hệ thống, và đây là lựa chọn có chủ ý từ trước: `docs/authentication-security.md`
   ghi rõ challenge chống bot là proof-of-work tự chủ vì "*KHÔNG còn phụ thuộc dịch vụ ngoài
   (Cloudflare) nên không có trạng thái mất kết nối*". Đề xuất: **giữ PoW**, không thêm Turnstile.
2. **"Không cần đăng nhập để gửi RFQ" đang là quy tắc đã được khoá bằng 3 guard script + 6 chuỗi
   trong từ điển.** Đề bài đảo quy tắc này → phải sửa cả code, cả chuỗi, cả guard, cả tài liệu.
   Đây là chi phí thật, không phải chi tiết nhỏ.
3. **"Giới hạn theo tài khoản/IP mỗi ngày"** không dùng được `lib/rfq/rate-limit.ts` (Map trong
   bộ nhớ — mỗi lambda Vercel một bản). Phải dùng `lib/auth/abuse-protection.ts` (Upstash).

Và **một rủi ro lớn nhất của cả kế hoạch**: yêu cầu "đăng nhập xong tự gửi tiếp". Form RFQ một
trang giữ ~15 ô; nếu làm sai, người dùng bấm gửi hai lần sẽ có **hai RFQ trùng** trong CRM, mã
RFQ khác nhau, hai email xác nhận. Hiện `lib/rfq/submit.ts` sinh mã mới ở mỗi lần gọi và không
có khoá chống trùng. Xem §4.1.

---

## 2. Đã có sẵn — dùng lại, không xây mới

| Việc trong đề bài | Thứ đã có | Ghi chú khi dùng |
| --- | --- | --- |
| Phiên đăng nhập | `lib/auth/session.ts` — cookie `vxt_session`, HMAC-SHA256, `HttpOnly`, `SameSite=Lax`, `Secure` theo giao thức thật | **Không nhét buyer vào đây.** Xem §3.1 |
| Giới hạn lượt | `lib/auth/abuse-protection.ts` — `POLICIES` theo luồng, Upstash + đường lùi trong bộ nhớ, khoá theo IP và theo IP+email | Thêm luồng `buyer-sign-in` và `buyer-rfq` vào `POLICIES` là xong phần khung |
| Chống bot | `lib/security/challenge.ts` — PoW ký HMAC, salt tiêu một lần, hạn 15 phút, `CHALLENGE_DISABLED` để tắt khẩn cấp | Thêm `"buyer-sign-in"` vào `ChallengePurpose` + `CHALLENGE_PURPOSES` |
| Gửi email | `lib/email/send.ts::transport()` + Resend + `planDelivery()` chặn địa chỉ đã bounce | Gửi magic link **phải đi qua `planDelivery`**, đừng gọi Resend trực tiếp |
| Email đã từng gửi RFQ | `lib/rfq/submit.ts` upsert `buyers` theo email (dòng ~330) | "Claim" chỉ là truy vấn `buyer_users.email = buyers.email` |
| Link trạng thái cũ | `/rfq/status/[token]` + `getRfqByToken` | Không đụng vào — điều kiện nghiệm thu "link token cũ vẫn mở được" tự thoả |
| Báo giá + so sánh báo giá | `RfqMatch` có `quote_price/currency/unit/incoterm/lead_time_days/valid_until/file_id` + `sent_to_buyer_at` | `/my` chỉ đọc, **không cần schema mới** |
| So sánh đã lưu + link chia sẻ | `/compare?products=a,b` đã là link chia sẻ được; `parseComparisonIds` đã chặn id rác | "Lưu so sánh" = lưu mảng id |
| Yêu thích trước khi đăng nhập | `components/product-comparison-provider.tsx` — localStorage `vexim:product-comparison:v1`, cap, dedupe, `ready` flag | Sao chép nguyên khuôn, **khoá riêng** `vexim:saved-products:v1`, không dùng chung state với compare |
| Đo phễu | Chưa có. `@vercel/speed-insights` và `gtag` (chỉ ở `cashew-landing`, phụ thuộc consent) | Xem §6 — đề xuất bảng đếm riêng thay vì gtag |

---

## 3. Phần phải làm mới, và chi phí thật

### 3.1 Phiên người mua phải là **cookie riêng**, không dùng lại `vxt_session`

`lookupSession()` đọc cookie rồi **đối chiếu với bảng `app_users`** và trả `miss: "not_found"`
nếu không thấy. Nếu nhét buyer vào cùng cookie:

- mỗi lần buyer tải trang, hệ thống truy vấn `app_users` và coi là lỗi → đá về `/login`;
- `guard()`/`requireSession()` (đang bảo vệ CRM + cổng NCC) sẽ phải thêm nhánh buyer, tức là
  sửa đúng chỗ nhạy cảm nhất của hệ thống phân quyền.

**Đề xuất:** `lib/auth/buyer-session.ts`, cookie `vxt_buyer`, payload `{ uid, email, exp }`,
**không có `role`**. 30 ngày (không phải 60). Không import chéo với `session.ts`; chỉ dùng chung
`getAuthSecret()` và hàm ký HMAC. Cách này khiến "Không có bản ghi nào của người mua nằm trong
`app_users`" trở thành **đúng theo cấu trúc**, không phải theo kỷ luật.

### 3.2 Mỗi bảng mới = 5 file, không phải 1

Tầng dữ liệu có hai cài đặt song song (`lib/db/supabase.ts` 1.685 dòng và `lib/db/local.ts`
2.513 dòng ghi ra `data/local-db.json`). Thêm một thực thể phải sửa:

1. `lib/db/types.ts` — khai báo trong `DataStore`;
2. `lib/db/supabase.ts` — câu SQL;
3. `lib/db/local.ts` — mảng trong JSON + `migrate…Defaults` cho file dữ liệu cũ;
4. `supabase/schema.sql` — bảng cho môi trường mới;
5. `supabase/migrations/YYYYMMDD_….sql` — bảng cho môi trường đang chạy.

Cho 3 bảng dưới đây là ~15 điểm sửa. **`listRfqs()` hiện chỉ lọc theo `status` và `assignedTo`,
không có `buyerId`** → phải thêm tham số, nếu không `/my` phải tải toàn bộ RFQ rồi lọc.

### 3.3 Ba bảng đề xuất (bản phân tích; phương án thi công rút còn 2 — xem tài liệu build-map)

```sql
buyer_users
  id uuid pk, email text (unique lower), company_name text null,
  verified_at timestamptz null, marketing_opt_in bool default false,
  created_at, last_seen_at

buyer_login_tokens            -- cả link và mã 6 số, cùng một dòng
  id uuid pk, buyer_email text,        -- chưa có buyer_users thì vẫn phát được
  link_hash text, code_hash text,      -- lưu HASH, không lưu plaintext
  attempts int default 0, expires_at, consumed_at, created_at, ip_hash

buyer_saved_products          -- Yêu thích + so sánh đã lưu
  id uuid pk, buyer_user_id uuid fk, kind text ('product'|'comparison'),
  product_id uuid null, product_ids uuid[] null,
  created_at,  unique (buyer_user_id, product_id)
```

Bản thi công bỏ `buyer_saved_products` (thay bằng `buyer_users.saved jsonb`) và bỏ cột
`rfqs.buyer_user_id` (truy vấn theo `buyers.email`, vốn đã lưu lowercase) — xem build-map §1.

### 3.4 Hai đầu việc dễ bị coi nhẹ

- **Đăng nhập giữa lúc gửi** (đề bài §1) — xem §4.1, đây là phần khó nhất về mặt kỹ thuật.
- **Header** — `PublicSignInLink` được dùng ở 4 chỗ (`public-header-controls.tsx` ×2,
  `app/(legal)/layout.tsx`, `app/blog/layout.tsx`), cộng `/login` đang `redirect` supplier về
  cổng NCC. Người mua **không được** rơi vào `/login` của nhân viên. Phải thêm
  `/buyer/sign-in` riêng và cho `middleware.ts` noindex `/buyer`, `/my`
  (`ALWAYS_NOINDEX_PREFIXES`).

---

## 4. Rủi ro, xếp theo mức thiệt hại

### 4.1 Gửi trùng khi "đăng nhập xong tự gửi tiếp" — **rủi ro số 1**

Kịch bản: người dùng bấm Send → chuyển sang đăng nhập → quay lại → form tự gửi. Nếu lần tự gửi
chạy 2 lần (React StrictMode, mạng chập chờn, người dùng bấm lại, F5 sau khi gửi thành công
nhưng trang lỗi):

- 2 RFQ, 2 mã RFQ, 2 email xác nhận cho người mua, 2 việc cho desk;
- người mua tưởng mình gửi hỏng nên gửi thêm lần nữa.

**Cách chặn (bắt buộc, làm cùng lúc với §4.1):** sinh `intent_id` (UUID) ở client **trước** khi
hiện bước đăng nhập, gửi kèm payload; server kiểm `intent_id` đã dùng chưa → trả lại RFQ cũ thay
vì tạo mới. Bản thi công dùng Upstash `SET NX` (TTL 10 phút, lưu id RFQ vừa tạo) nên **không cần
cột mới**; đường lùi khi không có Upstash: cùng email + cùng `product_text` trong 90 giây → trả
RFQ cũ. Không có bước này thì không nên làm tính năng tự gửi tiếp.

Kèm theo: token PoW **tiêu một lần** — sau khi quay lại từ đăng nhập phải phát challenge mới;
draft phải lưu `sessionStorage` (không phải localStorage: dữ liệu khách hàng không nên sống
lâu hơn phiên trình duyệt).

### 4.2 Mã 6 số bị dò

6 chữ số = 1 triệu khả năng. Nếu không giới hạn theo token, một script có thể dò hết trong vài
phút. Bắt buộc: `attempts` trên token, **5 lần sai thì huỷ token**, và luồng `buyer-sign-in` trong
`POLICIES` (gợi ý: 5 lượt/giờ mỗi IP, 3 lượt/15 phút mỗi email). So sánh hash phải `timingSafeEqual`.

### 4.3 Rò dữ liệu qua `/my`

`/my` là màn hình đầu tiên của người mua **đọc** dữ liệu nội bộ. Ba luật:

- mọi truy vấn lọc bằng `buyer_user_id` **từ phiên**, không bao giờ nhận id từ URL/body;
- chỉ hiện match có `sent_to_buyer_at` (báo giá đã được duyệt gửi) — không hiện match `proposed`;
- projection kiểu `Pick` như `SupplierRfqInvitation` đã làm: **không** `internal_note`, **không**
  email/điện thoại NCC, không `spam_score`.

### 4.4 NCC lập tài khoản người mua để xem giá đối thủ

Đây là lỗ hổng thật của mọi sàn có báo giá: supplier A đăng ký buyer, gửi RFQ, nhận giá của B.
Hai lớp đang có sẵn để chặn: (a) desk **vẫn duyệt trước khi gửi NCC** — giữ nguyên, đó là chốt
thật; (b) giới hạn số RFQ/ngày theo tài khoản. Nên ghi rõ trong tài liệu vận hành rằng chốt
duyệt của desk là kiểm soát bảo mật, không chỉ là bước chăm sóc khách.

### 4.5 Xoá tài khoản — phải định nghĩa trước khi làm nút

"Xoá tài khoản" không thể xoá RFQ: đó là chứng từ kinh doanh, đối chiếu với NCC và hoá đơn dịch
vụ. Đề xuất: xoá `buyer_users` + `buyer_saved_products` + token, **giữ** `buyers`/`rfqs` và ghi
vào `buyers.notes` là "tài khoản đã xoá theo yêu cầu, ngày …", sau đó hiện đúng câu đó cho
người dùng đọc trước khi bấm. Cần sửa `docs` + trang chính sách bảo mật.

### 4.6 Thư magic link vào Spam

Đây là rủi ro vận hành, không phải code: domain mới gửi thư transactional có link đăng nhập rất
dễ vào Spam/Promotions. Đề bài yêu cầu "< 1 phút" — Resend đáp ứng được, nhưng hộp thư đến thì
không hứa được bằng code. Việc cần làm là DNS (SPF/DKIM/DMARC) + theo dõi bounce/complaint của
Resend, và **mã 6 số chính là phương án dự phòng đúng** khi thư vào Spam nhưng vẫn đọc được, hoặc
khi máy quét link của công ty mở link trước người dùng. Thiết kế này giữ nguyên.

---

## 5. Chỗ đề bài lệch với code hiện tại (phải sửa, đừng làm ngơ)

| Chỗ | Hiện tại | Phải làm |
| --- | --- | --- |
| §7 "Turnstile ẩn" | Không có Turnstile; PoW tự chủ là kiểm soát đã ghi trong `docs/authentication-security.md` | Giữ PoW. Nếu vẫn muốn Turnstile thì đó là **thêm** một phụ thuộc ngoài vào đường gửi RFQ — trái với quy tắc "AI/dịch vụ ngoài không nằm trên đường tới hạn" |
| §1 "bắt buộc đăng nhập mới gửi" | Quy tắc cũ: guest-first, khoá bằng `check-register-chooser.mjs` (`/No account needed/i`), `check-public-sign-in.mjs`, `check-rfq-form-states.mjs`; 6 chuỗi trong `lib/i18n/auth.ts` (`noSignInNeeded`, `buyerSummary`, `noSignInNeeded` VI/EN, `buyerNote`, dòng 363) | Đảo toàn bộ: chuỗi, guard, `app/(auth)/register/account-type-chooser.tsx` (buyer đang trỏ `/rfq`), `app/(public)/products/[slug]/page.tsx:812` ("Free, no account needed") |
| §1 "Request quotes từ bảng so sánh" | `/compare` có CTA riêng | CTA đó cũng phải qua cổng đăng nhập — dễ bỏ sót vì nằm ngoài `/rfq` |
| Câu hỏi trực tiếp NCC | Cùng `submitRfq()` với `inquiry_kind: "supplier_question"` | Quyết định: chặn cả câu hỏi hay chỉ chặn báo giá? Đề xuất **chặn cả hai** (cùng một đường gửi, cùng lý do chống rác) |
| `docs/rfq-van-hanh.md` §2 | "NGƯỜI MUA (không cần đăng nhập)" | Viết lại sơ đồ luồng A |
| `/register` buyer card | "Buyer accounts are still being built" | Đổi thành lối vào tạo tài khoản người mua |

---

## 6. Đo phễu (§8) — đề xuất khác gtag

`gtag` chỉ chạy sau khi người dùng đồng ý cookie (`components/cookie-consent.tsx`), nên số đo
sẽ **thiếu đúng nhóm người từ chối** và tỷ lệ chuyển đổi sẽ sai lệch. Đề xuất: bảng
`buyer_funnel_events` ghi ở server, không cookie, không IP, không định danh cá nhân:

```
at timestamptz, step text ('form_open'|'submit_blocked'|'signin_sent'|'signin_ok'|'rfq_sent'),
source text ('modal_1_supplier'|'compare'|'rfq_page'|'rfq_menu'), buyer_user_id uuid null
```

- 3 điểm ghi: form mở, bấm gửi khi chưa đăng nhập, RFQ tạo xong.
- Báo cáo: 1 trang CRM, đếm theo ngày + nguồn. Khớp đúng câu trong chính sách bảo mật hiện tại
  ("page-view reports are approximate; they do not identify unique buyers").
- Đây là cách duy nhất trả lời được "bao nhiêu người bỏ đi ở bước đăng nhập" mà không cần
  Google Analytics.

---

## 7. Cần bạn chốt trước khi mình viết dòng đầu tiên

| # | Câu hỏi | Đề xuất của mình |
| --- | --- | --- |
| 1 | PoW tự chủ hay thêm Turnstile? | **Giữ PoW** — không phụ thuộc ngoài, đã có tài liệu, đã có đường tắt khẩn cấp |
| 2 | Phiên nhớ 30 hay 60 ngày? | **30 ngày**, trượt hạn mỗi lần dùng. Cookie không mật khẩu giữ 60 ngày là quá dài nếu máy bị mượn |
| 3 | Câu hỏi trực tiếp NCC có phải đăng nhập? | **Có** — cùng một đường gửi, cùng lý do chống rác và chống do thám giá |
| 4 | Xoá tài khoản thì RFQ thế nào? | Giữ RFQ, xoá tài khoản, ghi chú lý do; nói rõ trước khi bấm |
| 5 | `intent_id` chống gửi trùng — làm ngay hay để sau? | **Ngay**, cùng PR với cổng đăng nhập. Không có nó thì tự-gửi-tiếp là bẫy |
| 6 | Đo phễu bằng gtag hay bảng riêng? | **Bảng riêng** ở server (§6) |
| 7 | Google/Microsoft đăng nhập | Để đợt sau, đúng như bạn nói. Không đưa vào nhánh này |
| 8 | "Messages" trong `/my` | Để đợt sau, đúng như bạn nói |

---

## 8. Thứ tự build (mỗi bước một PR, commit tiếng Việt như các nhánh trước)

| # | Nội dung | Chạm vào | Cỡ |
| --- | --- | --- | --- |
| 1 | Ba bảng + `buyer_user_id`/`intent_id` trên `rfqs` + `listRfqs({buyerId})` | 5 file dữ liệu, 1 migration | Vừa |
| 2 | Magic link + mã 6 số: phát, xác minh, phiên `vxt_buyer`, hạn 15 phút, 5 lần thử, rate limit, PoW, mẫu email | `lib/auth/buyer-*`, 2 route, email template, `abuse-protection`, `challenge` | **Lớn nhất** |
| 3 | Cổng gửi: chặn khi chưa đăng nhập, lưu/nhận draft, `intent_id`, bỏ 3 ô company/name/email khi đã đăng nhập, hỏi Tên công ty lần đầu | `rfq-form.tsx`, `submit.ts`, `actions.ts` | Lớn |
| 4 | Header + lối vào: "Sign in" 2 lựa chọn, menu người mua, `/register` buyer card, đảo toàn bộ chuỗi + 3 guard "no account needed" | `public-sign-in-link`, `public-header-controls`, 2 layout, `lib/i18n/auth.ts`, 3 script | Vừa |
| 5 | `/my`: yêu cầu + trạng thái + mã, báo giá đã nhận + bảng so sánh, xoá tài khoản, đăng xuất, tuỳ chọn email | trang mới + projection `BuyerRfqQuote` | Vừa |
| ~~6~~ | ~~Claim khi xác minh email~~ — **bỏ**: RFQ vốn thuộc buyer theo email, truy vấn trực tiếp | — | — |
| 7 | Yêu thích: localStorage → đồng bộ khi đăng nhập (gộp, không ghi đè) + so sánh đã lưu + link chia sẻ | provider mới, `product-card`, `/my` | Vừa |
| 8 | Đo phễu + báo cáo CRM | `audit_log` sẵn có, 3 điểm ghi | Nhỏ |
| 9 | Tài liệu + chính sách: `rfq-van-hanh.md`, `authentication-security.md`, chính sách bảo mật (xoá tài khoản) | docs + 1 trang legal | Nhỏ |

Ước lượng thẳng: **đây là 4–6 ngày làm việc**, không phải một buổi. Bước 2 và 3 là hai phần khó
và dễ sai nhất; bước 4 sẽ làm đỏ khoảng 3 guard script và đó là dấu hiệu tốt (guard đang làm
đúng việc).

## 9. Nghiệm thu → kiểm tự động

| Tiêu chí trong đề bài | Cách kiểm |
| --- | --- |
| Khách chưa đăng nhập vẫn xem/so sánh/tải PDF | guard hiện có + 1 script render `/products`, `/compare`, không có phiên |
| Bấm gửi khi chưa đăng nhập → hiện bước đăng nhập | script khẳng định `submitRfq` trả `needs_sign_in` khi không có phiên; trang `/buyer/sign-in` render |
| Đăng nhập xong gửi đi đúng nội dung đã nhập | unit test draft serialize → restore (không mất ô nào) |
| Gửi hai lần không tạo hai RFQ | test gọi `submitRfq` hai lần cùng `intent_id` → 1 RFQ |
| Mã 6 số trên máy khác máy mở email | test xác minh bằng code với token đã tạo qua link hash khác |
| Sai mã 5 lần → token chết | test `attempts` |
| Email đã từng gửi RFQ → thấy đủ RFQ cũ trong `/my` | test claim: tạo buyer+rfq chưa có account → verify email → `listRfqs({buyerId})` đủ |
| Link token cũ vẫn mở | guard hiện có của `/rfq/status/[token]` |
| Không có người mua nào trong `app_users` | `check-permissions`-kiểu: grep `app/crm`, `lib/auth/session.ts` không import buyer store; test `createBuyerUser` không chạm `store.createUser` |
