// node --experimental-strip-types --no-warnings scripts/check-marketplace-search.mjs
// Exercises the real public catalogue gates and ranked projection, then renders
// the search page with a local in-memory store (no network or production data).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assignProductCategory } from "../lib/public/category-assignment.ts";
import * as attributes from "../lib/product-attributes.ts";
import * as readiness from "../lib/media/readiness.ts";
import * as ranking from "../lib/public/ranking.ts";
import * as searchRanking from "../lib/public/search-ranking.ts";
import * as grade from "../lib/public/grade-resolution.ts";
import * as displayName from "../lib/public/display-name.ts";
import * as detail from "../lib/public/product-detail-display.ts";
import * as verification from "../lib/verification-status.ts";
import * as categoryNames from "../lib/public/category-names.ts";
import * as comparison from "../lib/public/product-comparison.ts";
import * as supplierSeo from "../lib/public/supplier-seo.ts";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const silentConsole = { ...console, error() {} };
function load(path, mocks) {
  const exports = {};
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console: silentConsole, process, Date, Map, Set, URLSearchParams,
    require: (name) => {
      if (name === "server-only") return {};
      assert.ok(name in mocks, `${path}: unexpected import ${name}`);
      return mocks[name];
    },
  }, { filename: path });
  return exports;
}

const selection = load("../lib/public/product-selection.ts", {
  "@/lib/public/category-assignment": { assignProductCategory },
});
const english = load("../lib/public/supplier-english.ts", { "@/lib/public/product-detail-display": detail });
const category = (id, en, vi, parent_id = null, extra = {}) => ({
  id, slug: id, parent_id, name_i18n: { en, vi }, status: "published", is_published: true,
  product_fields: [{ key: "grade", label: "Grade", type: "select", options: ["W320", "W240", "ST25"], filterable: true }],
  sort_order: 1, ...extra,
});
const categories = [
  category("nuts", "Nuts", "Các loại hạt"),
  category("cashew", "Cashew", "Hạt điều", "nuts"),
  category("nut-snacks", "Roasted snacks", "Hạt rang", "cashew"),
  category("rice", "Rice", "Gạo"),
  category("draft-category", "Draft category", "Bản nháp", null, { status: "draft", is_published: false }),
];
const supplier = (id, name, extra = {}) => ({
  id, name, display_name: name, trade_name: null, slug: id, province: "Bình Phước",
  profile_translation_meta: null, status: "published", is_demo: false, summary_i18n: {},
  products: "Food", moq_text: "1 MT", lead_time_days: 14, ...extra,
});
const suppliers = [
  supplier("alpha", "Alpha Foods"),
  supplier("beta", "Beta Trading"),
  supplier("rice-supplier", "Rice Merchant"),
  supplier("van-phuoc", "Vạn Phước"),
  supplier("draft-supplier", "Hidden Supplier", { status: "draft" }),
  supplier("demo-supplier", "Demo supplier", { is_demo: true }),
  supplier("sample-supplier", "Test Supplier"),
  supplier("contact-supplier", "Contact sales@secret.example.com +84 987 654 321"),
];
const product = (id, supplier_id, categorySlug, name, extra = {}) => ({
  id, supplier_id, name, display_name: null, name_i18n: { en: name }, category: categorySlug,
  reviewed_category_slug: categorySlug, supplier_originated: false, supplier_review_status: "approved",
  description: null, spec: null, specs: {}, ready_for_buyer: true, moq: "1 MT", unit: "kg",
  ref_price: null, price_publicly_visible: false, currency: "USD", price_valid_until: null,
  lead_time_days: 14, incoterm: "FOB", oem: false, odm: false, samples: false,
  created_at: "2026-01-01", updated_at: "2026-01-01", ...extra,
});
const baseProducts = [
  product("a-w320", "alpha", "cashew", "Cashew W320", { specs: { grade: "W320", secret_spec: "private-spec-marker" }, supplier_review_note: "private-review-marker", ref_price: 98765 }),
  product("a-w240", "alpha", "cashew", "Cashew W240", { specs: { grade: "W240" } }),
  product("a-w320b", "alpha", "cashew", "Cashew W320 second", { specs: { grade: "W320" } }),
  product("a-w320c", "alpha", "cashew", "Cashew W320 third", { specs: { grade: "W320" } }),
  product("a-w320d", "alpha", "cashew", "Cashew W320 fourth", { specs: { grade: "W320" } }),
  product("b-snack", "beta", "nut-snacks", "Roasted snack"),
  product("rice-st25", "rice-supplier", "rice", "Jasmine rice ST25", { specs: { grade: "ST25" } }),
  product("root-item", "van-phuoc", "nuts", "Nut assortment"),
  product("hidden-source", "alpha", "cashew", "private-raw-name-marker", { display_name: "Public special offer" }),
  product("paused", "alpha", "cashew", "Cashew W320 paused", { supplier_review_status: "paused" }),
  product("not-ready", "alpha", "cashew", "Cashew W320 not ready", { ready_for_buyer: false }),
  product("not-approved", "alpha", "cashew", "Cashew W320 draft", { supplier_review_status: "draft" }),
  product("no-category-review", "alpha", "cashew", "Cashew W320 unreviewed", { supplier_originated: true, reviewed_category_slug: null }),
  product("no-buyer-media", "alpha", "cashew", "Cashew W320 internal image"),
  product("expired-media", "alpha", "cashew", "Cashew W320 expired image"),
  product("draft-owner", "draft-supplier", "cashew", "Cashew W320 private owner"),
  product("demo-product", "demo-supplier", "cashew", "Cashew W320 demo"),
  product("synthetic-product", "sample-supplier", "cashew", "Cashew W320 synthetic"),
  product("test-only", "alpha", "cashew", "TEST ONLY Cashew W320"),
  product("draft-category-product", "alpha", "draft-category", "Cashew W320 private category"),
];
const mediaFor = (p, extra = {}) => ({
  id: `media-${p.id}`, owner_type: "product", product_id: p.id, supplier_id: p.supplier_id,
  kind: "image", audience: "buyer", status: "checked", expires_on: null,
  storage_path: `products/${p.id}.jpg`, thumb_path: null, sort_order: 0, created_at: "2026-01-01", ...extra,
});
let rows = [...baseProducts];
let media = baseProducts.map((p) => mediaFor(p, p.id === "no-buyer-media" ? { audience: "internal", storage_path: "private/internal.jpg" }
  : p.id === "expired-media" ? { expires_on: "2020-01-01" } : {}));
