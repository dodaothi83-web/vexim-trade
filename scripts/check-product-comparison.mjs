// node --experimental-strip-types --no-warnings scripts/check-product-comparison.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { loadProductDescription } from "./product-description-test-utils.mjs";

import {
  MAX_PRODUCT_COMPARISONS,
  hasProductComparisonPeer,
  normalizeProductComparisonSelection,
  parseComparisonIds,
  productComparisonHref,
  productComparisonWarnings,
  productDetailHref,
  toggleProductComparisonSelection,
} from "../lib/public/product-comparison.ts";
import { VERIFICATION_LABELS, verificationLabel } from "../lib/verification-status.ts";
import {
  publicExportPortDisplay,
  publicProductCapacityDisplay,
  publicProductMoqDisplay,
  publicProductPaymentTermsDisplay,
  publicProductPackagingDisplay,
  publicProductPlaceDisplay,
  publicProductPriceDisplay,
  publicProductUnitDisplay,
} from "../lib/public/product-detail-display.ts";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");

function compile(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (key) => {
      if (!(key in mocks)) throw new Error(`Unexpected import: ${key}`);
      return mocks[key];
    },
    process, console, Date, React, Intl, URL, Set, Map,
  });
  return exports;
}

const selectionModule = compile("../lib/public/product-selection.ts", {
  "@/lib/public/category-assignment": { assignProductCategory: () => null },
});
const { withoutDirectContacts } = selectionModule;
const { description, format } = loadProductDescription();
const translationModule = compile("../lib/ai/translate-content.ts", {
  "server-only": {},
  "node:crypto": require("node:crypto"),
  "@/lib/ai/company-introduction": { readOutputText: () => "" },
  "@/lib/products/product-description": description,
  "@/lib/products/product-description-format": format,
});
const productPortModule = compile("../lib/public/product-export-port.ts", {
  "server-only": {},
  "@/lib/ai/translate-content": translationModule,
  "@/lib/public/product-detail-display": { publicExportPortDisplay },
});

/* ---------- Selection rules ---------- */

const item = (id, extra = {}) => ({
  id,
  name: `Product ${id}`,
  categorySlug: "cashew",
  href: `/products/cashew/${id}`,
  imagePath: `products/${id}/cover.webp`,
  ...extra,
});

assert.equal(MAX_PRODUCT_COMPARISONS, 3);
assert.deepEqual(parseComparisonIds("a,b,a,c,d", 3), ["a", "b", "c"]);
assert.deepEqual(parseComparisonIds("a,bad id,c", 3), ["a", "c"]);
assert.deepEqual(parseComparisonIds("a", 0), []);
assert.equal(productComparisonHref(["a", "b", "a", "c", "d"]), "/compare?products=a,b,c");
assert.equal(productComparisonHref([]), "/compare");
assert.equal(productDetailHref("cashew-kernels", "a b"), "/products/cashew-kernels/a%20b");

let current = [];
for (const id of ["a", "b", "c"]) {
  const next = toggleProductComparisonSelection(current, item(id));
  assert.equal(next.result, "added");
  current = [...next.items];
}
const fourth = toggleProductComparisonSelection(current, item("d"));
assert.equal(fourth.result, "limit");
assert.deepEqual([...fourth.items.map((product) => product.id)], ["a", "b", "c"], "A fourth product never replaces an existing selection");
const removed = toggleProductComparisonSelection(current, item("b"));
assert.equal(removed.result, "removed");
assert.deepEqual([...removed.items.map((product) => product.id)], ["a", "c"], "Ticking a selected product removes it");
const normalized = normalizeProductComparisonSelection([
  item("a", { href: "javascript:alert(1)" }),
  item("a"),
  item("bad id"),
  null,
]);
assert.equal(normalized.length, 1);
assert.equal(normalized[0].href, "/products/cashew/a", "Persisted URLs are rebuilt, never trusted");
assert.deepEqual(normalizeProductComparisonSelection("not an array"), []);

/* ---------- Contextual checkbox visibility ---------- */

const peer = (id, supplierId, categorySlug = "cashew", extra = {}) => ({ id, supplierId, categorySlug, ...extra });
const singleOffer = [peer("a", "A")];
assert.equal(hasProductComparisonPeer(singleOffer, singleOffer[0]), false, "A standalone product has nothing to compare");
const sameSupplierOffers = [peer("a", "A"), peer("b", "A")];
assert.equal(hasProductComparisonPeer(sameSupplierOffers, sameSupplierOffers[0]), false,
  "A supplier-only catalogue does not offer cross-supplier comparison");
