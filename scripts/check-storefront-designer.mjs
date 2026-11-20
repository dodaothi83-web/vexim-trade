// node --experimental-strip-types --no-warnings scripts/check-storefront-designer.mjs
// "Thiết kế trang" (Premium/Pro): bố cục hợp lệ, ảnh đúng nhà cung cấp, tiếng Anh, không liên hệ,
// Tạo nhanh không bịa nội dung, bản nháp không công khai, CRM thiết kế hộ cần đồng ý.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const L = await import("../lib/storefront-layout.ts");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const sid = "11111111-1111-1111-1111-111111111111";
const img = (n) => `suppliers/${sid}/showcase-${String(n).repeat(8)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(12)}.jpg`;
const pid = "22222222-2222-2222-2222-222222222222";
const ctx = { supplierId: sid, productIds: new Set([pid]) };
const layout = (blocks, extra = {}) => ({ tone: "steel", tagline: "Hand-graded cashew kernels.", blocks, ...extra });

// 1. Năm loại khối hợp lệ, giữ thứ tự và cờ ẩn.
const good = [
  { id: "b-banner01", type: "banner", images: [img(3), img(4)], eyebrow: "Binh Phuoc · Since 2009", headline: "Premium cashew kernels" },
  { id: "b-stats001", type: "stats", stats: ["capacity", "founded"] },
  { id: "b-product1", type: "products", product_ids: [pid] },
  { id: "b-about001", type: "about", image_path: img(5), title: "Our process", body: "Graded by hand." , hidden: true },
  { id: "b-market01", type: "markets" },
];
const ok = L.validateStorefrontLayout(layout(good), ctx);
assert.equal(ok.ok, true);
assert.deepEqual(ok.layout.blocks.map((b) => b.type), ["banner", "stats", "products", "about", "markets", "checks"], "Luôn có khối Xác minh của Vexim");
assert.equal(ok.layout.v, 2);
assert.equal(ok.layout.blocks[3].hidden, true);
assert.deepEqual(L.layoutImagePaths(ok.layout), [img(3), img(4), img(5)]);

// 2. Từ chối: ảnh của nhà cung cấp khác, sản phẩm không thuộc mình, trùng khối, thiếu tiêu đề, quá nhiều ảnh.
const bad = (blocks, extra) => L.validateStorefrontLayout(layout(blocks, extra), ctx);
assert.equal(bad([{ ...good[0], images: [img(3).replace(sid, pid)] }]).problem.code, "imageRequired", "Ảnh phải thuộc đúng nhà cung cấp");
assert.equal(bad([{ ...good[2], product_ids: ["33333333-3333-3333-3333-333333333333"] }]).problem.code, "productsRequired", "Chỉ chọn sản phẩm của chính mình");
assert.equal(bad([good[1], { ...good[1], id: "b-stats002" }]).problem.code, "duplicate");
assert.equal(bad([{ ...good[3], title: "" }]).problem.code, "titleRequired");
assert.equal(bad([{ ...good[0], images: [img(3), img(4), img(5), img(6)] }]).problem.code, "imageRequired");
assert.equal(bad(Array.from({ length: L.LAYOUT_MAX_ABOUT + 1 }, (_, i) => ({ ...good[3], id: `b-about-${i}x` }))).problem.code, "tooMany");

// 3. Người mua quốc tế, liên hệ đi qua Vexim.
assert.equal(bad([{ ...good[3], body: "Liên hệ chúng tôi để được báo giá tốt nhất" }]).problem.code, "language");
assert.equal(bad([{ ...good[3], body: "Email sales@farm.vn" }]).problem.code, "contact");
assert.equal(bad([{ ...good[0], headline: "Call +84 912 345 678" }]).problem.code, "contact");
assert.equal(bad([], { tagline: "Chuyên hạt điều xuất khẩu chất lượng cao" }).problem.code, "tagline");

// 4. Dữ liệu hỏng không làm hỏng trang: bỏ đúng khối hỏng.
const read1 = L.readStorefrontLayout({ ...layout(good), blocks: [good[1], { id: "x", type: "evil" }, good[4]] }, sid);
assert.deepEqual(read1.blocks.map((b) => b.type), ["stats", "markets", "company", "checks", "certificates", "gallery", "trade", "details"], "Bố cục cũ được thêm các mục chung, không mất nội dung");
assert.equal(L.readStorefrontLayout(null, sid), null);

