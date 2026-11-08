#!/usr/bin/env node
// node --experimental-strip-types --no-warnings scripts/check-price-range.mjs
//
// Kiểm đơn vị giá và khoảng giá tham khảo. Trọng tâm là những chỗ sai một lần
// là sai gấp 1000 lần: quy đổi tấn/kg/pound, gộp đơn vị khác nhau, và công bố
// khoảng giá khi chưa đủ mẫu.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";

import * as units from "../lib/public/price-units.ts";

const compile = (path, mocks) => {
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
    process, console, Date, React,
  });
  return exports;
};

// price-range.ts dùng alias "@/lib/..." nên phải biên dịch rồi nối mô-đun đơn vị vào.
const priceRange = compile("../lib/public/price-range.ts", {
  "@/lib/public/price-units": units,
});

const Link = ({ href, children, ...rest }) => React.createElement("a", { href, ...rest }, children);
const ArrowRight = () => React.createElement("span", null);
const Info = () => React.createElement("span", null);
const strip = compile("../components/price-range.tsx", {
  "react/jsx-runtime": createRequire(import.meta.url)("react/jsx-runtime"),
  "next/link": { default: Link },
  "lucide-react": { ArrowRight, Info },
  "@/lib/public/price-range": priceRange,
  "@/lib/public/price-units": units,
});

