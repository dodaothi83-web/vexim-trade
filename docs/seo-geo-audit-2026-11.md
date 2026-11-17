# Rà soát SEO & GEO — 16 tháng 11 năm 2026

Phạm vi: mã nguồn trong kho, đối chiếu trực tiếp với bản đang chạy tại https://www.veximtrade.com, kèm kiểm chứng bằng bản build production tại máy (cả hai chế độ `PUBLIC_SITE_INDEXABLE=false` và `true`).

Tài liệu này nối tiếp `docs/ai-readability-audit.md` (19/10/2026). Đợt trước kết luận "khung kỹ thuật đã sẵn sàng, nút thắt nằm ở dữ liệu". Đợt này dữ liệu đã có (8 danh mục, ~35 sản phẩm, 24 hồ sơ nhà cung cấp trong sitemap), nên rà soát tập trung vào những chỗ khung kỹ thuật còn lệch — và tìm ra vài lỗi thật đang ảnh hưởng trực tiếp tới hiển thị.

## Kết luận tóm tắt

Khung SEO/GEO nhìn chung tốt hơn nhiều dự án cùng quy mô: render phía máy chủ, JSON-LD đúng nguyên tắc "không bịa giá, không bịa đánh giá", robots.txt khai báo tường minh từng nhóm bot AI, có `llms.txt`, có script kiểm tra sau deploy. Vấn đề không nằm ở thiếu hạ tầng mà ở **tính nhất quán giữa các nguồn tín hiệu**: tiêu đề bị lặp tên thương hiệu, robots/middleware/sitemap nói khác nhau về cùng một URL, hreflang khai báo cho bản dịch không tồn tại, và một chuyển hướng 301 cũ đang chặn chính trang đích quảng cáo.

Ba lỗi nặng nhất đã sửa trong đợt này:

1. **Tiêu đề lặp tên thương hiệu** trên toàn bộ trang con: `"How it works for buyers | Vexim Trade · Vexim Trade"`. Nguyên nhân: trang tự ghép `| Vexim Trade` rồi template ở layout gốc ghép thêm ` · Vexim Trade`.
2. **`/cashew` bị 301 sang một trang 404.** Đây là trang đích quảng cáo; redirect cũ trỏ tới `/products/cashew`, một slug đã đổi thành `cashew-kernels`. Toàn bộ ngân sách quảng cáo trỏ vào `/cashew` mất tham số `utm_*`/`gclid` qua redirect và rơi vào 404.
3. **`/cookie-policy` và `/platform-rules` bị gắn `X-Robots-Tag: noindex`** trong khi robots.txt cho phép bot đọc — hai tín hiệu ngược nhau cho cùng một URL, và `/platform-rules` còn thiếu hẳn trong sitemap.

## 1. Tiêu đề và thương hiệu

| Trước | Sau |
| --- | --- |
| `How it works for buyers \| Vexim Trade · Vexim Trade` | `How it works for buyers · Vexim Trade` |
| `For suppliers – Get listed on Veximtrade · Vexim Trade` | `For suppliers – get listed · Vexim Trade` |
| `News \| Veximtrade · Vexim Trade` | `News · Vexim Trade` |
| `… \| Vietnam Cashew kernels \| Vexim Trade · Vexim Trade` (tiêu đề sản phẩm dài 150+ ký tự) | `{tên sản phẩm} – {danh mục}, Vietnam · Vexim Trade` |

Cách sửa: thêm `pageTitle()` trong `lib/site.ts`, trả `{ absolute }` để Next.js **không** ghép template `%s · Vexim Trade` thêm lần nữa, đồng thời tự bỏ hậu tố thương hiệu nếu trang đã lỡ viết sẵn. Mọi trang tự dựng tiêu đề đều đi qua hàm này.

Kèm theo: thống nhất cách viết tên thương hiệu. Trước đây tồn tại song song "Vexim Trade" và "Veximtrade" ở 34 chỗ (tiêu đề, `siteName`, `aria-label`, câu đồng ý xử lý dữ liệu trong form RFQ, tên tác giả mặc định của bài viết). Đã chuẩn hoá về "Vexim Trade" — đây là tên hiển thị công khai, cũng là tên xuất hiện trong `Organization.name` và trong thư gửi buyer, nên việc viết hai kiểu làm yếu tín hiệu thực thể (entity) mà Google và các hệ thống AI dùng để nhận diện doanh nghiệp.

## 2. Trang đích quảng cáo `/cashew`

Đây là lỗi có tác động thương mại trực tiếp.