const mixedSupplierOffers = [peer("a", "A"), peer("b", "B")];
assert.equal(hasProductComparisonPeer(mixedSupplierOffers, mixedSupplierOffers[0]), true);
assert.equal(hasProductComparisonPeer(mixedSupplierOffers, mixedSupplierOffers[1]), true);
const crossCategoryOffers = [peer("a", "A"), peer("b", "B", "rice")];
assert.equal(hasProductComparisonPeer(crossCategoryOffers, crossCategoryOffers[0]), false,
  "A different category is not a meaningful alternative");
const demoPeerOffers = [peer("a", "A"), peer("b", "B", "cashew", { isDemo: true })];
assert.equal(hasProductComparisonPeer(demoPeerOffers, demoPeerOffers[0]), false, "Demo products cannot create a comparison peer");
assert.equal(hasProductComparisonPeer(mixedSupplierOffers, { ...mixedSupplierOffers[0], isDemo: true }), false);

/* ---------- Truthful comparison warnings ---------- */

const warningBase = {
  categorySlug: "cashew",
  price: "USD 7/kg",
  priceCurrency: "USD",
  priceUnit: "kg",
  priceValidUntil: "2099-01-01",
  moq: "1 MT",
  incoterm: "FOB",
  incotermPlace: "Cat Lai",
};
assert.deepEqual(productComparisonWarnings([warningBase, warningBase]), []);
assert.ok(productComparisonWarnings([warningBase, { ...warningBase, price: null }]).some((text) => text.includes("do not have a public reference price")));
assert.ok(productComparisonWarnings([warningBase, { ...warningBase, categorySlug: "rice" }]).some((text) => text.includes("different categories")));
assert.ok(productComparisonWarnings([warningBase, { ...warningBase, priceCurrency: "EUR" }]).some((text) => text.includes("currencies")));
assert.ok(productComparisonWarnings([warningBase, { ...warningBase, priceUnit: "MT" }]).some((text) => text.includes("units")));
assert.ok(productComparisonWarnings([warningBase, { ...warningBase, incoterm: "CIF" }]).some((text) => text.includes("delivery scope")));
assert.ok(productComparisonWarnings([warningBase, { ...warningBase, incotermPlace: null }]).some((text) => text.includes("delivery scope")));
assert.ok(productComparisonWarnings([warningBase, { ...warningBase, moq: "2 MT" }]).some((text) => text.includes("minimum quantities")));
assert.ok(productComparisonWarnings([warningBase, { ...warningBase, priceValidUntil: null }]).some((text) => text.includes("validity dates")));
assert.equal(productComparisonWarnings([warningBase, { ...warningBase, priceCurrency: "USD/kg", priceUnit: null }]).length, 0,
  "A currency string can carry the same unit without creating a false mismatch");

/* ---------- Real checkbox markup ---------- */

const providerMock = {
  useProductComparison: () => ({ items: [item("a")], ready: true, toggleProduct: () => "added" }),
};
const { ProductCompareCheckbox } = compile("../components/product-compare-checkbox.tsx", {
  react: require("react"),
  "react/jsx-runtime": jsx,
  "@/components/product-comparison-provider": providerMock,
});
const checkboxHtml = renderToStaticMarkup(React.createElement(ProductCompareCheckbox, { product: item("b") }));
assert.match(checkboxHtml, /type="checkbox"/);
assert.match(checkboxHtml, /aria-label="Add Product b to comparison"/);
assert.match(checkboxHtml, /absolute right-2 top-2/);
const selectedCheckboxHtml = renderToStaticMarkup(React.createElement(ProductCompareCheckbox, { product: item("a") }));
assert.match(selectedCheckboxHtml, /checked=""/);
assert.match(selectedCheckboxHtml, /aria-label="Remove Product a from comparison"/);

/* ---------- Vietnamese source fallback display ---------- */