const NOW = new Date("2026-10-24T00:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400_000).toISOString();

/* ---------------- Đơn vị: đọc từ chữ tự do ---------------- */

assert.equal(units.parsePriceUnit("MT"), "mt");
assert.equal(units.parsePriceUnit("kg"), "kg");
assert.equal(units.parsePriceUnit("USD/kg"), "kg", "A currency string can carry the unit");
assert.equal(units.parsePriceUnit(null, "USD/MT"), "mt");
assert.equal(units.parsePriceUnit("lbs"), "lb");
assert.equal(units.parsePriceUnit("US cents/lb"), "lb", "Pound is read before the 't' inside 'cents'");
assert.equal(units.parsePriceUnit("tonne"), "mt");
assert.equal(units.parsePriceUnit("thùng"), null, "A packing unit is not a weight unit and must not be guessed");
for (const unit of ["carton", "sack", "bag", "box", "bottle", "piece", "set"])
  assert.equal(units.parsePriceUnit(unit), null, `Never guess the weight of ${unit}`);
assert.equal(units.parsePriceUnit(""), null);
assert.equal(units.parsePriceUnit(undefined, null), null);

/* ---------------- Quy đổi ---------------- */

assert.equal(units.toPricePerKg(1000, "mt"), 1, "USD 1,000 a tonne is USD 1.00 a kilogram");
assert.equal(units.toPricePerKg(1, "kg"), 1);
assert.ok(Math.abs(units.toPricePerKg(1, "lb") - 2.2046226218) < 1e-9, "A price per pound converts to the equivalent per kilogram");
assert.equal(units.toPricePerKg(0, "kg"), null, "Zero is not a price");
assert.equal(units.toPricePerKg(5, null), null, "An unknown unit never becomes kg by default");
assert.ok(Math.abs(units.fromPricePerKg(7.9, "mt") - 7900) < 1e-6, "A price per kilogram converts back to the tonne quote");
assert.equal(units.formatUnitPrice(7.9, "kg"), "$7.9/kg");
assert.equal(units.formatUnitPrice(4500, "mt"), "$4,500/MT");
assert.equal(units.formatUnitRange(7.6, 8.4, "kg"), "$7.6–8.4/kg");
assert.equal(units.formatUnitRange(420, 420, "mt"), "$420/MT", "A single level is not shown as a range");

/* ---------------- Quy ước hiển thị theo ngành ---------------- */

const cashewUnits = units.displayUnitsForCategory("cashew", null);
assert.equal(cashewUnits.primary, "kg", "Cashew follows the Vietnamese FOB convention");
assert.equal(cashewUnits.secondary, undefined, "Each category uses one unified unit without secondary unit clutter");

const riceUnits = units.displayUnitsForCategory("rice", null);
assert.equal(riceUnits.primary, "mt", "Rice follows the MT convention");
assert.equal(riceUnits.secondary, undefined);

assert.equal(units.displayUnitsForCategory("spices", null).primary, "mt", "The live slug 'spices' resolves to tonnes, not to the guessed 'dried-spices'");
assert.equal(units.displayUnitsForCategory("dried-spices", null).primary, "mt");
assert.equal(units.displayUnitsForCategory("some-rice-variety", null).primary, "mt", "An unlisted slug is inferred from its industry keyword");
assert.equal(units.displayUnitsForCategory("frozen-shrimp", null).primary, "kg");
assert.equal(units.displayUnitsForCategory("unknown-category", null).primary, "kg", "Unknown categories fall back to kg, never to tonnes");
const cashewKernelUnits = units.displayUnitsForCategory("cashew-kernels", null);
assert.equal(cashewKernelUnits.primary, "kg", "The launch slug for cashew kernels reads in kilograms");
assert.equal(cashewKernelUnits.secondary, undefined, "Cashew kernels uses one unified unit (/kg)");
assert.equal(units.displayUnitsForCategory("cashew-raw-nuts", null).secondary, undefined, "An inferred cashew slug does not get the pound equivalent unless listed");
assert.equal(units.displayUnitsForCategory("cinnamon-star-anise", null).primary, "mt", "The launch slug for cinnamon and star anise reads in tonnes");
assert.equal(units.displayUnitsForCategory("pepper", null).primary, "mt", "Pepper reads in tonnes");
assert.equal(units.displayUnitsForCategory("rice", "kg").primary, "kg", "A configured unit wins over the market default");

/* ---------------- Khoảng giá ---------------- */

const ok = priceRange.buildPriceRange(
  [
    { value: 7.6, unit: "kg", updatedAt: daysAgo(3) },
    { value: 8.4, unit: "kg", updatedAt: daysAgo(10) },
    { value: 8.0, unit: "kg", updatedAt: daysAgo(20) },
  ],
  { now: NOW },
);
assert.equal(ok.status, "ok");
assert.equal(ok.range.low, 7.6);
assert.equal(ok.range.high, 8.4);
assert.equal(ok.range.median, 8);
assert.equal(ok.range.sampleSize, 3);
assert.equal(ok.range.lastUpdated, daysAgo(3).slice(0, 10));
assert.equal(ok.range.stale, false);
assert.equal(ok.range.rangeText, "$7.6–8.4/kg");

const tooFew = priceRange.buildPriceRange(
  [{ value: 7.6, unit: "kg", updatedAt: daysAgo(1) }, { value: 8.4, unit: "kg", updatedAt: daysAgo(2) }],
  { now: NOW },
);
assert.equal(tooFew.status, "too_few", "Two prices are not a market range");
assert.equal(tooFew.usable, 2);
assert.equal(tooFew.needed, 3);

assert.equal(priceRange.buildPriceRange([], { now: NOW }).status, "none");
assert.equal(priceRange.buildPriceRange(null, { now: NOW }).status, "none");

/* Cùng một mức giá nhập bằng hai đơn vị phải ra cùng một khoảng. */
const mixed = priceRange.buildPriceRange(
  [
    { value: 7.9, unit: "kg", updatedAt: daysAgo(2) },
    { value: 7900, unit: "MT", updatedAt: daysAgo(3) },
    { value: 3.58, unit: "lb", updatedAt: daysAgo(4) },
  ],
  { now: NOW, unit: "kg" },
);
assert.equal(mixed.status, "ok");
assert.equal(mixed.range.low, 7.89, "Pound prices convert into the same scale");
assert.equal(mixed.range.high, 7.9);
assert.equal(mixed.range.sampleSize, 3, "All three units count once converted");

/* Mẫu không dùng được bị loại, không bị đoán bừa. */
const filtered = priceRange.buildPriceRange(
  [
    { value: 7.9, unit: "kg", updatedAt: daysAgo(2) },
    { value: 8.1, unit: "kg", updatedAt: daysAgo(3) },
    { value: 8.2, unit: "kg", updatedAt: daysAgo(4) },
    { value: 5, unit: "thùng", updatedAt: daysAgo(1) },
    { value: 6, unit: "kg", updatedAt: null },
    { value: 9, unit: "kg", currency: "EUR", updatedAt: daysAgo(1) },
    { value: 200000, unit: "kg", currency: "VND", updatedAt: daysAgo(1) },
    { value: 99, unit: "kg", updatedAt: daysAgo(1), exclude: true },
    { value: 12, unit: "kg", updatedAt: daysAgo(120) },
  ],
  { now: NOW },
);
assert.equal(filtered.status, "ok");
assert.equal(filtered.range.sampleSize, 3, "Unknown units, missing dates, other currencies, demo rows and stale rows are all dropped");
assert.equal(filtered.range.high, 8.2);

/* Giá mồi (lệch quá xa trung vị) bị loại khỏi khoảng, không được một mình kéo lệch cả khoảng. */
const baitExcluded = priceRange.buildPriceRange(
  [
    { value: 6.2, unit: "kg", updatedAt: daysAgo(1) },
    { value: 6.6, unit: "kg", updatedAt: daysAgo(2) },
    { value: 7.2, unit: "kg", updatedAt: daysAgo(3) },
    { value: 7.2, unit: "kg", updatedAt: daysAgo(4) },
    { value: 1.55, unit: "kg", updatedAt: daysAgo(5) },
  ],
  { now: NOW },
);
assert.equal(baitExcluded.status, "ok");
assert.equal(baitExcluded.range.low, 6.2, "The USD 1.55 bait price is excluded, not used as the low bound");
assert.equal(baitExcluded.range.high, 7.2);
assert.equal(baitExcluded.range.excludedOutliers, 1, "One outlier is reported as excluded");
assert.equal(baitExcluded.range.sampleSize, 4, "The sample count reflects what was actually used for the range");

/* Một niêm yết cao bất thường (vd hàng đã chế biến + CIF) cũng bị loại nếu lệch quá xa trung vị. */
const highOutlierExcluded = priceRange.buildPriceRange(
  [
    { value: 6.2, unit: "kg", updatedAt: daysAgo(1) },
    { value: 6.6, unit: "kg", updatedAt: daysAgo(2) },
    { value: 7.0, unit: "kg", updatedAt: daysAgo(3) },
    { value: 7.2, unit: "kg", updatedAt: daysAgo(4) },
    { value: 25, unit: "kg", updatedAt: daysAgo(5) },
  ],
  { now: NOW },
);
assert.equal(highOutlierExcluded.status, "ok");
assert.equal(highOutlierExcluded.range.high, 7.2, "A price far above the median is excluded from the high bound too");
assert.equal(highOutlierExcluded.range.excludedOutliers, 1);

/* Lọc không được làm tụt xuống dưới ngưỡng tối thiểu: thà hiện khoảng rộng còn hơn biến "too_few" oan. */
const outlierButThin = priceRange.buildPriceRange(
  [
    { value: 6.2, unit: "kg", updatedAt: daysAgo(1) },
    { value: 6.6, unit: "kg", updatedAt: daysAgo(2) },
    { value: 1.55, unit: "kg", updatedAt: daysAgo(3) },
  ],
  { now: NOW },
);
assert.equal(outlierButThin.status, "ok");
assert.equal(outlierButThin.range.excludedOutliers, 0, "Filtering down below minSamples is skipped; the full set is kept instead");
assert.equal(outlierButThin.range.low, 1.55);
assert.equal(outlierButThin.range.sampleSize, 3);

/* Đủ mẫu nhưng cùng một nhà cung cấp lặp giá ở nhiều niêm yết: không được tính là nhiều nguồn độc lập. */
const sameSupplierRepeat = priceRange.buildPriceRange(
  [
    { value: 2.5, unit: "kg", updatedAt: daysAgo(1), supplierId: "supplier-a" },
    { value: 5.5, unit: "kg", updatedAt: daysAgo(2), supplierId: "supplier-b" },
    { value: 6.0, unit: "kg", updatedAt: daysAgo(3), supplierId: "supplier-c" },
  ],
  { now: NOW, minDistinctSuppliers: 15 },
);
assert.equal(sameSupplierRepeat.status, "too_few_suppliers", "Three suppliers is still far short of the 15 required");
assert.equal(sameSupplierRepeat.usable, 3);
assert.equal(sameSupplierRepeat.distinctSuppliers, 3);
assert.equal(sameSupplierRepeat.neededSuppliers, 15);

/* Khi không đặt minDistinctSuppliers, hành vi cũ giữ nguyên dù mọi niêm yết cùng một NCC. */
const noSupplierThreshold = priceRange.buildPriceRange(
  [
    { value: 2.5, unit: "kg", updatedAt: daysAgo(1), supplierId: "supplier-a" },
    { value: 5.5, unit: "kg", updatedAt: daysAgo(2), supplierId: "supplier-a" },
    { value: 6.0, unit: "kg", updatedAt: daysAgo(3), supplierId: "supplier-a" },
  ],
  { now: NOW },
);
assert.equal(noSupplierThreshold.status, "ok", "Without an explicit threshold, supplier diversity is not required");

/* Đủ 15 nhà cung cấp khác nhau thì công bố bình thường. */
const enoughSuppliers = priceRange.buildPriceRange(
  Array.from({ length: 15 }, (_, i) => ({ value: 6 + i * 0.1, unit: "kg", updatedAt: daysAgo(1), supplierId: `supplier-${i}` })),
  { now: NOW, minDistinctSuppliers: 15 },
);
assert.equal(enoughSuppliers.status, "ok", "Fifteen distinct suppliers clears the bar");
assert.equal(enoughSuppliers.range.sampleSize, 15);

/* Cũ quá ngưỡng cảnh báo thì vẫn hiện nhưng phải gắn nhãn. */
const stale = priceRange.buildPriceRange(
  [
    { value: 7.9, unit: "kg", updatedAt: daysAgo(60) },
    { value: 8.1, unit: "kg", updatedAt: daysAgo(61) },
    { value: 8.2, unit: "kg", updatedAt: daysAgo(62) },
  ],
  { now: NOW },
);
assert.equal(stale.status, "ok");
assert.equal(stale.range.stale, true, "Data older than 45 days is flagged");

const hidden = priceRange.buildPriceRange(
  [
    { value: 7.9, unit: "kg", updatedAt: daysAgo(95) },
    { value: 8.1, unit: "kg", updatedAt: daysAgo(96) },
    { value: 8.2, unit: "kg", updatedAt: daysAgo(97) },
  ],
  { now: NOW },
);
assert.equal(hidden.status, "none", "Data older than 90 days is hidden completely");

/* Đơn vị hiển thị theo danh mục, không theo dữ liệu vào. */
const riceRange = priceRange.priceRangeForCategory(
  "rice",
  null,
  [
    { value: 420, unit: "MT", updatedAt: daysAgo(1) },
    { value: 435, unit: "MT", updatedAt: daysAgo(2) },
    { value: 450, unit: "MT", updatedAt: daysAgo(3) },
  ],
  NOW,
);
assert.equal(riceRange.status, "ok");
assert.equal(riceRange.range.unit, "mt");
assert.equal(riceRange.range.rangeText, "$420–450/MT");

const cashewRange = priceRange.priceRangeForCategory(
  "cashew",
  null,
  [
    { value: 7.6, unit: "kg", updatedAt: daysAgo(1) },
    { value: 8.2, unit: "kg", updatedAt: daysAgo(2) },
    { value: 7.9, unit: "kg", updatedAt: daysAgo(3) },
  ],
  NOW,
);
assert.equal(cashewRange.status, "ok");
assert.equal(cashewRange.range.unit, "kg");
assert.equal(cashewRange.range.secondary, undefined, "Category range uses one unified unit");

/* ---------------- Tách theo quy cách ---------------- */

const byGrade = priceRange.buildPriceBlock(
  [
    { value: 9.4, unit: "kg", grade: "W180", updatedAt: daysAgo(2) },
    { value: 9.6, unit: "kg", grade: "W180", updatedAt: daysAgo(5) },
    { value: 9.5, unit: "kg", grade: "W180", updatedAt: daysAgo(8) },
    { value: 7.0, unit: "kg", grade: "W320", updatedAt: daysAgo(3) },
    { value: 7.2, unit: "kg", grade: "W320", updatedAt: daysAgo(6) },
    { value: 7.1, unit: "kg", grade: "W320", updatedAt: daysAgo(9) },
    { value: 8.0, unit: "kg", updatedAt: daysAgo(4) },
  ],
  { now: NOW },
);
assert.equal(byGrade.status, "ok");
assert.equal(byGrade.rows.length, 2, "Each grade gets its own row");
assert.equal(byGrade.rows[0].grade, "W180", "Rows are ordered by sample count, then premium grade first");
assert.equal(byGrade.rows[0].low, 9.4);
assert.equal(byGrade.rows[1].grade, "W320");
assert.equal(byGrade.rows[1].low, 7);
assert.equal(byGrade.rows[1].high, 7.2);
assert.equal(byGrade.unclassified, 1, "A listing without a grade is counted, not silently merged into a row");

const partialThin = priceRange.buildPriceBlock(
  [
    { value: 9.4, unit: "kg", grade: "W180", updatedAt: daysAgo(2) },
    { value: 9.6, unit: "kg", grade: "W180", updatedAt: daysAgo(5) },
    { value: 9.5, unit: "kg", grade: "W180", updatedAt: daysAgo(8) },
    { value: 6.6, unit: "kg", grade: "W450", updatedAt: daysAgo(3) },
  ],
  { now: NOW },
);
assert.equal(partialThin.status, "ok");
assert.equal(partialThin.thin.join(","), "W450", "A grade with too few prices is named, so the page does not look like it holds only one grade");

const spreadThin = priceRange.buildPriceBlock(
  [
    { value: 9.4, unit: "kg", grade: "W180", updatedAt: daysAgo(2) },
    { value: 7.0, unit: "kg", grade: "W320", updatedAt: daysAgo(3) },
    { value: 7.2, unit: "kg", grade: "W320", updatedAt: daysAgo(4) },
  ],
  { now: NOW, minSamples: 3 },
);
assert.equal(spreadThin.status, "too_few", "Splitting across grades must not publish a range built from too few prices");
assert.equal(spreadThin.needed, 3);

const noGrades = priceRange.buildPriceBlock(
  [
    { value: 4.2, unit: "MT", updatedAt: daysAgo(1) },
    { value: 4.4, unit: "MT", updatedAt: daysAgo(2) },
    { value: 4.3, unit: "MT", updatedAt: daysAgo(3) },
  ],
  { now: NOW, unit: "mt" },
);
assert.equal(noGrades.status, "ok");
assert.equal(noGrades.rows.length, 1, "A category without grades keeps one range");
assert.equal(noGrades.unclassified, 0);

/*
 * Mô phỏng đúng case thực tế: một NCC niêm yết cùng một giá ở hai quy cách khác
 * nhau (W240 và W320) trong khi mỗi quy cách còn có vài NCC khác. Với ngưỡng 15,
 * không quy cách nào đủ NCC khác nhau, nên cả hai bị giữ lại (pendingSuppliers),
 * không quy cách nào được công bố khoảng giá.
 */
const supplierDuplication = priceRange.buildPriceBlock(
  [
    { value: 2.5, unit: "kg", grade: "W240", updatedAt: daysAgo(1), supplierId: "chau-a-hung-manh" },
    { value: 6.0, unit: "kg", grade: "W240", updatedAt: daysAgo(2), supplierId: "phalco" },
    { value: 5.5, unit: "kg", grade: "W240", updatedAt: daysAgo(3), supplierId: "kim-long" },
    { value: 2.5, unit: "kg", grade: "W320", updatedAt: daysAgo(1), supplierId: "chau-a-hung-manh" },
    { value: 6.9, unit: "kg", grade: "W320", updatedAt: daysAgo(2), supplierId: "phalco" },
    { value: 7.2, unit: "kg", grade: "W320", updatedAt: daysAgo(3), supplierId: "polaris" },
  ],
  { now: NOW, minDistinctSuppliers: 15 },
);
assert.equal(supplierDuplication.status, "too_few_suppliers", "No grade clears 15 distinct suppliers yet, so no row is published");
assert.equal(supplierDuplication.distinctSuppliers, 3, "Each grade tops out at three distinct suppliers in this scenario");
assert.equal(supplierDuplication.neededSuppliers, 15);

/* Một quy cách đủ NCC, một quy cách chưa đủ: dòng đủ thì hiện, dòng kia liệt kê riêng trong pendingSuppliers. */
const partialSupplierCoverage = priceRange.buildPriceBlock(
  [
    ...Array.from({ length: 15 }, (_, i) => ({ value: 9 + i * 0.1, unit: "kg", grade: "W180", updatedAt: daysAgo(1), supplierId: `w180-supplier-${i}` })),
    { value: 2.5, unit: "kg", grade: "W450", updatedAt: daysAgo(1), supplierId: "chau-a-hung-manh" },
    { value: 6.0, unit: "kg", grade: "W450", updatedAt: daysAgo(2), supplierId: "phalco" },
    { value: 5.5, unit: "kg", grade: "W450", updatedAt: daysAgo(3), supplierId: "kim-long" },
  ],
  { now: NOW, minDistinctSuppliers: 15 },
);
assert.equal(partialSupplierCoverage.status, "ok");
assert.equal(partialSupplierCoverage.rows.length, 1, "Only the grade with 15 distinct suppliers gets a published row");
assert.equal(partialSupplierCoverage.rows[0].grade, "W180");
assert.equal(partialSupplierCoverage.pendingSuppliers.join(","), "W450", "The other grade is named as pending, not silently dropped");

/* ---------------- Render ---------------- */

const okBlock = priceRange.buildPriceBlock(
  [
    { value: 7.6, unit: "kg", updatedAt: daysAgo(3) },
    { value: 8.4, unit: "kg", updatedAt: daysAgo(10) },
    { value: 8.0, unit: "kg", updatedAt: daysAgo(20) },
  ],
  { now: NOW },
);

const okHtml = renderToStaticMarkup(
  React.createElement(strip.PriceRangeStrip, { outcome: okBlock, categoryName: "Cashew", rfqHref: "/rfq?category=cashew" }),
);
assert.ok(okHtml.includes("$7.6–8.4/kg"), "The range reaches the page with its unit");
assert.ok(okHtml.includes("3 prices"), "The sample count is visible");
assert.ok(okHtml.includes("not a binding offer"), "The disclaimer is always present");
assert.ok(okHtml.includes('href="/rfq?category=cashew"'), "The block offers a quote path");

const gradeHtml = renderToStaticMarkup(
  React.createElement(strip.PriceRangeStrip, { outcome: byGrade, categoryName: "Cashew", rfqHref: "/rfq" }),
);
assert.ok(gradeHtml.includes("W180") && gradeHtml.includes("W320"), "Each grade is labelled on the page");
assert.ok(gradeHtml.includes("$7–7.2/kg") && gradeHtml.includes("$9.4–9.6/kg"), "Each grade shows its own range");
assert.ok(!gradeHtml.includes("$7–9.6/kg"), "Grades are never merged into one wide range");
assert.ok(gradeHtml.includes("ungraded listing") && gradeHtml.includes("1"), "Ungraded listings are disclosed");

const outlierBlock = priceRange.buildPriceBlock(
  [
    { value: 6.2, unit: "kg", updatedAt: daysAgo(1) },
    { value: 6.6, unit: "kg", updatedAt: daysAgo(2) },
    { value: 7.2, unit: "kg", updatedAt: daysAgo(3) },
    { value: 7.2, unit: "kg", updatedAt: daysAgo(4) },
    { value: 1.55, unit: "kg", updatedAt: daysAgo(5) },
  ],
  { now: NOW },
);
const outlierHtml = renderToStaticMarkup(
  React.createElement(strip.PriceRangeStrip, { outcome: outlierBlock, categoryName: "Cashew", rfqHref: "/rfq" }),
);
assert.ok(outlierHtml.includes("$6.2–7.2/kg"), "The bait price does not widen the headline range");
assert.ok(!outlierHtml.includes("$1.55"), "The excluded bait price itself is not printed as a bound");
assert.ok(/1 outlier excluded/.test(outlierHtml), "The page discloses that an outlier was excluded");

const staleBlock = priceRange.buildPriceBlock(
  [
    { value: 7.9, unit: "kg", updatedAt: daysAgo(60) },
    { value: 8.1, unit: "kg", updatedAt: daysAgo(61) },
    { value: 8.2, unit: "kg", updatedAt: daysAgo(62) },
  ],
  { now: NOW },
);
const staleHtml = renderToStaticMarkup(
  React.createElement(strip.PriceRangeStrip, { outcome: staleBlock, categoryName: "Cashew", rfqHref: "/rfq" }),
);
assert.ok(/45 days/.test(staleHtml), "Stale data says so on the page");

const fewHtml = renderToStaticMarkup(
  React.createElement(strip.PriceRangeStrip, { outcome: spreadThin, categoryName: "Cashew", rfqHref: "/rfq" }),
);
assert.ok(!/\d+\.\d{2}\/kg/.test(fewHtml), "No price number appears when grades are too thin");
assert.ok(fewHtml.includes("Not enough data yet"), "The block explains why it is empty");

const tooFewSuppliersHtml = renderToStaticMarkup(
  React.createElement(strip.PriceRangeStrip, { outcome: supplierDuplication, categoryName: "Cashew", rfqHref: "/rfq" }),
);
assert.ok(!/\d+\.\d{2}\/kg/.test(tooFewSuppliersHtml), "No price number appears when no grade has enough distinct suppliers");
assert.ok(tooFewSuppliersHtml.includes("Not enough data yet"), "The block gives one short reason regardless of whether the cause is sample count or supplier diversity");

const pendingSuppliersHtml = renderToStaticMarkup(
  React.createElement(strip.PriceRangeStrip, { outcome: partialSupplierCoverage, categoryName: "Cashew", rfqHref: "/rfq" }),
);
assert.ok(pendingSuppliersHtml.includes("W180"), "The qualifying grade still shows its range");
assert.ok(!pendingSuppliersHtml.includes("$2.5"), "The grade held back for too few suppliers never surfaces its price on the page");
assert.ok(/W450.*too few different suppliers/.test(pendingSuppliersHtml), "The held-back grade is named with the right reason");

assert.equal(
  renderToStaticMarkup(React.createElement(strip.PriceRangeStrip, { outcome: { status: "none" }, categoryName: "Cashew", rfqHref: "/rfq" })),
  "",
  "No usable samples means no block at all",
);

/* ---------------- Nối vào trang ---------------- */

const catalog = readFileSync(new URL("../lib/public/product-catalog.ts", import.meta.url), "utf8");
assert.ok(catalog.includes("publicProductPricePoint"), "The catalog exposes numeric price points through the same consent gate");
assert.ok(catalog.includes("isDemoSupplier"), "Demo profiles are marked so they stay out of the market range");

const page = readFileSync(new URL("../app/(public)/products/[slug]/page.tsx", import.meta.url), "utf8");
assert.ok(page.includes("displayUnitsForCategory(cat.slug, cat.price_unit"), "The category page reads its own unit setting");
assert.ok(page.includes("buildPriceBlock(pricePointsFrom(products)"), "The category page splits the range by grade");
assert.ok(page.includes("grade: p.grade"), "Grade travels with each price point");
assert.ok(page.includes("!p.isDemoSupplier && p.pricePoint"), "Demo listings and private prices are excluded before aggregation");
const stripIndex = page.indexOf("<PriceRangeStrip");
const gridIndex = page.indexOf("<CategoryProductGrid", stripIndex);
assert.ok(stripIndex > -1 && stripIndex < gridIndex, "The price strip sits above the product grid");

console.log("✅ check-price-range: quy ước đơn vị theo ngành, quy đổi tấn/kg/pound, ngưỡng 3 mẫu và 45/90 ngày đều đạt");