- `next.config.ts` có redirect 301 `/cashew` → `/products/cashew`. Nhưng slug danh mục đã đổi thành `cashew-kernels` và `cashew` không nằm trong `previous_slugs`, nên đích đến là 404.
- Hệ quả: quảng cáo Google trỏ `veximtrade.com/cashew?utm_source=…&gclid=…` mất toàn bộ tham số qua redirect, rồi rơi vào 404. Form RFQ gắn nguồn lead `"Website veximtrade.com/cashew"` nên việc đối chiếu chi phí quảng cáo với lead thật (mục đích của `TRACKED_PARAMS`) cũng hỏng.
- Đồng thời canonical của `app/cashew/page.tsx` trỏ về chính `/cashew` — tức trang tự khai mình là bản chính trong khi bị redirect vĩnh viễn.

Đã sửa: bỏ redirect cho đường dẫn gốc, chỉ giữ cho đường dẫn con (`/cashew/:path+` → `/products/cashew-kernels`). Dùng `:path+` chứ không phải `:path*` vì dạng `*` khớp cả đường dẫn rỗng — chính là `/cashew`.

Đã thêm: `/products/cashew` (URL cũ đã từng được Google lập chỉ mục) chuyển hướng 301 sang `/products/cashew-kernels` ngay trong trang danh mục, phòng trường hợp dữ liệu chưa có slug cũ trong `previous_slugs`.

Đã thêm: `robots: { index: false, follow: true }` cho `/cashew`. Trang đích quảng cáo trùng chủ đề với trang danh mục thật; để cả hai cùng index là tự tạo cannibalization — hai URL tranh nhau cùng một truy vấn, trong khi trang danh mục có nội dung đầy đủ hơn (giá tham khảo, bộ lọc grade, sản phẩm). Giữ `follow: true` để khách từ quảng cáo vẫn truyền được tín hiệu liên kết sang trang danh mục và trang RFQ. Nếu muốn trang này hiển thị trên tìm kiếm, cần làm ngược lại: mở index và thêm nội dung khác biệt thật (bảng giá theo grade, chứng nhận, thời gian giao) để không trùng với danh mục.

## 3. robots.txt, middleware và sitemap nói khác nhau

Ba nơi này phải nói cùng một chuyện về trang pháp lý, nhưng đang lệch:

| URL | robots.txt | Middleware | sitemap |
| --- | --- | --- | --- |
| `/cookie-policy` | Cho phép | **noindex** | Có |
| `/platform-rules` | Không khai | **noindex** | **Không có** |

Đã sửa: đồng bộ cả ba danh sách, bổ sung `/cookie-policy` và `/platform-rules`. Bổ sung `platform-rules` vào sitemap để cặp song ngữ Anh–Việt (`/platform-rules` ↔ `/quy-che-hoat-dong`) lộ đủ hai nửa. Trong robots.txt chế độ tiền ra mắt, cho phép thêm `/robots.txt`, `/sitemap.xml`, `/llms.txt` — những tệp mà chính bot cần đọc để biết được phép đọc gì.

Đã thêm kiểm tra tự động (xem mục 7) để ba danh sách này không lệch lại.

## 4. hreflang khai báo cho bản dịch không tồn tại

Trang danh mục khai `alternates.languages.vi = /products/{slug}?lang=vi` **vô điều kiện**. Nhưng `t()` cố tình rơi về tiếng Anh khi thiếu bản dịch — nên với danh mục chưa có bản tiếng Việt, URL `?lang=vi` trả nội dung tiếng Anh mà vẫn tự nhận là bản `vi`. Đây là cặp alternate sai: Google có thể gộp hai URL làm một hoặc bỏ qua cả cụm hreflang.

Đã sửa: thêm `hasTranslation()` vào `lib/public/i18n.ts`; chỉ khai alternate `vi` khi danh mục thực sự có `name_i18n.vi` / `seo_title_i18n.vi` / `seo_desc_i18n.vi`. Áp dụng cùng điều kiện ở `generateMetadata`, ở `app/sitemap.ts`, và đã có test khoá lại.

Lưu ý: `?lang=vi` là tham số truy vấn chứ không phải đường dẫn riêng. Cách này chấp nhận được và đã khai canonical đúng, nhưng nếu sau này lượng nội dung tiếng Việt tăng, nên chuyển sang tiền tố đường dẫn (`/vi/…`) để hreflang chắc chắn hơn và để cache CDN tách bạch hai ngôn ngữ.

## 5. Dữ liệu có cấu trúc

Đã bổ sung:

- **`BreadcrumbList` cho trang chi tiết sản phẩm.** Trước đây trang có breadcrumb trên giao diện nhưng thiếu hẳn khai báo có cấu trúc, trong khi trang danh mục và trang nhà cung cấp đều có. Đây là tín hiệu phân cấp mà cả Google lẫn các hệ thống AI dùng để hiểu sản phẩm thuộc danh mục nào.
- **`Organization.sameAs`** trỏ tới LinkedIn và Facebook — hai hồ sơ đã có thật ở chân trang (`components/social-links.tsx`), giờ khai trong `lib/config.ts` để cả hai nơi dùng chung. `sameAs` là cách rẻ nhất để nối website với thực thể doanh nghiệp mà máy tìm kiếm đã biết.
- **`Organization.logo` đổi sang `ImageObject` vuông 180×180** (`/apple-touch-icon.png`). Google yêu cầu logo vuông, tối thiểu 112×112; `logo-vexim.png` hiện tại là 60×60 nên bị bỏ qua.
- **Kích thước ảnh Open Graph** cho trang chủ (1264×848, đúng ảnh thật) để LinkedIn/WhatsApp/Zalo dựng thẻ xem trước ngay, không phải tải ảnh để đo trước.

Giữ nguyên (đúng chủ đích, không nên đổi):

- Không khai `offers` và `aggregateRating`. Giá trên nền tảng là giá tham khảo qua RFQ, không phải chào bán trực tiếp; điểm đánh giá chưa đủ cổng hiển thị. Với AI, một nguồn dữ kiện không thổi phồng được trích dẫn bền hơn nguồn nhiều nhưng mâu thuẫn.
- `Product` chỉ gắn khi sản phẩm đủ điều kiện index; `Organization` của nhà cung cấp chỉ gắn khi hồ sơ đạt cổng hiển thị. Cơ chế chống trang rỗng này rất đúng, giữ nguyên.

## 6. `llms.txt` (GEO)

Đã sửa và bổ sung:

- **Lỗi chính tả thật:** danh sách hồ sơ in thẳng cột `province`, ra `"Verified supplier in Vietnam, Hồ Chính Minh"` (sai, phải là "Hồ Chí Minh") — và nằm giữa văn bản tiếng Anh. Nay dùng đúng hai hàm mà trang nhà cung cấp đang dùng — `supplierProvinceDisplay()` rồi `publicProductPlaceDisplay()` — nên ra `"Ho Chi Minh City"`. Có 3 hồ sơ bị lỗi này trên bản đang chạy.
- **Cổng chặn môi trường:** trước đây chỉ đọc `PUBLIC_SITE_INDEXABLE`, thiếu điều kiện `NON_PRODUCTION` mà `robots.ts` và `sitemap.ts` đều có — host staging vẫn quảng bá danh mục, hồ sơ và URL canonical của bản production. Nay khớp.
- **Thêm mục "Key facts":** tên pháp nhân, mô tả một câu về nền tảng là gì (và **không** phải gì), mô hình doanh thu, giới hạn của kiểm chứng, bản chất giá tham khảo, liên hệ, địa chỉ, host canonical. Đây là dạng dữ kiện ngắn mà các hệ thống AI hay trích nguyên văn khi cần nêu nguồn.
- **Thêm trạng thái kiểm chứng vào từng hồ sơ** (`· 2/3 Vexim checks approved`) và tên tiếng Việt của danh mục, để AI trả lời được câu "nhà cung cấp này đã được kiểm gì".
- **Thêm `/blog` và `/sitemap.xml`** vào danh sách trang cốt lõi — đợt trước bỏ sót blog, vốn là nguồn nội dung dài duy nhất có thể được AI trích dẫn.
- **`Cache-Control` tường minh** thay vì để mặc định.

## 7. Kiểm tra tự động

Đã mở rộng ba script để các lỗi trên không tái diễn:

- `scripts/check-ai-crawlability.mjs` (chạy `npm run check:ai-crawl` sau mỗi deploy): thêm kiểm tra tiêu đề trang chủ không lặp tên thương hiệu, có `Organization`; `/how-it-works` và `/for-suppliers` có tiêu đề gọn + canonical đúng host; `llms.txt` không còn "Hồ Chính Minh" và không trỏ host ngoài canonical.
- `scripts/check-google-legal-pages.mjs`: đối chiếu ba danh sách trang pháp lý (robots / middleware / sitemap) phải khớp nhau, thay vì so chuỗi cứng từng nơi.
- `scripts/check-catalog-sitemap.mjs`: khoá quy tắc chỉ khai hreflang `vi` khi danh mục có bản dịch.

Đã chạy: `tsc --noEmit`, `npm run build` (cả hai chế độ index), và 6 script kiểm tra liên quan SEO — tất cả đạt.

## Việc còn lại, theo thứ tự ưu tiên

**Ưu tiên 0 — cần quyết định của người phụ trách, không phải việc code:**