// An additional private asset must never become a search thumbnail.
media.push(mediaFor(baseProducts[0], { id: "private-image", audience: "internal", storage_path: "private/evidence.jpg" }));
let failure = "";
let counts = {};
const track = (key) => { counts[key] = (counts[key] ?? 0) + 1; };
const store = {
  listCategories: async (opts) => {
    track("categories");
    if (failure === "categories") throw new Error("simulated category failure");
    return opts?.publishedOnly ? categories.filter((c) => c.is_published) : categories;
  },
  listSuppliers: async () => { track("suppliers"); return suppliers; },
  listProducts: async () => {
    track("products");
    if (failure === "products") throw new Error("simulated catalogue failure");
    return rows;
  },
  listMedia: async () => [],
  listMediaForProducts: async (ids) => {
    track("productMedia");
    if (failure === "media") throw new Error("simulated media page failure");
    const wanted = new Set(ids);
    return media.filter((m) => wanted.has(m.product_id));
  },
  listVerifications: async (id) => {
    if (failure === "verification") throw new Error("simulated verification page failure");
    return (id === "alpha" ? [1, 2, 3] : id === "beta" ? [1] : [])
      .map((target_level) => ({ target_level, status: "approved" }));
  },
  listCertificates: async () => {
    if (failure === "certificate") throw new Error("simulated certificate page failure");
    return [];
  },
};
const db = { getStore: () => store };
const catalog = load("../lib/public/catalog.ts", {
  "@/lib/products/product-form-staging-access": { isSyntheticProductFormStaging: () => false },
  "@/lib/db": db,
  "@/lib/media/readiness": readiness,
  "@/lib/verification-status": verification,
  "@/lib/public/product-selection": selection,
  "@/lib/public/display-name": displayName,
});
const priceUnits = load("../lib/public/price-units.ts", {});
const gradePricing = load("../lib/products/grade-pricing.ts", {
  "@/lib/public/price-units": priceUnits,
  "@/lib/public/grade-resolution": grade,
});
const productCatalog = load("../lib/public/product-catalog.ts", {
  "@/lib/db": db,
  "@/lib/product-attributes": attributes,
  "@/lib/media/readiness": readiness,
  "@/lib/public/catalog": catalog,
  "@/lib/public/supplier-seo": supplierSeo,
  "@/lib/public/product-selection": selection,
  "@/lib/public/grade-resolution": grade,
  "@/lib/products/grade-pricing": gradePricing,
  "@/lib/public/ranking": ranking,
  "@/lib/public/display-name": displayName,
  "@/lib/public/supplier-english": english,
  "@/lib/public/product-detail-display": detail,
});

