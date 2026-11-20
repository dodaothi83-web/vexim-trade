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
assert.deepEqual(ok.layout.blocks.map((b) => b.type), ["banner", "stats", "products", "about", "markets"]);
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
assert.deepEqual(read1.blocks.map((b) => b.type), ["stats", "markets"]);
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
assert.deepEqual(quick.blocks.map((b) => b.type), ["banner", "stats", "products", "about", "markets"]);
assert.deepEqual(quick.blocks[0].images, [img(7)], "Banner chỉ dùng ảnh khối hợp lệ");
assert.deepEqual(quick.blocks[1].stats, ["capacity", "founded"], "Không đưa số liệu trống");
assert.equal(quick.tone, "graphite");
assert.equal("template" in quick, false, "Không còn chọn mẫu");
assert.equal(L.validateStorefrontLayout(quick, ctx).ok, true, "Bố cục dựng nhanh hợp lệ");
assert.deepEqual(L.buildLayoutFromProfile({ supplierId: sid, theme: null, showcase: [], productIds: [], statValues: {}, hasMarkets: false, province: "", foundedYear: null }).blocks, []);

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
console.log("✅ Thiết kế trang: 5 loại khối, ảnh và sản phẩm đúng nhà cung cấp, tiếng Anh, không liên hệ, Tạo nhanh không bịa nội dung, bản nháp không công khai, CRM cần đồng ý.");
