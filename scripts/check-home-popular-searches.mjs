// node scripts/check-home-popular-searches.mjs
// Chip "Popular searches" trên trang chủ phải trỏ vào danh mục đang có thật.
// Trước 21/10/2026 danh sách viết cứng 6 slug (cashew, coffee, pepper, cinnamon,
// coconut, rice) nên trên production bấm chip nào cũng 404.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const ROOT = new URL("..", import.meta.url).pathname;

function loadModule(rel) {
  const file = path.join(ROOT, rel);
  const source = fs.readFileSync(file, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const require = (id) => {
    if (id === "@/lib/types") return {};
    throw new Error(`Không stub được module: ${id}`);
  };
  const context = vm.createContext({ module, exports: module.exports, require, console, URL, encodeURIComponent });
  vm.runInContext(js, context, { filename: file });
  return module.exports;
}

const { buildPopularSearches, POPULAR_SEARCH_LIMIT, POPULAR_SEARCH_LABELS } = loadModule("lib/public/popular-searches.ts");
const cat = (slug) => ({ slug, name_i18n: { en: slug } });
const titleFor = (c) => c.name_i18n.en;

/* ------------- 1. Đúng dữ liệu production sau bộ ra mắt 23/10/2026 ------------- */
// Thủy sản đã ẩn nên không còn chip; ba danh mục ra mắt cộng dried-fruits giữ lại.
const named = (slug, en) => ({ slug, name_i18n: { en } });
const production = [
  named("dried-fruits", "Dried fruits"),
  named("pepper", "Pepper"),
  named("cashew-kernels", "Cashew kernels"),
  named("cinnamon-star-anise", "Cinnamon and star anise"),
];
const prodChips = buildPopularSearches({ categories: production, lang: "en", titleFor });
const prodSlugs = new Set(production.map((c) => c.slug));
for (const chip of prodChips) {
  const slug = decodeURIComponent(chip.href.replace("/products/", ""));
  assert.ok(prodSlugs.has(slug), `Chip "${chip.label}" trỏ vào danh mục không tồn tại: ${chip.href}`);
}
assert.equal(prodChips.length, 4, "Mỗi danh mục đang published có đúng một chip");
assert.equal(JSON.stringify(prodChips.map((c) => c.href)), JSON.stringify([
  "/products/pepper",
  "/products/dried-fruits",
  "/products/cashew-kernels",
  "/products/cinnamon-star-anise",
]), "Chip xếp theo bảng nhãn thương mại trước, danh mục chưa có nhãn theo sau");

/* ------------- 2. Danh mục cũ có thật trở lại thì chip hiện, không có thì biến mất ------------- */
const legacySlugs = ["cashew", "coffee", "pepper", "cinnamon", "coconut", "rice"];
const legacyChips = buildPopularSearches({ categories: legacySlugs.map(cat), lang: "en", titleFor });
assert.equal(legacyChips.length, 6, "Danh mục cũ có published thì chip hiện lại bình thường");
assert.equal(JSON.stringify(legacyChips.map((c) => c.href)), JSON.stringify(legacySlugs.map((s) => `/products/${s}`)));
assert.equal(buildPopularSearches({ categories: [], lang: "en", titleFor }).length, 0, "Chưa publish danh mục nào thì không hiện chip nào");

const onlyCashew = buildPopularSearches({ categories: [cat("cashew")], lang: "en", titleFor });
assert.equal(JSON.stringify(onlyCashew), JSON.stringify([{ label: "Cashew W320", href: "/products/cashew" }]), "Có danh mục thì mới có chip, đúng nhãn thương mại");

/* ------------- 3. Nhãn tiếng Việt và danh mục mới thêm trong CRM ------------- */
const viChips = buildPopularSearches({ categories: [cat("cashew"), cat("dried-fruits"), cat("brand-new")], lang: "vi", titleFor: (c) => `${c.slug}-vi` });
assert.equal(viChips[0].label, "Hạt điều W320");
assert.equal(viChips[1].label, "Trái cây sấy", "Slug có nhãn thương mại thì dùng nhãn tiếng Việt");
assert.equal(viChips[2].label, "brand-new-vi", "Danh mục mới thêm trong CRM dùng tên đang hiển thị");

const many = Array.from({ length: 12 }, (_, i) => cat(`cat-${i}`));
const limited = buildPopularSearches({ categories: many, lang: "en", titleFor });
assert.equal(limited.length, POPULAR_SEARCH_LIMIT, `Tối đa ${POPULAR_SEARCH_LIMIT} chip`);
assert.equal(new Set(limited.map((c) => c.href)).size, limited.length, "Không lặp chip");

/* ------------- 4. Nhãn thương mại phải có đủ hai thứ tiếng ------------- */
for (const [slug, label] of Object.entries(POPULAR_SEARCH_LABELS)) {
  assert.ok(label.en && label.vi, `Nhãn chip thiếu bản dịch: ${slug}`);
  assert.match(slug, /^[a-z0-9-]+$/, `Slug chip sai định dạng: ${slug}`);
}

/* ------------- 5. Trang chủ không được quay lại kiểu viết cứng ------------- */
const home = fs.readFileSync(path.join(ROOT, "app/(public)/home.tsx"), "utf8");
assert.ok(!home.includes("POPULAR_KEYWORDS_EN"), "Đã bỏ mảng chip viết cứng");
assert.ok(!home.includes("POPULAR_KEYWORDS_VI"), "Đã bỏ mảng chip viết cứng");
assert.ok(home.includes("buildPopularSearches"), "Trang chủ dùng hàm dựng chip từ danh mục thật");
assert.ok(home.includes("popularKeywords.length > 0"), "Không có chip nào thì ẩn cả dòng Popular searches");

console.log("✅ check-home-popular-searches: chip tìm nhanh chỉ trỏ vào danh mục đang published");
console.log(`   · production mẫu ${production.length} danh mục → ${prodChips.length} chip · tối đa ${POPULAR_SEARCH_LIMIT} chip`);
