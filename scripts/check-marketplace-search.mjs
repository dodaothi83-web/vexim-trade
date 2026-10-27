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
import * as grade from "../lib/public/grade-resolution.ts";
import * as displayName from "../lib/public/display-name.ts";
import * as detail from "../lib/public/product-detail-display.ts";
import * as verification from "../lib/verification-status.ts";
import * as categoryNames from "../lib/public/category-names.ts";
import * as productOrder from "../lib/public/supplier-product-order.ts";
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
  listMediaForProducts: async (ids) => { track("productMedia"); return media.filter((m) => ids.includes(m.product_id)); },
  listVerifications: async (id) => (id === "alpha" ? [1, 2, 3] : id === "beta" ? [1] : [])
    .map((target_level) => ({ target_level, status: "approved" })),
  listCertificates: async () => [],
};
const db = { getStore: () => store };
const catalog = load("../lib/public/catalog.ts", {
  "@/lib/db": db,
  "@/lib/media/readiness": readiness,
  "@/lib/verification-status": verification,
  "@/lib/public/product-selection": selection,
  "@/lib/public/display-name": displayName,
});
const productCatalog = load("../lib/public/product-catalog.ts", {
  "@/lib/db": db,
  "@/lib/product-attributes": attributes,
  "@/lib/media/readiness": readiness,
  "@/lib/public/catalog": catalog,
  "@/lib/public/supplier-seo": supplierSeo,
  "@/lib/public/product-selection": selection,
  "@/lib/public/grade-resolution": grade,
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
  "@/lib/public/product-catalog": searchCatalog,
  "@/lib/public/product-comparison": comparison,
  "@/lib/public/product-selection": selection,
  "@/lib/public/supplier-product-order": productOrder,
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
assert.equal(counts.products, 2, "One read for supplier projection and one shared product snapshot, not one per category");
assert.ok(!JSON.stringify(cardProps).includes("private-review-marker"));
assert.ok(!JSON.stringify(cardProps).includes("private-spec-marker"));
assert.ok(!html.includes("private/evidence.jpg"));
assert.ok(!html.includes("98765"));

html = await render({ q: "hat dieu w320", cat: "nuts", lang: "vi" });
assert.equal(ids(html).length, 4, "Vietnamese search ignores accents and combines category names with a public grade");
html = await render({ q: "van phuoc", lang: "vi" });
assert.ok(supplierHrefs(html).includes("van-phuoc"), "Vietnamese names can be found without diacritics, including đ");
assert.ok(ids(html).includes("root-item"), "Searching a supplier also finds its public products");

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
failure = "";

// A larger set exercises both independent pagers and verifies that every card
// remains reachable exactly once, in the same interleaved ranked order.
for (let i = 1; i <= 17; i++) suppliers.push(supplier(`bulk-supplier-${i}`, `Bulkneedle supplier ${i}`));
const bulk = Array.from({ length: 53 }, (_, i) => product(`bulk-${i + 1}`, `bulk-supplier-${(i % 17) + 1}`, "cashew", `Bulkneedle lot ${String(i + 1).padStart(2, "0")}`));
rows = [...baseProducts, ...bulk];
media = [...media, ...bulk.map((p) => mediaFor(p))];
const expected = productOrder.arrangeSupplierProducts((await productCatalog.listPublicCategoryProducts(cashew))
  .filter((p) => p.name.toLowerCase().includes("bulkneedle")), null).shown.map((p) => p.id);
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
assert.deepEqual([...ids(firstPage), ...ids(secondPage), ...ids(thirdPage)], expected, "Paging retains the established category ranking and supplier interleaving");
assert.equal(new Set([...ids(firstPage), ...ids(secondPage), ...ids(thirdPage)]).size, 53);
const beyond = await render({ q: "Bulkneedle", cat: "cashew", p: "999999", s: "999999" });
assert.equal(ids(beyond).length, 5, "Out-of-range pages clamp to the last page");
assert.match(beyond, /Page 3 of 3/);

console.log("✅ Marketplace search: home-compatible q/cat/lang, public gates and private data, EN/VI accents, parent/child scope, errors, unchanged ranking and complete pagination.");