assert.equal(publicProductMoqDisplay("1 tấn"), "1 metric ton");
assert.equal(publicProductMoqDisplay("300 bộ"), "300 sets");
assert.equal(publicProductCapacityDisplay("100 tấn"), "100 metric tons");
assert.equal(publicProductCapacityDisplay("200 tấn"), "200 metric tons");
assert.equal(publicProductCapacityDisplay("2.000 MT / tháng"), "2.000 MT per month");
assert.equal(publicProductPaymentTermsDisplay("T/T 30% cọc"), "T/T 30% deposit");
assert.equal(publicProductPaymentTermsDisplay("30% cọc, 70% khi có B/L"), "30% deposit, 70% when B/L is available");
assert.equal(publicProductPlaceDisplay("Hồ Chí Minh"), "Ho Chi Minh City");
assert.equal(publicExportPortDisplay("Cát Lái"), "Cat Lai");
assert.equal(publicProductUnitDisplay("thùng"), "carton");
assert.equal(publicProductUnitDisplay("bộ"), "set");
assert.equal(publicProductPriceDisplay("USD 7/thùng"), "USD 7/carton");
assert.equal(publicProductPackagingDisplay("Bao PP 25kg hoặc 50kg, may kín"), "25kg or 50kg PP bags, sewn closed");
assert.equal(publicProductPackagingDisplay("Túi 5kg hút chân không, thùng carton"), "5kg vacuum bags, carton box");
assert.equal(publicProductPackagingDisplay("Túi 250g, thùng 40 túi"), "250g bags, 40 bags per carton");
assert.equal(publicProductPackagingDisplay("Hút chân không 22,68kg / thùng"), "vacuum packed 22.68kg / carton");
assert.equal(publicProductPackagingDisplay("Carton 5 lớp + góc bảo vệ"), "5-layer carton + corner protectors");

/* ---------- Buyer-safe server projection ---------- */

const rawCertificates = [
  { id: "public-cert", supplier_id: "A", name: "HACCP", review_status: "approved", publicly_visible: true,
    staff_hidden: false, file_media_id: "evidence", valid_until: "2099-01-01", holder_match: "owner", holder_name: "Company A" },
  { id: "draft-cert", supplier_id: "A", name: "Draft", review_status: "draft", publicly_visible: true,
    staff_hidden: false, file_media_id: "evidence", valid_until: "2099-01-01", holder_match: "owner", holder_name: "Company A" },
];
const internalMedia = [{ id: "evidence", supplier_id: "A", audience: "internal", storage_path: "internal/evidence.pdf", status: "checked", expires_on: null }];
const certificateModule = compile("../lib/public/certificates.ts", {
  "@/lib/media/readiness": { isExpired: () => false },
  "@/lib/public/product-selection": { withoutDirectContacts },
});
const record = {
  card: {
    id: "a", name: "Cashew W320", grade: "W320", attributes: { grade: "W320", moisture: "5% max", unapproved: "hidden" },
    moq: "1 tấn", price: null, pricePoint: null, cardImagePath: "products/a/cover.webp", imagePaths: ["products/a/full.jpg"],
    supplierName: "Company A", supplierId: "A", supplierSlug: "company-a", province: "Hanoi", verificationSteps: [1, 3], leadTimeDays: 14,
    rawMaterialRegion: "Binh Phuoc and Dak Lak", inputMaterialOrigin: "Vietnam and Cambodia",
  },
  product: {
    id: "a", supplier_id: "A", packaging: "Bao PP 25kg hoặc 50kg, may kín", packaging_i18n: null, ref_price: 999,
    price_valid_until: "2099-01-01", incoterm: "FOB", incoterm_place: "Hồ Chí Minh", export_port: "Cát Lái",
    monthly_capacity: "100 tấn", payment_terms: "T/T 30% cọc", oem: true, odm: false, samples: true,
  },
  supplier: { id: "A", email: "private@example.com" },
  category: { slug: "cashew", name_i18n: { en: "Cashew kernels" } },
};
const untranslatedRecord = {
  ...record,
  card: { ...record.card, id: "untranslated", rawMaterialRegion: "", inputMaterialOrigin: "" },
  product: { ...record.product, id: "untranslated" },
};
const store = {
  listCertificates: async () => rawCertificates,
  listMedia: async () => internalMedia,
};
const comparisonData = compile("../lib/public/product-comparison-data.ts", {
  "server-only": {},
  "@/lib/db": { getStore: () => store },
  "@/lib/product-attributes": { fieldsFor: () => [{ key: "grade", label: "Grade" }, { key: "moisture", label: "Moisture" }] },
  "@/lib/public/certificates": certificateModule,
  "@/lib/public/product-catalog": { getPublicProductRecordsByIds: async (ids) => ids.map((id) => id === "a" ? record : id === "untranslated" ? untranslatedRecord : null).filter(Boolean) },
  "@/lib/public/product-comparison": { productDetailHref },
  "@/lib/public/product-detail-display": {
    publicExportPortDisplay,
    publicProductCapacityDisplay,
    publicProductMoqDisplay,
    publicProductPaymentTermsDisplay,
    publicProductPackagingDisplay,
    publicProductPlaceDisplay,
    publicProductPriceDisplay,
    publicProductUnitDisplay,
  },
  "@/lib/public/product-export-port": productPortModule,
  "@/lib/public/product-selection": { withoutDirectContacts },
});
const projected = await comparisonData.getPublicProductsForComparison(["a"]);
assert.equal(projected.length, 1);
assert.equal(projected[0].price, null);
assert.equal(projected[0].priceCurrency, null);
assert.equal(projected[0].priceUnit, null);
assert.equal(projected[0].priceValidUntil, null, "Private price metadata is hidden with the price");
assert.equal(projected[0].moq, "1 metric ton");
assert.equal(projected[0].incotermPlace, "Ho Chi Minh City");
assert.equal(projected[0].exportPort, "Cat Lai");
assert.equal(projected[0].monthlyCapacity, "100 metric tons");
assert.equal(projected[0].paymentTerms, "T/T 30% deposit");
assert.equal(projected[0].rawMaterialRegion, "Binh Phuoc and Dak Lak");
assert.equal(projected[0].inputMaterialOrigin, "Vietnam and Cambodia");
const untranslated = await comparisonData.getPublicProductsForComparison(["untranslated"]);
assert.equal(untranslated[0].rawMaterialRegion, null, "Missing English sourcing data stays empty in comparison");
assert.equal(untranslated[0].inputMaterialOrigin, null);
assert.equal(projected[0].packaging, "25kg or 50kg PP bags, sewn closed");
assert.equal(projected[0].certificates.length, 1);
assert.equal(projected[0].certificates[0].id, "public-cert");
assert.deepEqual([...projected[0].specifications.map((specification) => specification.key)], ["moisture"], "Only approved category attributes are compared");
const projectedJson = JSON.stringify(projected[0]);
assert.doesNotMatch(projectedJson, /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i,
  "Vietnamese source values do not leak into the audited comparison projection");