// 5. Tạo nhanh từ hồ sơ: chỉ dùng ảnh, chữ sẵn có; bỏ khối tiếng Việt hoặc có liên hệ; số liệu có giá trị mới hiện.
const quick = L.buildLayoutFromProfile({
  supplierId: sid,
  theme: { template: "gallery", tone: "graphite", tagline: "Hand-graded kernels for export.", stats: ["capacity", "employees"] },
  showcase: [
    { id: "s1", image_path: img(7), title: "Our farms", body: "600 partner farms." },
    { id: "s2", image_path: img(8), title: "Nhà máy của chúng tôi", body: "Sản xuất" },
    { id: "s3", image_path: img(9), title: "Contact", body: "Call 0912 345 678" },
  ],
  productIds: [pid], statValues: { capacity: "1,200 MT", founded: "2009" }, hasMarkets: true, province: "Binh Phuoc, Vietnam", foundedYear: 2009,
});
assert.deepEqual(quick.blocks.map((b) => b.type), ["banner", "stats", "products", "about", "markets", "company", "checks", "trade", "details"]);
assert.deepEqual(quick.blocks[0].images, [img(7)], "Banner chỉ dùng ảnh khối hợp lệ");
assert.deepEqual(quick.blocks[1].stats, ["capacity", "founded"], "Không đưa số liệu trống");
assert.equal(quick.tone, "graphite");
assert.equal("template" in quick, false, "Không còn chọn mẫu");
assert.equal(L.validateStorefrontLayout(quick, ctx).ok, true, "Bố cục dựng nhanh hợp lệ");
assert.deepEqual(L.buildLayoutFromProfile({ supplierId: sid, theme: null, showcase: [], productIds: [], statValues: {}, hasMarkets: false, province: "", foundedYear: null }).blocks.map((b) => b.type), ["company", "checks", "trade", "details"]);

// 6. Máy chủ: bản nháp không công khai; ảnh công khai chỉ khi nằm trong bố cục đã áp dụng; gói hết hạn về giao diện cũ.
const media = read("app/public-media/[...path]/route.ts");
assert.match(media, /layoutImagePaths\(readStorefrontLayout\(supplier\.storefront_layout, supplier\.id\)\)/);
assert.doesNotMatch(media, /storefront_layout_draft/, "Ảnh bản nháp không công khai");
const storefront = read("components/public/supplier-storefront.tsx");
assert.match(storefront, /const layout: StorefrontLayout \| null = !premium \? null/, "Chỉ Premium/Pro còn hạn mới dùng bố cục");
assert.match(storefront, /readStorefrontLayout\(s\.storefront_layout, s\.id\)/);
assert.doesNotMatch(storefront, /storefront_layout_draft/);
assert.match(storefront, /!\(premium && featuredAll\) && <section id="products"/, "Sản phẩm nổi bật đã gồm mọi sản phẩm thì không lặp danh mục");
assert.match(storefront, /premium \? "All products" : "Products"/, "Danh mục sản phẩm theo giao diện Premium");
assert.match(read("components/public/storefront-blocks.tsx"), /They are not evidence of a Vexim check/, "Ảnh, chữ nhà cung cấp không phải bằng chứng xác minh");

