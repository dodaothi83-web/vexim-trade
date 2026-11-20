import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const theme = await import("../lib/storefront-theme.ts");

// 1. Một kiểu đầu trang chung "Hiện đại" (bỏ Thanh lịch, Trưng bày ngày 2026-11-20) và 4 tông đã duyệt; không có xanh lá hay đỏ đô.
assert.equal(theme.STOREFRONT_TEMPLATES, undefined, "Không còn danh sách mẫu");
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
assert.equal(theme.normalizeStorefrontTheme({ template: "neon", tone: "pink" }).tone, "champagne");
assert.equal("template" in theme.normalizeStorefrontTheme({ template: "modern" }), false, "Bỏ qua mẫu cũ đã lưu");
assert.deepEqual(theme.normalizeStorefrontTheme({ stats: ["moq", "moq", "x", "founded", "employees", "markets", "lead_time"] }).stats,
  ["moq", "founded", "employees", "markets"]);

// 3. Kiểm tra trước khi lưu: tiếng Anh, không liên hệ, tối đa 160 ký tự.
const ok = { tone: "steel", stats: ["founded"], tagline: "Export-grade cashew kernels since 2008." };
assert.equal(theme.storefrontThemeProblem(ok), null);
assert.equal(theme.storefrontThemeProblem({ ...ok, tone: "neon" }), "tone");
assert.equal(theme.storefrontThemeProblem({ ...ok, stats: ["a"] }), "stats");
assert.equal(theme.storefrontThemeProblem({ ...ok, stats: ["moq", "founded", "employees", "markets", "lead_time"] }), "stats");
assert.equal(theme.storefrontThemeProblem({ ...ok, tagline: "x".repeat(161) }), "taglineTooLong");
assert.equal(theme.storefrontThemeProblem({ ...ok, tagline: "Call +84 912 345 678" }), "contact");
assert.equal(theme.storefrontThemeProblem({ ...ok, tagline: "Xin chào quý khách hàng thân mến" }), "language");

// 4. Chỉ gói còn hiệu lực mới dùng giao diện; đầu trang chung, không còn 3 mẫu hay khung chọn mẫu cũ.
assert.equal(fs.existsSync(new URL("../app/supplier/portal/storefront/theme-editor.tsx", import.meta.url)), false);
assert.equal(fs.existsSync(new URL("../app/supplier/portal/storefront/theme-actions.ts", import.meta.url)), false);
const storefront = read("components/public/supplier-storefront.tsx");
assert.match(storefront, /\{premium \? <div style=\{toneStyle\}><PremiumHeader/);
assert.match(storefront, /const savedTheme = normalizeStorefrontTheme\(s\.storefront_theme\);/);
assert.match(storefront, /\?\? legacyLayout\(savedTheme, showcase\)/, "Chưa áp dụng bố cục mới vẫn giữ số liệu và khối ảnh cũ");
const premium = read("components/public/premium-storefront.tsx");
for (const name of ["Elegant", "Gallery"]) assert.doesNotMatch(premium, new RegExp(`function ${name}\\(`), `Đã bỏ mẫu ${name}`);
const header = read("components/public/premium-header.tsx");
assert.match(header, /p\.checks/, "Dải xác minh dùng chung");
assert.match(header, /bg-\[var\(--sf-dark\)\] text-white/, "Kiểu Hiện đại: nền tối, chữ trắng");
assert.match(header, /p\.coverUrl && <img/, "Ảnh bìa làm nền đầu trang");
assert.match(read("components/storefront-designer/storefront-designer.tsx"), /<PremiumHeader /, "Xem trước dùng đúng đầu trang thật");

// 5. Ngoại lệ màu được ghi trong tài liệu thương hiệu.
assert.match(read("docs/brand-identity.md"), /Premium\/Pro supplier page templates/);

console.log("✅ Giao diện Premium/Pro: một đầu trang chung kiểu Hiện đại, 4 tông đã duyệt, câu giới thiệu tiếng Anh, chỉ dùng khi gói còn hiệu lực.");