assert.ok(!projectedJson.includes("999") && !projectedJson.includes("private@example.com") && !projectedJson.includes("internal/evidence.pdf"),
  "Raw prices, supplier contacts and internal evidence never enter the public projection");

/* ---------- Comparison table content ---------- */

const compared = (id, extra = {}) => ({
  id,
  name: `Cashew ${id}`,
  href: `/products/cashew/${id}`,
  imagePath: `products/${id}/cover.webp`,
  categorySlug: "cashew",
  categoryName: "Cashew kernels",
  grade: "W320",
  specifications: [{ key: "moisture", label: "Moisture", value: "5% max" }],
  price: "USD 7/kg",
  priceCurrency: "USD",
  priceUnit: "kg",
  priceValidUntil: "2099-01-01",
  moq: "1 MT",
  packaging: "25 kg bags",
  leadTimeDays: 14,
  incoterm: "FOB",
  incotermPlace: "Cat Lai",
  exportPort: "Cat Lai",
  monthlyCapacity: "100 MT",
  paymentTerms: "T/T",
  rawMaterialRegion: "Binh Phuoc and Dak Lak",
  inputMaterialOrigin: "Vietnam and Cambodia",
  oem: true,
  odm: false,
  samples: true,
  supplierName: `Supplier ${id}`,
  supplierHref: `/suppliers/supplier-${id}`,
  province: "Hanoi",
  verificationSteps: [1, 3],
  certificates: [{ id: `cert-${id}`, name: "HACCP", issuer: null, number: null, holderMatch: "owner", holderName: `Supplier ${id}`, validUntil: "2099-01-01" }],
  rfqHref: `/rfq?product_id=${id}`,
  ...extra,
});
const Link = ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children);
const tableModule = compile("../components/public/product-comparison-table.tsx", {
  "react/jsx-runtime": jsx,
  "next/link": { default: Link },
  "lucide-react": require("lucide-react"),
  "@/components/product-comparison-actions": {
    CopyComparisonLink: () => React.createElement("button", null, "Copy comparison link"),
    RemoveComparedProduct: ({ product }) => React.createElement("button", { "aria-label": `Remove ${product.name} from comparison` }),
  },
  "@/components/verification-tier": { VerificationTierBadge: () => React.createElement("span", null, "Level 2") },
  "@/lib/public/product-comparison": { productComparisonWarnings },
  "@/lib/verification-status": { VERIFICATION_LABELS, verificationLabel },
});
const tableHtml = renderToStaticMarkup(React.createElement(tableModule.ProductComparisonTable, {
  products: [compared("a"), compared("b", { price: null, priceCurrency: null, priceUnit: null, priceValidUntil: null, certificates: [], inputMaterialOrigin: null })],
}));
for (const text of ["Reference price", "USD 7/kg", "On request", "Price valid until", "MOQ", "Packaging", "Named place",
  "Independent verification", "Documents checked: Approved", "L2 review: Not approved", "Delivery history reviewed: Approved",
  "HACCP", "No public certificates", "Raw material region", "Binh Phuoc and Dak Lak", "Input material origin", "Vietnam and Cambodia", "Not provided",
  "Copy comparison link", "Request a quote", "do not certify these products or a specific lot"]) {
  assert.ok(tableHtml.includes(text), `Comparison table includes ${text}`);
}
assert.match(tableHtml, /overflow-x-auto/);
assert.match(tableHtml, /sticky left-0/);
assert.match(tableHtml, /min-w-48/);
assert.match(tableHtml, /Swipe horizontally to see each product/);
assert.equal((tableHtml.match(/aria-label="Remove Cashew [ab] from comparison"/g) ?? []).length, 2);
assert.ok(tableHtml.includes("Some products do not have a public reference price"));
const crossCategoryHtml = renderToStaticMarkup(React.createElement(tableModule.ProductComparisonTable, {
  products: [compared("a"), compared("b", { categorySlug: "rice", categoryName: "Rice" })],
}));
assert.ok(crossCategoryHtml.includes("different categories"));
assert.doesNotMatch(crossCategoryHtml, />Grade</, "Cross-category comparisons do not align unlike grade schemas");
const partnerCompareHtml = renderToStaticMarkup(React.createElement(tableModule.ProductComparisonTable, {
  products: [compared("p", { verificationSteps: [2], l2Scope: "partner_contract" })],
}));
assert.match(partnerCompareHtml, /Partner factory contract reviewed: Approved/);
assert.doesNotMatch(partnerCompareHtml, /Factory verification: Approved/);


