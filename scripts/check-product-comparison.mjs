// node --experimental-strip-types --no-warnings scripts/check-product-comparison.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MAX_PRODUCT_COMPARISONS,
  normalizeProductComparisonSelection,
  parseComparisonIds,
  productComparisonHref,
  productComparisonWarnings,
  productDetailHref,
  toggleProductComparisonSelection,
} from "../lib/public/product-comparison.ts";
import { VERIFICATION_LABELS } from "../lib/verification-status.ts";

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
    moq: "1 MT", price: null, pricePoint: null, cardImagePath: "products/a/cover.webp", imagePaths: ["products/a/full.jpg"],
    supplierName: "Company A", supplierId: "A", supplierSlug: "company-a", province: "Hanoi", verificationSteps: [1, 3], leadTimeDays: 14,
  },
  product: {
    id: "a", supplier_id: "A", packaging: "25 kg bags", packaging_i18n: { en: "25 kg bags" }, ref_price: 999,
    price_valid_until: "2099-01-01", incoterm: "FOB", incoterm_place: "Cat Lai", export_port: "Cat Lai",
    monthly_capacity: "100 MT", payment_terms: "T/T", oem: true, odm: false, samples: true,
  },
  supplier: { id: "A", email: "private@example.com" },
  category: { slug: "cashew", name_i18n: { en: "Cashew kernels" } },
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
  "@/lib/public/product-catalog": { getPublicProductRecordsByIds: async (ids) => ids.map((id) => id === "a" ? record : null).filter(Boolean) },
  "@/lib/public/product-comparison": { productDetailHref },
  "@/lib/public/product-detail-display": { publicExportPortDisplay: (value) => value || "" },
  "@/lib/public/product-selection": { withoutDirectContacts },
});
const projected = await comparisonData.getPublicProductsForComparison(["a"]);
assert.equal(projected.length, 1);
assert.equal(projected[0].price, null);
assert.equal(projected[0].priceCurrency, null);
assert.equal(projected[0].priceUnit, null);
assert.equal(projected[0].priceValidUntil, null, "Private price metadata is hidden with the price");
assert.equal(projected[0].certificates.length, 1);
assert.equal(projected[0].certificates[0].id, "public-cert");
assert.deepEqual([...projected[0].specifications.map((specification) => specification.key)], ["moisture"], "Only approved category attributes are compared");
const projectedJson = JSON.stringify(projected[0]);
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
  "@/lib/verification-status": { VERIFICATION_LABELS },
});
const tableHtml = renderToStaticMarkup(React.createElement(tableModule.ProductComparisonTable, {
  products: [compared("a"), compared("b", { price: null, priceCurrency: null, priceUnit: null, priceValidUntil: null, certificates: [] })],
}));
for (const text of ["Reference price", "USD 7/kg", "On request", "Price valid until", "MOQ", "Packaging", "Named place",
  "Independent verification", "Documents checked: Approved", "Factory visited: Not approved", "Delivery history reviewed: Approved",
  "HACCP", "No public certificates", "Copy comparison link", "Request a quote", "do not certify these products or a specific lot"]) {
  assert.ok(tableHtml.includes(text), `Comparison table includes ${text}`);
}
assert.match(tableHtml, /overflow-x-auto/);
assert.match(tableHtml, /sticky left-0/);
assert.equal((tableHtml.match(/aria-label="Remove Cashew [ab] from comparison"/g) ?? []).length, 2);
assert.ok(tableHtml.includes("Some products do not have a public reference price"));
const crossCategoryHtml = renderToStaticMarkup(React.createElement(tableModule.ProductComparisonTable, {
  products: [compared("a"), compared("b", { categorySlug: "rice", categoryName: "Rice" })],
}));
assert.ok(crossCategoryHtml.includes("different categories"));
assert.doesNotMatch(crossCategoryHtml, />Grade</, "Cross-category comparisons do not align unlike grade schemas");

/* ---------- Route and public-surface wiring ---------- */

const page = readFileSync(new URL("../app/(public)/compare/page.tsx", import.meta.url), "utf8");
assert.match(page, /searchParams\?\.products === undefined && searchParams\?\.ids !== undefined/, "Legacy supplier IDs keep their existing mode");
assert.match(page, /parseComparisonIds\(sp\?\.products, 3\)/);
assert.match(page, /ProductComparisonSync/);
const layout = readFileSync(new URL("../app/(public)/layout.tsx", import.meta.url), "utf8");
assert.match(layout, /ProductComparisonProvider/);
assert.match(layout, /ProductComparisonTray/);
const actions = readFileSync(new URL("../components/product-comparison-actions.tsx", import.meta.url), "utf8");
const urlToSelectionEffect = actions.slice(actions.indexOf("useEffect(() => {", actions.indexOf("// URL -> selection")), actions.indexOf("// On an empty compare URL"));
assert.doesNotMatch(urlToSelectionEffect, /localSignature/, "A pending removal cannot reapply old URL props");
const portalPreview = readFileSync(new URL("../app/supplier/portal/storefront/page.tsx", import.meta.url), "utf8");
assert.match(portalPreview, /comparisonEnabled={false}/, "Supplier-portal previews never expose buyer selection");
for (const file of [
  "../components/category-product-grid.tsx",
  "../components/home-product-feed.tsx",
  "../components/public/supplier-storefront.tsx",
  "../components/sponsored-product-band.tsx",
  "../app/(public)/products/[slug]/[productId]/page.tsx",
]) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.match(source, /comparison=/, `${file} exposes the comparison control on public offers`);
}

console.log("✅ Product comparison: max 3, dedupe, image checkbox, safe public data, warnings, share links and independent supplier checks.");