// The shared snapshot must return exactly the same gated cards and order as the
// existing per-category API. It must not change the scoring weights or prices.
const cashew = categories.find((c) => c.slug === "cashew");
const baseline = await productCatalog.listPublicCategoryProducts(cashew, { today: "2026-10-28" });
const snapshot = await productCatalog.loadPublicProductCatalogSnapshot({ categories });
const shared = await productCatalog.listPublicCategoryProducts(cashew, { today: "2026-10-28", snapshot });
assert.equal(JSON.stringify(shared), JSON.stringify(baseline), "The shared snapshot preserves every public card, gate and ranked order");
const allowed = new Set(shared.map((p) => p.id));
for (const id of ["a-w320", "a-w240", "a-w320b", "a-w320c", "a-w320d", "hidden-source"]) assert.ok(allowed.has(id), id);
for (const id of ["paused", "not-ready", "not-approved", "no-category-review", "no-buyer-media", "expired-media", "draft-owner", "demo-product", "synthetic-product", "test-only", "draft-category-product"]) {
  assert.ok(!allowed.has(id), `${id} must not enter the public catalogue`);
}
const publicCard = shared.find((p) => p.id === "a-w320");
assert.equal(publicCard.price, null, "A private price cannot be exposed by search");
assert.equal(publicCard.attributes.secret_spec, undefined, "Only configured public attributes survive projection");
assert.ok(!JSON.stringify(publicCard).includes("private-review-marker"));
assert.ok(!JSON.stringify(publicCard).includes("private/evidence.jpg"));
assert.deepEqual(Object.values(ranking.SPEC_RANKING_WEIGHTS), [30, 30, 15, 15, 10], "The existing ranking weights remain unchanged");

const Link = ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children);
const cardProps = [];
const Card = (props) => {
  cardProps.push(props);
  const id = decodeURIComponent(props.href.split("?")[0].split("/").at(-1));
  return React.createElement("article", { "data-product-id": id }, props.name);
};
const icons = new Proxy({}, { get: () => () => null });
const searchCatalog = {
  ...productCatalog,
  listPublicCategoryProducts: async (c, opts) => {
    if (failure === `category:${c.slug}`) throw new Error("simulated category failure");
    return productCatalog.listPublicCategoryProducts(c, opts);
  },
};
const page = load("../app/(public)/search/page.tsx", {
  "react/jsx-runtime": jsx,
  "next/link": { default: Link },
  "lucide-react": icons,
  "@/components/ui": { Breadcrumbs: () => null },
  "@/components/public-product-card": { PublicProductCard: Card },
  "@/lib/db": db,
  "@/lib/public/category-names": categoryNames,
  "@/lib/public/grade-resolution": grade,
  "@/lib/public/product-catalog": searchCatalog,
  "@/lib/public/product-comparison": comparison,
  "@/lib/public/product-selection": selection,
  "@/lib/public/ranking": ranking,
  "@/lib/public/search-ranking": searchRanking,
  "@/lib/public/supplier-seo": supplierSeo,
  "@/lib/public/supplier-english": english,
}).default;
async function render(params = {}) {
  counts = {};
  cardProps.length = 0;
  return renderToStaticMarkup(await page({ searchParams: Promise.resolve(params) }));
}
const ids = (html) => [...html.matchAll(/data-product-id="([^"]+)"/g)].map((m) => m[1]);
const supplierHrefs = (html) => [...html.matchAll(/href="\/suppliers\/([^"?]+)(?:\?[^"#]*)?"/g)].map((m) => m[1]);