- **`PUBLIC_SITE_INDEXABLE`**: khi tắt, middleware gắn `noindex, nofollow` cho toàn site. Bản đang chạy đã bật đúng, nhưng đây là điểm phải kiểm tra sau **mỗi** lần deploy hoặc đổi môi trường. `npm run check:ai-crawl` làm việc này.
- **Chính sách bot huấn luyện.** robots.txt hiện cho phép cả nhóm bot trả lời/trích dẫn *và* nhóm thu thập dữ liệu huấn luyện (GPTBot, ClaudeBot, CCBot, Google-Extended…). Đây là quyết định chính sách dữ liệu, không phải quyết định kỹ thuật. Nếu chủ quản muốn chặn nhóm huấn luyện mà vẫn được trích dẫn, chỉ cần sửa `AI_TRAINING_BOTS` trong `app/robots.ts` — cấu trúc đã tách sẵn hai nhóm cho đúng mục đích này.

**Ưu tiên 1 — nên làm sớm:**

- **Đăng ký Google Search Console + Bing Webmaster Tools**, gửi sitemap, và xác thực site. Hiện chưa có thẻ `verification` trong metadata. Đây là nguồn dữ liệu duy nhất cho biết trang nào thực sự được index, truy vấn nào đang mang impressions — thiếu nó thì mọi tối ưu ở trên chỉ là suy đoán.
- **Trang thư mục nhà cung cấp** (`/suppliers`). Hiện chỉ có `/suppliers/[slug]`, không có trang tổng hợp; buyer và AI chỉ vào được hồ sơ qua trang chủ, danh mục, hoặc `llms.txt`. Với 24 hồ sơ đã đủ để trang không bị loãng, và một trang thư mục là điểm vào quan trọng cho cả SEO lẫn khả năng AI trích dẫn.
- **Xử lý trùng lặp tên thương hiệu ở các tiêu đề còn dùng `|`**: đã hết sau đợt này, nhưng nên thêm quy tắc vào `docs/copy-style.md` để người viết nội dung không tự ghép lại.

**Ưu tiên 2 — làm theo thời gian:**

- **Tên sản phẩm quá dài.** Nhiều tên dài 90–110 ký tự và nhồi từ khoá theo kiểu sàn TMĐT (`"Premium Whole White Cashew Kernels W180 W210 W240 W320 W450 / Noix de cajou Anacardi Vietnam"`). Với AI, tên gọn + thuộc tính có cấu trúc (grade, MOQ, chứng nhận) được trích dẫn tốt hơn tên nhồi từ. Nên đặt giới hạn độ dài khi duyệt sản phẩm và yêu cầu grade/chứng nhận nằm ở trường riêng — cấu trúc `additionalProperty` đã sẵn sàng nhận.
- **Nội dung hướng dẫn mua hàng theo ngành.** Blog đã có 13 bài, đây là nguồn AI trích dẫn khi buyer hỏi cách nhập một mặt hàng từ Việt Nam. Nên duy trì nhịp đều và mỗi bài gắn với một danh mục.
- **Đo lường GEO thật.** Định kỳ đặt câu hỏi mua hàng mẫu trên ChatGPT/Perplexity/Gemini và ghi lại Vexim có được nhắc tới không. Đợt rà soát này chỉ đọc mã nguồn và nội dung HTML công khai — chưa đo được tần suất bot AI thực tế đã vào site (cần log máy chủ) và chưa kiểm chứng thứ hạng hiển thị thực tế trong câu trả lời của từng hệ thống.

## Ghi chú kỹ thuật: HTML trùng lặp trong luồng stream

Trong lúc kiểm chứng bằng bản build production, phát hiện mọi trang thuộc `app/(public)/` trả về HTML có nội dung trang lặp 4 lần (4 thẻ `<h1>`, 4 `<main>`, 4 bộ JSON-LD) trong response thô của `curl`. Đã xác nhận **lỗi này có sẵn từ trước, không do đợt sửa này**: build lại từ commit gốc `564e918` cho kết quả y hệt.

Bản chất: các bản lặp nằm trong các `div hidden` mà React dùng để giữ lại ranh giới Suspense (`B:n` → nhiều `S:n`). Trình duyệt chỉ hiển thị một bản, Google render JavaScript nên thấy một `<h1>`, còn bot chỉ đọc HTML thô thì thấy bốn. Mức độ ảnh hưởng thực tế tới xếp hạng chưa rõ, nhưng response phình 4 lần (~189 KB thay vì ~48 KB) là vấn đề thật về tốc độ và về ngân sách thu thập của bot.

Chưa xử lý trong đợt này vì cần điều tra sâu hơn: nghi vấn liên quan tới một `Suspense` bao ngoài layout `(public)` kết hợp cơ chế render từng phần, và có thể liên quan tới cách Next.js 16 xử lý `revalidate` + `Suspense` ở layout. Đề xuất tách thành việc riêng, có đo lường trước/sau bằng HTML thô và bằng Core Web Vitals thật.