// 7. Cổng nhà cung cấp: lưu nháp / áp dụng kiểm quyền gói và nội dung; phiên bản được lưu.
const portal = read("app/supplier/portal/storefront/design-actions.ts");
assert.match(portal, /premiumStorefront\) return \{ copy, error: copy\.plan \}/);
assert.match(portal, /validateStorefrontLayout\(raw/);
assert.match(portal, /role: "supplier"/);
const lib = read("lib/supplier-portal/storefront-design.ts");
assert.match(lib, /from\("supplier_storefront_versions"\)\.insert/);

// 8. CRM thiết kế hộ: cần quyền suppliers.manage, đồng ý đang hiệu lực, gói còn hạn; báo nhà cung cấp.
const crm = read("app/crm/suppliers/[slug]/design/actions.ts");
assert.match(crm, /guard\("suppliers\.manage"\)/);
assert.match(crm, /if \(!consent\) return/, "Không có đồng ý thì không sửa được");
assert.match(crm, /premiumStorefront\) return/);
assert.match(crm, /role: "staff"/);
assert.match(crm, /storefront_staff_applied_at/);
assert.match(crm, /notifySupplierStorefrontDesigned/);
const upload = read("app/api/crm/storefront-image/route.ts");
assert.match(upload, /activeDesignConsent\(supplierId\)/);
assert.match(read("lib/supplier-portal/dashboard.ts"), /storefront-staff:/, "Nhà cung cấp thấy thông báo trong cổng");
const migration = read("supabase/migrations/20261203_storefront_designer.sql");
assert.match(migration, /create table if not exists public\.supplier_design_consents/);
assert.match(migration, /supplier_storefront_versions enable row level security/);
// 9. Giai đoạn 2: video nhà máy và nhóm sản phẩm chỉ gói Pro; chứng nhận tự lấy; video phải của đúng nhà cung cấp.
const video = { id: "b-video001", type: "video", video_uid: "ab".repeat(16), title: "Inside our factory" };
assert.equal(L.validateStorefrontLayout(layout([video, { id: "b-cat00001", type: "categories" }, { id: "b-cert0001", type: "certificates" }]), { ...ctx, pro: true }).ok, true);
assert.equal(L.validateStorefrontLayout(layout([video]), { ...ctx, pro: false }).problem.code, "plan", "Premium không thêm được video nhà máy");
assert.equal(L.validateStorefrontLayout(layout([{ id: "b-cat00001", type: "categories" }]), { ...ctx, pro: false }).problem.code, "plan");
assert.equal(L.validateStorefrontLayout(layout([{ id: "b-cert0001", type: "certificates" }]), { ...ctx, pro: false }).ok, true, "Chứng nhận có ở cả Premium");
assert.equal(L.validateStorefrontLayout(layout([{ ...video, video_uid: "x" }]), { ...ctx, pro: true }).problem.code, "video");
assert.equal(L.validateStorefrontLayout(layout([{ ...video, title: "Liên hệ Zalo 0912345678" }]), { ...ctx, pro: true }).ok, false);
assert.deepEqual(L.layoutForPlan(L.validateStorefrontLayout(layout([video, good[1]]), { ...ctx, pro: true }).layout, false).blocks.map((b) => b.type), ["stats", "checks"], "Hạ gói thì khối Pro ẩn");
assert.match(lib, /video\.meta\.purpose !== "storefront" \|\| video\.meta\.supplier_id !== supplier\.id/);
assert.match(read("lib/media/cloudflare-stream.ts"), /purpose: "storefront", supplier_id: input\.supplierId/);
assert.match(read("app/api/supplier-portal/storefront-image/route.ts"), /plan !== "pro"\) return/, "Chỉ Pro xin được đường tải video nhà máy");
assert.match(storefront, /layoutForPlan\(layout, supplierPlanRules\(s\)\.plan === "pro"\)/);
// Nút xoá ảnh bìa: chỉ ảnh bìa của chính nhà cung cấp.
const profileImage = read("app/api/supplier-portal/profile-image/route.ts");
assert.match(profileImage, /export async function DELETE/);
assert.match(profileImage, /previous\.startsWith\(`suppliers\/\$\{supplier\.id\}\/cover-`\)/);
// 10. Các mục chung thành khối: xác minh của Vexim bắt buộc (không ẩn, không xoá), trang Premium bỏ khung cố định kiểu Basic.
const withHiddenChecks = L.validateStorefrontLayout(layout([{ id: "b-checks01", type: "checks", hidden: true }, { id: "b-trade001", type: "trade", hidden: true }]), ctx);
assert.equal(withHiddenChecks.layout.blocks[0].hidden, undefined, "Không ẩn được khối xác minh");
assert.equal(withHiddenChecks.layout.blocks[1].hidden, true, "Các mục khác ẩn được");
assert.equal(L.validateStorefrontLayout(layout([{ id: "b-checks01", type: "checks" }, { id: "b-checks02", type: "checks" }]), ctx).problem.code, "duplicate");
assert.deepEqual([...L.REQUIRED_BLOCKS], ["checks"]);
assert.match(storefront, /\{premium \? verificationActions && <div className="mt-8">\{verificationActions\}<\/div>/, "Trang Premium không còn khung cố định kiểu Basic");
assert.match(storefront, /checks: <ChecksSection s=\{s\} reportAction=\{reportAction\} \/>/);
const designer = read("components/storefront-designer/storefront-designer.tsx");
assert.match(designer, /REQUIRED_BLOCKS\.includes\(b\.type\)\s*\n?\s*\? <span/, "Khối bắt buộc không có nút ẩn, xoá");
assert.match(read("components/public/storefront-sections.tsx"), /export function ChecksSection/);
assert.match(read("components/public/storefront-blocks.tsx"), /case "details":/, "Thông tin công ty là khối riêng");
assert.match(read("components/public/storefront-sections.tsx"), /function PremiumTrade\(/, "Điều kiện giao dịch trình bày lưới thẻ trên trang Premium");
// 11. Bấm khối trong danh sách thì xem trước cuộn tới đúng khối; khối trống có ô giữ chỗ; hai cột bên đứng yên.
assert.match(designer, /onClick=\{\(\) => focusBlock\(b\.id\)\}/, "Bấm khối trong danh sách cuộn tới khối đó");
assert.match(designer, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
assert.match(designer, /emptyBlock=\{\(b\) =>/, "Khối chưa có nội dung vẫn có ô giữ chỗ trong xem trước");
assert.match(designer, /lg:sticky/);
const blocksSrc = read("components/public/storefront-blocks.tsx");
assert.match(blocksSrc, /if \(!onSelect\) return rendered \?/, "Trang thật không hiện ô giữ chỗ");
assert.match(blocksSrc, /data-block-id=\{block\.id\}/);
// 12. Sửa thông tin hồ sơ ngay trong Thiết kế trang: chỉ trường nhà cung cấp được sửa, không tên pháp lý, địa chỉ, MOQ, xác minh.
const fieldsLib = read("lib/storefront-profile-fields.ts");
for (const locked of ["legal_name:", "address:", "moq_text", "status:", "approved_verification"]) assert.doesNotMatch(fieldsLib, new RegExp(`\\b${locked}`), `Không sửa được ${locked}`);
const profileAction = read("app/supplier/portal/storefront/profile-fields-action.ts");
assert.match(profileAction, /supplierPortalAccess\(\)/);
assert.match(profileAction, /STOREFRONT_PROFILE_FIELDS\[key/, "Chỉ nhận trường trong danh sách cho phép");
assert.match(profileAction, /ensureSupplierProfileEnglish\(/, "Lưu xong dịch sang tiếng Anh như Hồ sơ công ty");
assert.match(read("app/supplier/portal/storefront/design/page.tsx"), /profile=\{\{ save: saveStorefrontProfileFieldsAction/);
assert.doesNotMatch(read("app/crm/suppliers/[slug]/design/page.tsx"), /profile=\{\{/, "CRM không sửa hồ sơ qua trình thiết kế");
// 13. Mọi khối đều có chỗ sửa: thư viện ảnh tự tải ảnh, đầu trang đổi ảnh và tên hiển thị, khối tự lấy có đường dẫn.
const gallery = { id: "b-gallery1", type: "gallery", images: [img(3), img(4)] };
assert.deepEqual(L.validateStorefrontLayout(layout([gallery]), ctx).layout.blocks[0].images, [img(3), img(4)]);
assert.equal(L.validateStorefrontLayout(layout([{ ...gallery, images: [img(3).replace(sid, pid)] }]), ctx).problem.code, "imageRequired", "Ảnh thư viện phải của đúng nhà cung cấp");
assert.equal(L.validateStorefrontLayout(layout([{ ...gallery, images: Array.from({ length: 13 }, (_, i) => img(i % 10)) }]), ctx).ok, false);
assert.ok(L.layoutImagePaths(L.validateStorefrontLayout(layout([gallery]), ctx).layout).includes(img(4)), "Ảnh thư viện công khai khi đã áp dụng");
assert.match(designer, /<HeaderPhotos header=\{props\.header\}/);
assert.match(designer, /PROFILE_FIELDS_BY_BLOCK\.header/);
for (const href of ["/supplier/portal/documents#chung-nhan", "/supplier/portal/products", "/supplier/portal/storefront#supplier-verification-actions"]) assert.ok(designer.includes(href), `Có đường dẫn ${href}`);
assert.match(fieldsLib, /stats: \[[^\]]*"incoterms", "export_markets"\]/);
// 14. Khối Giới thiệu công ty: tối đa 3 ảnh (Premium/Pro), video giới thiệu chỉ gói Pro, gói hạ thì ẩn video.
const company = { id: "b-company1", type: "company", images: [img(3), img(4)], video_uid: "cd".repeat(16), video_title: "Meet the team" };
const okCompany = L.validateStorefrontLayout(layout([company]), { ...ctx, pro: true });
assert.equal(okCompany.ok, true);
assert.deepEqual(okCompany.layout.blocks[0].images, [img(3), img(4)]);
assert.equal(L.validateStorefrontLayout(layout([company]), { ...ctx, pro: false }).problem.code, "plan", "Premium không có video giới thiệu");
assert.equal(L.validateStorefrontLayout(layout([{ ...company, video_uid: undefined }]), { ...ctx, pro: false }).ok, true, "Premium vẫn thêm ảnh được");
assert.equal(L.validateStorefrontLayout(layout([{ ...company, images: [img(1), img(2), img(3), img(4)] }]), ctx).ok, false, "Tối đa 3 ảnh");
assert.equal(L.validateStorefrontLayout(layout([{ ...company, video_title: "Gọi 0912 345 678" }]), { ...ctx, pro: true }).ok, false);
assert.equal(L.layoutForPlan(okCompany.layout, false).blocks[0].video_uid, undefined, "Gói hạ thì ẩn video giới thiệu");
assert.deepEqual(L.layoutForPlan(okCompany.layout, false).blocks[0].images, [img(3), img(4)]);
assert.ok(L.layoutImagePaths(okCompany.layout).includes(img(4)));
assert.deepEqual(L.layoutVideoUids(okCompany.layout), ["cd".repeat(16)]);
assert.match(lib, /block\.type === "company" && block\.video_uid/, "Video giới thiệu cũng được kiểm tra đúng nhà cung cấp");
assert.match(read("components/public/storefront-blocks.tsx"), /function AboutMedia\(/);
// 15. Sửa trực tiếp trên bản xem trước (kiểu Notion): chỉ trình thiết kế, trang công khai không đổi.
const inlineSrc = read("components/storefront-designer/inline-edit.tsx");
assert.match(inlineSrc, /showcaseHasContact\(value\)/, "Ô sửa tại chỗ cảnh báo thông tin liên hệ");
assert.match(inlineSrc, /looksVietnamese\(value\)/, "Ô sửa tại chỗ cảnh báo tiếng Việt");
assert.match(blocksSrc, /export interface BlockEditor/);
assert.match(blocksSrc, /renderBlock\(block, data, index, editor\)/);
assert.match(read("app/(public)/suppliers/[slug]/page.tsx").concat(read("components/public/supplier-storefront.tsx")), /<StorefrontBlocks/, "Trang công khai vẫn dùng StorefrontBlocks");
assert.doesNotMatch(read("components/public/supplier-storefront.tsx"), /editor=\{/, "Trang công khai không truyền trình sửa");
assert.match(designer, /editor=\{editor\}/);
assert.match(designer, /props\.saveDraft\(snapshot\)/, "Tự lưu chỉ lưu nháp");
assert.doesNotMatch(designer, /props\.apply\(snapshot\)/, "Không tự áp dụng");
assert.match(designer, /target\.tagName === "TEXTAREA"/, "Ctrl+Z trong ô chữ để trình duyệt xử lý");
assert.match(designer, /photos=\{!!props\.profile\}/, "Nút ảnh bìa, ảnh đại diện chỉ ở cổng nhà cung cấp");
assert.match(designer, /REQUIRED_BLOCKS\.includes\(b\.type\)[\s\S]{0,200}copy\.required/, "Khối bắt buộc không có nút ẩn, xóa trên thanh nổi");
// 16. "About this supplier" soạn kiểu blog (Premium/Pro): viết tiếng Việt có tiêu đề phụ, gạch đầu dòng, chữ đậm; AI dịch giữ định dạng.
const RI = await import("../lib/rich-intro.ts");
const designerSrcNow = () => read("components/storefront-designer/storefront-designer.tsx");
const richSample = "We are a **processor**.\nSecond line.\n\n### Capacity\n- Factory\n- 120 workers";
assert.deepEqual(RI.parseRichIntro(richSample).map((n) => n.kind), ["p", "h3", "li", "li"]);
assert.deepEqual(RI.parseRichIntro(richSample)[0].runs, [{ t: "We are a " }, { t: "processor", b: true }, { t: ".\nSecond line." }]);
assert.equal(RI.richIntroPlain(richSample), "We are a processor.\nSecond line.\n\nCapacity\n\n• Factory\n• 120 workers", "Nơi không có định dạng thì bỏ dấu");
assert.equal(RI.richIntroPlain("Plain intro\nkept"), "Plain intro\nkept", "Giới thiệu cũ dạng chữ thường giữ nguyên");
assert.equal(RI.richIntroFromNodes(RI.parseRichIntro(richSample)), "We are a **processor**.\nSecond line.\n\n### Capacity\n\n- Factory\n- 120 workers");
assert.equal(RI.cleanRichIntro("a   b\r\n\r\n\r\n- c ", 100), "a b\n\n- c", "Bản dịch giữ xuống dòng");
const translateSrc = read("lib/ai/translate-supplier.ts");
assert.match(translateSrc, /summary_en: cleanRichIntro\(payload\.summary_en, 1500\)/, "Không gộp dòng phần giới thiệu tiếng Anh");
assert.match(translateSrc, /Keep exactly the same markers, line breaks/, "AI giữ định dạng khi dịch");
const englishSrc = read("lib/public/supplier-english.ts");
assert.match(englishSrc, /return richIntroPlain\(supplierSummaryRich\(supplier\)\)/, "Tìm kiếm, SEO, Basic dùng chữ thường");
const sectionsSrc = read("components/public/storefront-sections.tsx");
assert.match(sectionsSrc, /const rich = premium \? safe\(supplierSummaryRich\(s\)\) : ""/, "Chỉ Premium/Pro hiện định dạng, vẫn lọc liên hệ");
for (const tag of ["<h3", "<ul", "<li", "<strong"]) assert.ok(read("components/public/rich-intro.tsx").includes(tag), `HTML ngữ nghĩa ${tag}`);
const editorSrc = read("components/rich-intro-editor.tsx");
assert.match(editorSrc, /clipboardData\.getData\("text\/plain"\)/, "Dán vào thành chữ thường");
assert.doesNotMatch(editorSrc, /createLink|foreColor|fontSize|insertImage/, "Không link, màu, cỡ chữ, ảnh");
assert.match(designerSrcNow(), /companyIntro: props\.profile \? \(\) => <InlineIntroEditor/, "Đoạn giới thiệu sửa ngay trên trang, chỉ cổng NCC");
assert.match(designerSrcNow(), /variant="inline"/);
assert.doesNotMatch(read("lib/storefront-profile-fields.ts"), /company: \["intro_source"/, "Bảng bên không còn ô giới thiệu");
assert.match(read("app/supplier/portal/storefront/design/page.tsx"), /companyBusiness: <CompanySection s=\{card\} premium hideIntro \/>/);
assert.match(read("app/supplier/portal/profile/edit/page.tsx"), /richIntro=\{supplierPlanRules\(access\.supplier\)\.plan !== "basic"\}/, "Basic vẫn là ô chữ thường");
console.log("✅ Thiết kế trang: 5 loại khối, ảnh và sản phẩm đúng nhà cung cấp, tiếng Anh, không liên hệ, Tạo nhanh không bịa nội dung, bản nháp không công khai, CRM cần đồng ý, video và nhóm sản phẩm chỉ Pro.");