// Empty search offers real browsing without spending a catalogue read.
let html = await render({ lang: "vi" });
assert.match(html, /Tìm sản phẩm và nhà cung cấp/);
assert.match(html, /<form\b[^>]*action="\/search"/);
assert.match(html, /name="q"/);
assert.match(html, /name="cat"/);
assert.match(html, /name="lang" value="vi"/);
assert.match(html, /Xem danh mục/);
assert.equal(counts.products ?? 0, 0, "An empty search does not load or mislabel the whole product catalogue");

html = await render({ q: "  W320 ", cat: "cashew", lang: "vi" });
assert.match(html, /Kết quả tìm kiếm/);
assert.match(html, /Danh mục:/);
assert.deepEqual(new Set(ids(html)), new Set(["a-w320", "a-w320b", "a-w320c", "a-w320d"]), "All four matching offers from one supplier must remain visible");
assert.ok(supplierHrefs(html).includes("alpha"), "A matched product also makes its supplier discoverable");
assert.equal(counts.suppliers, 1, "All category calls share one supplier snapshot");
assert.equal(counts.products, 1, "Supplier projection and every category share one product snapshot");
assert.ok(!JSON.stringify(cardProps).includes("private-review-marker"));
assert.ok(!JSON.stringify(cardProps).includes("private-spec-marker"));
assert.ok(!html.includes("private/evidence.jpg"));
assert.ok(!html.includes("98765"));
assert.ok(cardProps.every((card) => !card.comparison), "A category with only one supplier has no comparison option");

html = await render({ q: "hat dieu w320", cat: "nuts", lang: "vi" });
assert.equal(ids(html).length, 4, "Vietnamese search ignores accents and combines category names with a public grade");
html = await render({ q: "van phuoc", lang: "vi" });
assert.ok(supplierHrefs(html).includes("van-phuoc"), "Vietnamese names can be found without diacritics, including đ");
assert.ok(ids(html).includes("root-item"), "Searching a supplier also finds its public products");
assert.ok(html.indexOf('aria-label="Nhà cung cấp phù hợp"') < html.indexOf('aria-label="Sản phẩm phù hợp"'),
  "A supplier-name-only query keeps suppliers first");
const savedVan = suppliers[3];
const beforeNameTest = rows;
suppliers[3] = { ...savedVan, name: "Vạn Phước Nuts", display_name: "Vạn Phước Nuts" };
rows = rows.map((p) => p.id === "root-item" ? { ...p, name: "Van Phuoc Nuts assorted", name_i18n: { en: "Van Phuoc Nuts assorted" } } : p);
html = await render({ q: "van phuoc nuts", lang: "vi" });
assert.ok(ids(html).includes("root-item"));
assert.ok(html.indexOf('aria-label="Nhà cung cấp phù hợp"') < html.indexOf('aria-label="Sản phẩm phù hợp"'),
  "An exact multi-word supplier name stays first even when the same words are in a product");
suppliers[3] = savedVan;
rows = beforeNameTest;

html = await render({ cat: "nuts", lang: "vi" });
assert.ok(ids(html).includes("b-snack"), "A parent includes a published grandchild");
assert.ok(ids(html).includes("a-w320"), "A parent includes its published child");
assert.ok(ids(html).includes("root-item"), "A parent includes its own products");
assert.ok(!ids(html).includes("rice-st25"), "A different category cannot leak into results");
assert.ok(supplierHrefs(html).includes("beta"));
assert.ok(!supplierHrefs(html).includes("rice-supplier"), "Supplier category filter uses genuinely public products");
html = await render({ q: "rice", cat: "nuts", lang: "vi" });
assert.match(html, /Không tìm thấy kết quả/);
assert.equal(ids(html).length, 0);
assert.ok(!supplierHrefs(html).includes("rice-supplier"));
html = await render({ q: "Beta", cat: "rice" });
assert.match(html, /No matching results/);
assert.equal(ids(html).length, 0);