/* ---------- Route and public-surface wiring ---------- */

const page = readFileSync(new URL("../app/(public)/compare/page.tsx", import.meta.url), "utf8");
assert.match(page, /searchParams\?\.products === undefined && searchParams\?\.ids !== undefined/, "Legacy supplier IDs keep their existing mode");
assert.match(page, /parseComparisonIds\(sp\?\.products, 3\)/);
assert.match(page, /ProductComparisonSync/);
assert.match(page, /supplier-comparison-scroll-hint/);
const catalog = readFileSync(new URL("../lib/public/catalog.ts", import.meta.url), "utf8");
assert.match(catalog, /\.map\(\(p\) => publicProductTitle\(p\)\)/, "Supplier comparison uses English public product names");
const tray = readFileSync(new URL("../components/product-comparison-tray.tsx", import.meta.url), "utf8");
assert.match(tray, /snap-x/);
assert.match(tray, /max-w-\[calc\(100vw-4rem\)\]/);
const layout = readFileSync(new URL("../app/(public)/layout.tsx", import.meta.url), "utf8");
assert.match(layout, /ProductComparisonProvider/);
assert.match(layout, /ProductComparisonTray/);
const actions = readFileSync(new URL("../components/product-comparison-actions.tsx", import.meta.url), "utf8");
const urlToSelectionEffect = actions.slice(actions.indexOf("useEffect(() => {", actions.indexOf("// URL -> selection")), actions.indexOf("// On an empty compare URL"));
assert.doesNotMatch(urlToSelectionEffect, /localSignature/, "A pending removal cannot reapply old URL props");
const portalPreview = readFileSync(new URL("../app/supplier/portal/storefront/page.tsx", import.meta.url), "utf8");
assert.doesNotMatch(portalPreview, /comparisonEnabled|comparison=/, "Supplier-portal previews never expose buyer selection");
for (const file of [
  "../components/category-product-grid.tsx",
  "../components/home-product-feed.tsx",
  "../components/sponsored-product-band.tsx",
  "../app/(public)/products/[slug]/[productId]/page.tsx",
]) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.match(source, /hasProductComparisonPeer/, `${file} checks for a real alternative before showing comparison`);
}
const supplierStorefront = readFileSync(new URL("../components/public/supplier-storefront.tsx", import.meta.url), "utf8");
assert.doesNotMatch(supplierStorefront, /comparisonEnabled|comparison=/, "A single-supplier catalogue has no comparison checkboxes");
const productDetailPage = readFileSync(new URL("../app/(public)/products/[slug]/[productId]/page.tsx", import.meta.url), "utf8");
assert.doesNotMatch(productDetailPage, /ProductMediaGallery[^>]*comparison=/, "A standalone product gallery has no comparison checkbox");
const gallery = readFileSync(new URL("../components/product-media-gallery.tsx", import.meta.url), "utf8");
assert.doesNotMatch(gallery, /ProductCompareCheckbox|comparison/, "The shared gallery no longer owns comparison selection");

console.log("✅ Product comparison: contextual checkbox, max 3, dedupe, safe public data, warnings, share links and independent supplier checks.");
