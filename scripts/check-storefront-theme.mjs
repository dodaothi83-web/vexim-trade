import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const theme = await import("../lib/storefront-theme.ts");

// 1. Đúng 3 mẫu và 4 tông đã duyệt; không có xanh lá hay đỏ đô (màu của khiên xác minh).
assert.deepEqual([...theme.STOREFRONT_TEMPLATES], ["elegant", "modern", "gallery"]);
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
assert.equal(theme.normalizeStorefrontTheme({ template: "neon", tone: "pink" }).template, "elegant");
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

// 4. Chỉ gói còn hiệu lực mới lưu và mới dùng giao diện; mỗi lần đổi có audit.
const action = read("app/supplier/portal/storefront/theme-actions.ts");
assert.match(action, /supplierPlanRules\(access\.supplier\)\.premiumStorefront/);
assert.match(action, /storefrontThemeProblem\(input\)/);
assert.match(action, /action: "supplier\.storefront_theme_changed"/);
const storefront = read("components/public/supplier-storefront.tsx");
assert.match(storefront, /\{premium \? <PremiumStorefront/);
assert.match(storefront, /const theme = normalizeStorefrontTheme\(s\.storefront_theme\);/);
const premium = read("components/public/premium-storefront.tsx");
for (const name of ["Elegant", "Modern", "Gallery"]) assert.match(premium, new RegExp(`function ${name}\\(p: Shared\\)`), `Có mẫu ${name}`);
assert.match(premium, /bg-success-surface|checks/, "Dải xác minh dùng chung");

// 5. Ngoại lệ màu được ghi trong tài liệu thương hiệu.
assert.match(read("docs/brand-identity.md"), /Premium\/Pro supplier page templates/);

console.log("✅ Giao diện Premium/Pro: 3 mẫu, 4 tông đã duyệt, câu giới thiệu tiếng Anh, chỉ dùng khi gói còn hiệu lực.");