for (const query of ["private-spec-marker", "private-review-marker", "private-raw-name-marker", "sales@secret.example.com", "+84 987 654 321", "doesnotexist-987654"]) {
  html = await render({ q: query });
  assert.match(html, /No matching results/, `${query} is not a public search field`);
  assert.equal(ids(html).length, 0);
  assert.equal(supplierHrefs(html).length, 0);
}
html = await render({ q: "W320", cat: "draft-category", lang: "vi" });
assert.match(html, /không tồn tại hoặc chưa được công khai/);
assert.equal(counts.products ?? 0, 0, "Invalid/private categories never silently fall back to all results");
html = await render({ q: ["W320", "rice"], cat: ["cashew", "rice"], lang: ["vi", "en"] });
assert.equal(ids(html).length, 4, "Repeated parameters use their first value safely");
assert.match(html, /Kết quả tìm kiếm/);
html = await render({ q: "z".repeat(160) });
assert.ok(html.includes("z".repeat(120)));
assert.ok(!html.includes("z".repeat(121)), "Untrusted query text is limited to 120 characters");

failure = "categories";
html = await render({ q: "W320", lang: "vi" });
assert.match(html, /Chưa tải được kết quả tìm kiếm/);
assert.doesNotMatch(html, /Không tìm thấy kết quả/);
failure = "products";
html = await render({ q: "W320" });
assert.match(html, /Search results could not be loaded/);
assert.doesNotMatch(html, /No matching results/);
failure = "category:cashew";
html = await render({ q: "W320", cat: "cashew", lang: "vi" });
assert.match(html, /Một số kết quả chưa tải được/);
assert.doesNotMatch(html, /Không tìm thấy kết quả/);
html = await render({ q: "rice", lang: "vi" });
assert.match(html, /Một số kết quả chưa tải được/);
assert.ok(ids(html).includes("rice-st25"), "A failing category does not hide healthy category results");
failure = "verification";
html = await render({ q: "W320", lang: "vi" });
assert.match(html, /Chưa tải được kết quả tìm kiếm/, "A failed evidence page does not silently erase a supplier's checks");
failure = "media";
html = await render({ q: "W320", cat: "cashew", lang: "vi" });
assert.match(html, /Một số kết quả chưa tải được/, "A failed media page is not reported as no matching products");
failure = "certificate";
html = await render({ q: "W320", cat: "cashew", lang: "vi" });
assert.match(html, /Một số kết quả chưa tải được/, "A failed certificate page cannot silently change the existing ranking");
failure = "";
const sharedSnapshot = await productCatalog.loadPublicProductCatalogSnapshot({ categories });
counts = {};
const [concurrentA, concurrentB] = await Promise.all([
  productCatalog.listPublicCategoryProducts(cashew, { snapshot: sharedSnapshot }),
  productCatalog.listPublicCategoryProducts(cashew, { snapshot: sharedSnapshot }),
]);
assert.equal(JSON.stringify(concurrentA), JSON.stringify(concurrentB));
assert.equal(counts.productMedia, 1, "Concurrent requests within one server snapshot share in-flight media reads");
const cachedCategories = [...sharedSnapshot.categoryByProduct];
assert.ok(cachedCategories.length > 0, "Product categories are computed within the request");
await productCatalog.listPublicCategoryProducts(categories.find((c) => c.slug === "rice"), { snapshot: sharedSnapshot });
assert.equal(JSON.stringify([...sharedSnapshot.categoryByProduct]), JSON.stringify(cachedCategories),
  "Another category reuses the same per-product category decisions");

