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
const strip = compile("../components/price-range.tsx", {
  "react/jsx-runtime": createRequire(import.meta.url)("react/jsx-runtime"),
  "next/link": { default: Link },
  "lucide-react": { ArrowRight },
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
assert.equal(units.parsePriceUnit("thùng"), null, "A packing unit is not a price unit and must not be guessed");
assert.equal(units.parsePriceUnit(""), null);
assert.equal(units.parsePriceUnit(undefined, null), null);

/* ---------------- Quy đổi ---------------- */

assert.equal(units.toPricePerKg(1000, "mt"), 1, "USD 1,000 a tonne is USD 1.00 a kilogram");
assert.equal(units.toPricePerKg(1, "kg"), 1);
assert.ok(Math.abs(units.toPricePerKg(1, "lb") - 2.2046226218) < 1e-9, "A price per pound converts to the equivalent per kilogram");
assert.equal(units.toPricePerKg(0, "kg"), null, "Zero is not a price");
assert.equal(units.toPricePerKg(5, null), null, "An unknown unit never becomes kg by default");
assert.ok(Math.abs(units.fromPricePerKg(7.9, "mt") - 7900) < 1e-6, "A price per kilogram converts back to the tonne quote");
assert.equal(units.formatUnitPrice(7.9, "kg"), "USD 7.90/kg");
assert.equal(units.formatUnitPrice(4500, "mt"), "USD 4,500/t");
assert.equal(units.formatUnitRange(7.6, 8.4, "kg"), "USD 7.60 to 8.40/kg");
assert.equal(units.formatUnitRange(420, 420, "mt"), "USD 420/t", "A single level is not shown as a range");

/* ---------------- Quy ước hiển thị theo ngành ---------------- */

const cashewUnits = units.displayUnitsForCategory("cashew", null);
assert.equal(cashewUnits.primary, "kg", "Cashew follows the Vietnamese FOB convention");
assert.equal(cashewUnits.secondary, "lb", "Cashew also shows pounds because trade reports quote them");

const riceUnits = units.displayUnitsForCategory("rice", null);
assert.equal(riceUnits.primary, "mt", "Rice follows the tonne convention");
assert.equal(riceUnits.secondary, undefined);

assert.equal(units.displayUnitsForCategory("spices", null).primary, "mt", "The live slug 'spices' resolves to tonnes, not to the guessed 'dried-spices'");
assert.equal(units.displayUnitsForCategory("dried-spices", null).primary, "mt");
assert.equal(units.displayUnitsForCategory("some-rice-variety", null).primary, "mt", "An unlisted slug is inferred from its industry keyword");
assert.equal(units.displayUnitsForCategory("frozen-shrimp", null).primary, "kg");
assert.equal(units.displayUnitsForCategory("unknown-category", null).primary, "kg", "Unknown categories fall back to kg, never to tonnes");
const cashewKernelUnits = units.displayUnitsForCategory("cashew-kernels", null);
assert.equal(cashewKernelUnits.primary, "kg", "The launch slug for cashew kernels reads in kilograms");
assert.equal(cashewKernelUnits.secondary, "lb", "The launch slug for cashew kernels also shows pounds, like the trade reports");
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
assert.equal(ok.range.rangeText, "USD 7.60 to 8.40/kg");

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
    { value: 99, unit: "kg", updatedAt: daysAgo(1), exclude: true },
    { value: 12, unit: "kg", updatedAt: daysAgo(120) },
  ],
  { now: NOW },
);
assert.equal(filtered.status, "ok");
assert.equal(filtered.range.sampleSize, 3, "Unknown units, missing dates, other currencies, demo rows and stale rows are all dropped");
assert.equal(filtered.range.high, 8.2);

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
assert.equal(riceRange.range.rangeText, "USD 420 to 450/t");

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
assert.equal(cashewRange.range.secondary.unit, "lb");
assert.equal(cashewRange.range.secondary.low, 3.45, "The pound equivalent is shown for cashew buyers");

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
assert.ok(okHtml.includes("USD 7.60 to 8.40/kg"), "The range reaches the page with its unit");
assert.ok(okHtml.includes("3 published prices"), "The sample count is visible");
assert.ok(okHtml.includes("not a binding offer"), "The disclaimer is always present");
assert.ok(okHtml.includes('href="/rfq?category=cashew"'), "The block offers a quote path");

const gradeHtml = renderToStaticMarkup(
  React.createElement(strip.PriceRangeStrip, { outcome: byGrade, categoryName: "Cashew", rfqHref: "/rfq" }),
);
assert.ok(gradeHtml.includes("W180") && gradeHtml.includes("W320"), "Each grade is labelled on the page");
assert.ok(gradeHtml.includes("USD 7.00 to 7.20/kg") && gradeHtml.includes("USD 9.40 to 9.60/kg"), "Each grade shows its own range");
assert.ok(!gradeHtml.includes("USD 7.00 to 9.60/kg"), "Grades are never merged into one wide range");
assert.ok(gradeHtml.includes("not state a grade"), "Ungraded listings are disclosed");

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
assert.ok(fewHtml.includes("Too few published prices"), "The block explains why it is empty");

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
