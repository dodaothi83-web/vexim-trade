import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const theme = await import("../lib/storefront-theme.ts");

// 1. Chỉ còn mẫu Hiện đại (chủ sàn chốt 2026-11-20) và 4 tông đã duyệt; không có xanh lá hay đỏ đô (màu của khiên xác minh).
assert.deepEqual([...theme.STOREFRONT_TEMPLATES], ["modern"]);
assert.deepEqual([...theme.STOREFRONT_TONES], ["champagne", "terracotta", "graphite", "steel"]);
for (const { accent } of Object.values(theme.STOREFRONT_TONE_COLORS)) {
  assert.ok(!["#0E7A4E", "#16A34A", "#7F1D1D", "#8A1C2B"].includes(accent.toUpperCase()), `Tông ${accent} không trùng màu xác minh`);
}
const preview = read("docs/storefront-templates/index.html");
for (const [tone, { accent }] of Object.entries(theme.STOREFRONT_TONE_COLORS)) {
  if (tone !== "champagne") assert.ok(preview.includes(`--accent: ${accent}`), `Mẫu xem trước khớp tông ${tone}`);
}

// 2. Đọc dữ liệu: giá trị lạ về mặc định, số liệu lọc trùng và tối đa 4.
assert.deepEqual(theme.normalizeStorefrontTheme(null), theme.DEFAULT_STOREFRONT_THEME);
assert.equal(theme.normalizeStorefrontTheme({ template: "neon", tone: "pink" }).template, "modern");
assert.equal(theme.normalizeStorefrontTheme({ template: "elegant" }).template, "modern", "Mẫu cũ đọc thành Hiện đại");
assert.equal(theme.normalizeStorefrontTheme({ template: "gallery" }).template, "modern");
// Ghim tối đa 4 sản phẩm; video nhà máy đúng mã Cloudflare.
assert.deepEqual(theme.normalizeStorefrontTheme({ featured: ["p-00000001", "p-00000001", "x", "p-00000002", "p-00000003", "p-00000004", "p-00000005"] }).featured,
  ["p-00000001", "p-00000002", "p-00000003", "p-00000004"]);
assert.equal(theme.STOREFRONT_MAX_FEATURED, 4);
assert.equal(theme.STOREFRONT_GROUP_MIN_PRODUCTS, 8);
assert.equal(theme.normalizeStorefrontTheme({ hero_video: { video_uid: "AB".repeat(16) } }).hero_video.video_uid, "ab".repeat(16));
assert.equal(theme.normalizeStorefrontTheme({ hero_video: { video_uid: "nope" } }).hero_video, undefined);
assert.deepEqual(theme.normalizeStorefrontTheme({ stats: ["moq", "moq", "x", "founded", "employees", "markets", "lead_time"] }).stats,
  ["moq", "founded", "employees", "markets"]);

// 3. Kiểm tra trước khi lưu: tiếng Anh, không liên hệ, tối đa 160 ký tự.
const ok = { template: "modern", tone: "steel", stats: ["founded"], tagline: "Export-grade cashew kernels since 2008." };
assert.equal(theme.storefrontThemeProblem(ok), null);
assert.equal(theme.storefrontThemeProblem({ ...ok, template: "neon" }), "template");
assert.equal(theme.storefrontThemeProblem({ ...ok, stats: ["a"] }), "stats");
assert.equal(theme.storefrontThemeProblem({ ...ok, stats: ["moq", "founded", "employees", "markets", "lead_time"] }), "stats");
assert.equal(theme.storefrontThemeProblem({ ...ok, tagline: "x".repeat(161) }), "taglineTooLong");
assert.equal(theme.storefrontThemeProblem({ ...ok, tagline: "Call +84 912 345 678" }), "contact");
assert.equal(theme.storefrontThemeProblem({ ...ok, tagline: "Xin chào quý khách hàng thân mến" }), "language");
assert.equal(theme.storefrontThemeProblem({ ...ok, tagline: "Xin chào quý khách hàng thân mến", language: "any" }), null, "Bản tiếng Việt nhà cung cấp viết được phép");

// 4. Chỉ gói còn hiệu lực mới lưu và mới dùng giao diện; mỗi lần đổi có audit.
const action = read("app/supplier/portal/storefront/theme-actions.ts");
assert.match(action, /supplierPlanRules\(access\.supplier\)\.premiumStorefront/);
assert.match(action, /storefrontThemeProblem\(\{ \.\.\.input, language: "any" \}\)/);
assert.match(action, /translateAplusStrings\(\[taglineVi\]\)/, "Câu giới thiệu viết tiếng Việt, dịch khi lưu");
assert.match(action, /main_products\.map\(\(p\) => p\.id\)/, "Chỉ ghim sản phẩm đang hiện cho người mua");
assert.match(action, /video\.meta\.purpose !== "company" \|\| video\.meta\.supplier_id !== access\.supplier\.id/, "Video nhà máy đúng nhà cung cấp");
assert.match(action, /action: "supplier\.storefront_theme_changed"/);
const storefront = read("components/public/supplier-storefront.tsx");
assert.match(storefront, /\{premium \? <PremiumStorefront/);
assert.match(storefront, /const theme = normalizeStorefrontTheme\(s\.storefront_theme\);/);
const premium = read("components/public/premium-storefront.tsx");
assert.match(premium, /function Modern\(p: Shared\)/);
for (const name of ["Elegant", "Gallery"]) assert.doesNotMatch(premium, new RegExp(`function ${name}\\(`), `Đã bỏ mẫu ${name}`);
assert.match(premium, /<HeroVideoButton/, "Video nhà máy bấm mới phát");
assert.match(premium, /p\.coverUrl \?\? p\.fallbackImageUrl \?\?[\s\S]{0,120}aplusVideoThumbnailUrl/, "Thiếu ảnh bìa thì dùng ảnh A+, rồi ảnh video");
const hero = read("components/public/hero-video-button.tsx");
assert.doesNotMatch(hero, /autoPlay|autoplay/, "Không tự phát");
const grid = read("components/public/premium-product-grid.tsx");
assert.match(grid, /items\.length >= STOREFRONT_GROUP_MIN_PRODUCTS && groups\.length >= 2/, "Lọc theo danh mục từ 8 sản phẩm");
assert.match(grid, /if \(count === 3\) return "grid-cols-1 sm:grid-cols-3"/, "3 sản phẩm chia đều 3 cột");
assert.match(storefront, /premium\s*\n?\s*\/\/[^\n]*\n\s*\? <PremiumProductGrid featuredIds=\{theme\.featured\}/);
assert.match(premium, /bg-success-surface|checks/, "Dải xác minh dùng chung");

// 5. Ngoại lệ màu được ghi trong tài liệu thương hiệu.
assert.match(read("docs/brand-identity.md"), /Premium\/Pro supplier page templates/);

console.log("✅ Giao diện Premium/Pro: chỉ mẫu Hiện đại, video nhà máy bấm mới phát, ghim 4 sản phẩm, lọc danh mục từ 8 sản phẩm, 4 tông đã duyệt, câu giới thiệu tiếng Anh, chỉ dùng khi gói còn hiệu lực.");