// Relevance and B rounds are global across categories, even when an unrelated
// supplier name looks like a grade and has the highest verification tier.
const savedAlpha = suppliers[0];
const savedMedia = media;
suppliers[0] = { ...savedAlpha, name: "W320 Export", display_name: "W320 Export" };
suppliers.push(supplier("delta", "Delta Trading"));
const mixed = [
  product("b-w320", "beta", "nut-snacks", "Roasted W320", { specs: { grade: "W320" } }),
  product("d-w320", "delta", "cashew", "Whole W320", { specs: { grade: "W320" } }),
  product("a-misleading", "alpha", "cashew", "Cashew W320 confusing", { specs: { grade: "W240" } }),
  product("a-multigrade", "alpha", "cashew", "Z Cashew W240 W320"),
];
rows = [...baseProducts, ...mixed];
media = [...savedMedia, ...mixed.map((p) => mediaFor(p))];
html = await render({ q: "W320", lang: "vi" });
let orderedMixed = ids(html);
assert.ok(orderedMixed[0].startsWith("a-w320"), "The first round starts with the highest-tier actual W320");
assert.deepEqual(orderedMixed.slice(1, 3), ["b-w320", "d-w320"], "Each supplier gets a turn across categories before alpha repeats");
assert.ok(orderedMixed.indexOf("a-w240") > orderedMixed.indexOf("d-w320"), "Supplier-name-only W240 follows genuine W320");
assert.ok(orderedMixed.indexOf("a-misleading") > orderedMixed.indexOf("d-w320"), "Structured W240 prevents a misleading W320 title from outranking real W320");
assert.ok(orderedMixed.indexOf("a-multigrade") < orderedMixed.indexOf("a-misleading"), "An inferred grade does not suppress another grade explicitly listed in the name");
assert.ok(html.indexOf('aria-label="Sản phẩm phù hợp"') < html.indexOf('aria-label="Nhà cung cấp phù hợp"'),
  "Product matches are not hidden below a block of supplier-name matches");
assert.match(html, /href="#search-products"/);
assert.match(html, /href="#search-suppliers"/, "Buyers can jump to suppliers when products are first");
assert.match(html, /aria-label="Xem danh mục Hạt điều &amp; Nhân điều xuất khẩu"/);
assert.match(html, /aria-label="Xem danh mục Hạt rang"/);
const cardId = (card) => decodeURIComponent(card.href.split("?")[0].split("/").at(-1));
const mixedCards = new Map(cardProps.map((card) => [cardId(card), card]));
assert.ok(mixedCards.get("d-w320").comparison, "An alternative supplier in the same category enables comparison");
assert.equal(mixedCards.get("b-w320").comparison, undefined, "A different category does not create a comparison peer");
const otherIndustry = product("other-industry-w320", "rice-supplier", "rice", "Rice W320", { specs: { grade: "W320" } });
rows.push(otherIndustry);
media.push(mediaFor(otherIndustry));
html = await render({ q: "WW320", lang: "vi" });
assert.ok(ids(html).includes("b-w320") && ids(html).includes("d-w320"), "WW320 also finds public W320 offers");
assert.ok(!ids(html).includes("other-industry-w320"), "Cashew aliases do not create matches in other categories");
suppliers[0] = savedAlpha;
suppliers.pop();
rows = [...baseProducts];
media = savedMedia;

// Five suppliers spanning four categories and three pages. Tier is preferred
// inside each round, and the next round starts even when a page ends mid-round.
const crossSuppliers = ["alpha", "beta", "rice-supplier", "van-phuoc", "contact-supplier"];
const crossCategories = ["cashew", "nut-snacks", "rice", "nuts", "cashew"];
const cross = crossSuppliers.flatMap((supplierId, s) => Array.from({ length: 11 }, (_, n) =>
  product(`cross-${s}-${n}`, supplierId, crossCategories[s], `Roundneedle lot ${String(n).padStart(2, "0")} supplier ${s}`)));
rows = [...baseProducts, ...cross];
media = [...savedMedia, ...cross.map((p) => mediaFor(p))];
const crossPages = [];
for (let p = 1; p <= 3; p++) {
  html = await render({ q: "Roundneedle", lang: "vi", p: String(p) });
  crossPages.push(...ids(html));
}
assert.equal(crossPages.length, 55);
assert.deepEqual(new Set(crossPages), new Set(cross.map((p) => p.id)));
const crossById = new Map(cross.map((p) => [p.id, p]));
for (let start = 0; start < crossPages.length; start += 5) {
  const suppliersInRound = crossPages.slice(start, start + 5).map((id) => crossById.get(id).supplier_id);
  assert.equal(new Set(suppliersInRound).size, 5, "Each cross-category round has one offer per supplier");
  assert.deepEqual(suppliersInRound.slice(0, 2), ["alpha", "beta"], "Higher verified tiers lead each round");
}
html = await render({ q: "Roundneedle", cat: "nuts", lang: "vi" });
assert.match(html, /44 sản phẩm/, "Category filters still limit the global search scope");
assert.ok(cardProps.every((card) => !card.href.includes("/products/rice/")));
rows = [...baseProducts];
media = savedMedia;

// A comparison peer beyond the current page is still a real result, but a
// different category must not count. The first page contains only one supplier.
const extras = Array.from({ length: 21 }, (_, i) => product(`peer-alpha-${i}`, "alpha", "cashew", `Cashew W320 extra ${i}`, { specs: { grade: "W320" } }));
const latePeer = product("peer-beta", "beta", "cashew", "Cashew W3200");
rows = [...baseProducts, ...extras, latePeer];
media = [...savedMedia, ...extras.map((p) => mediaFor(p)), mediaFor(latePeer)];
html = await render({ q: "W320", cat: "cashew", lang: "vi" });
assert.equal(ids(html).length, 24);
assert.ok(!ids(html).includes("peer-beta"), "The partial-code peer is on a later page");
assert.ok(cardProps.every((card) => card.comparison?.categorySlug === "cashew"), "A peer on a later page enables comparison");
html = await render({ q: "W320", cat: "cashew", lang: "vi", p: "2" });
assert.ok(ids(html).includes("peer-beta"));
rows = [...baseProducts];
media = savedMedia;

// A larger set exercises both independent pagers and verifies that every card
// remains reachable exactly once, with supplier rounds continuing across pages.
for (let i = 1; i <= 17; i++) suppliers.push(supplier(`bulk-supplier-${i}`, `Bulkneedle supplier ${i}`));
const bulk = Array.from({ length: 53 }, (_, i) => product(`bulk-${i + 1}`, `bulk-supplier-${(i % 17) + 1}`, "cashew", `Bulkneedle lot ${String(i + 1).padStart(2, "0")}`));
rows = [...baseProducts, ...bulk];
media = [...media, ...bulk.map((p) => mediaFor(p))];
const firstPage = await render({ q: "Bulkneedle", cat: "cashew", lang: "vi" });
assert.match(firstPage, /53 sản phẩm/);
assert.match(firstPage, /17 nhà cung cấp/);
assert.match(firstPage, /Trang 1\/3/);
assert.match(firstPage, /Trang 1\/2/);
assert.equal(ids(firstPage).length, 24);
assert.match(firstPage, /q=Bulkneedle&amp;cat=cashew&amp;lang=vi&amp;p=2/);
const secondPage = await render({ q: "Bulkneedle", cat: "cashew", lang: "vi", p: "2", s: "2" });
assert.equal(ids(secondPage).length, 24);
assert.match(secondPage, /q=Bulkneedle&amp;cat=cashew&amp;lang=vi&amp;p=3&amp;s=2/, "Product paging preserves the supplier page");
assert.match(secondPage, /q=Bulkneedle&amp;cat=cashew&amp;lang=vi&amp;p=2/, "Supplier paging preserves the product page");
assert.equal(supplierHrefs(secondPage).length, 5);
const thirdPage = await render({ q: "Bulkneedle", cat: "cashew", lang: "vi", p: "3" });
assert.equal(ids(thirdPage).length, 5);
const bulkPages = [...ids(firstPage), ...ids(secondPage), ...ids(thirdPage)];
assert.deepEqual(new Set(bulkPages), new Set(bulk.map((p) => p.id)), "All product pages contain exactly the matching offers");
const bulkSupplier = new Map(bulk.map((p) => [p.id, p.supplier_id]));
for (let start = 0; start < bulkPages.length; start += 17) {
  const round = bulkPages.slice(start, start + 17).map((id) => bulkSupplier.get(id));
  assert.equal(new Set(round).size, round.length, "A supplier appears at most once per global round, including across pages");
}
assert.deepEqual(ids(await render({ q: "Bulkneedle", cat: "cashew", lang: "vi", p: "2", s: "2" })), ids(secondPage),
  "Repeated requests with unchanged data have the same page order");
const beyond = await render({ q: "Bulkneedle", cat: "cashew", p: "999999", s: "999999" });
assert.equal(ids(beyond).length, 5, "Out-of-range pages clamp to the last page");
assert.match(beyond, /Page 3 of 3/);

// Exercise the real catalogue, unchanged ranking and every search page above
// PostgREST's typical 1,000-row cap. Timing is local/in-memory, not production.
for (let i = 0; i < 125; i++) suppliers.push(supplier(`scale-supplier-${i}`, `Scaleneedle supplier ${i}`));
const large = Array.from({ length: 1025 }, (_, i) => product(`scale-${i}`, `scale-supplier-${i % 125}`, "cashew", `Scaleneedle lot ${String(i).padStart(4, "0")}`));
rows = [...baseProducts, ...large];
media = [...baseProducts.map((p) => mediaFor(p)), ...large.map((p) => mediaFor(p))];
const scaleStarted = performance.now();
const seenPages = [];
for (let p = 1; p <= Math.ceil(large.length / 24); p++) {
  const rendered = await render({ q: "Scaleneedle", cat: "cashew", lang: "vi", p: String(p) });
  assert.match(rendered, /1025 sản phẩm/);
  assert.match(rendered, /125 nhà cung cấp/);
  assert.equal(counts.products, 1, "Each search shares the product read across suppliers and categories");
  seenPages.push(...ids(rendered));
}
assert.equal(seenPages.length, 1025);
assert.equal(new Set(seenPages).size, 1025, "All pages have distinct offers");
assert.deepEqual(new Set(seenPages), new Set(large.map((p) => p.id)), "Every matching offer is reachable");
const scaleSupplier = new Map(large.map((p) => [p.id, p.supplier_id]));
for (let start = 0; start < seenPages.length; start += 125) {
  const round = seenPages.slice(start, start + 125).map((id) => scaleSupplier.get(id));
  assert.equal(new Set(round).size, round.length, "Large-catalog supplier rounds do not reset at page boundaries");
}
const scaleMs = Math.round(performance.now() - scaleStarted);

// Suppliers have their own independent 12-card pager; test beyond 1,000 too.
suppliers.length = 0;
for (let i = 0; i < 1009; i++) suppliers.push(supplier(`wide-supplier-${i}`, `Wideneedle supplier ${String(i).padStart(4, "0")}`));
const wide = suppliers.map((s, i) => product(`wide-product-${i}`, s.id, "cashew", `Wideneedle lot ${String(i).padStart(4, "0")}`));
rows = wide;
media = wide.map((p) => mediaFor(p));
store.listVerificationsForSuppliers = async () => [];
const supplierStarted = performance.now();
const supplierPages = [];
for (let s = 1; s <= Math.ceil(suppliers.length / 12); s++) {
  const rendered = await render({ q: "Wideneedle", cat: "cashew", lang: "vi", s: String(s) });
  assert.match(rendered, /1009 nhà cung cấp/);
  supplierPages.push(...supplierHrefs(rendered));
}
assert.equal(supplierPages.length, 1009);
assert.equal(new Set(supplierPages).size, 1009, "All supplier pages have distinct suppliers");
assert.deepEqual(new Set(supplierPages), new Set(suppliers.map((s) => s.slug)), "No supplier disappears after the first 1,000");
const supplierMs = Math.round(performance.now() - supplierStarted);

console.log(`✅ Marketplace search: relevance and supplier rounds across categories/pages; 1,025 products / 43 pages (${scaleMs} ms) and 1,009 suppliers / 85 pages (${supplierMs} ms), local in-memory timings only.`);
