#!/usr/bin/env node
// node --experimental-strip-types --no-warnings scripts/check-grade-pricing.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";

import * as priceUnits from "../lib/public/price-units.ts";
import * as gradeResolution from "../lib/public/grade-resolution.ts";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");

function compile(path, mocks) {
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: (key) => {
      if (!(key in mocks)) throw new Error(`${path}: unexpected import ${key}`);
      return mocks[key];
    },
    process, console, Date, React, Intl,
  });
  return mod.exports;
}

const icons = new Proxy({}, {
  get: (_target, name) => (props) => React.createElement("span", { "data-icon": String(name), className: props.className }),
});

const gradePricing = compile("../lib/products/grade-pricing.ts", {
  "@/lib/public/price-units": priceUnits,
  "@/lib/public/grade-resolution": gradeResolution,
});

const priceRange = compile("../lib/public/price-range.ts", {
  "@/lib/public/price-units": priceUnits,
});

const { GradePricingTable } = compile("../components/products/grade-pricing-table.tsx", {
  react: React,
  "react/jsx-runtime": jsx,
  "lucide-react": icons,
  "@/lib/products/grade-pricing": gradePricing,
});

/* ---------------- 1. Category units & standard grade options ---------------- */

const cashewUnit = gradePricing.categoryMarketPriceUnit("cashew-kernels", null);
assert.equal(cashewUnit.unitLabel, "USD/kg");
assert.equal(cashewUnit.headerLabel, "GIÁ (USD/KG)");
assert.equal(cashewUnit.tradeUnit, "kg");

for (const slug of ["pepper", "cinnamon-star-anise", "rice", "coffee"]) {
  const unit = gradePricing.categoryMarketPriceUnit(slug, null);
  assert.equal(unit.unitLabel, "USD/MT", `${slug} uses USD/MT`);
  assert.equal(unit.headerLabel, "GIÁ (USD/MT)");
}
assert.equal(gradePricing.categoryMarketPriceUnit("seafood", null).unitLabel, "USD/kg");

const cashewGrades = gradePricing.standardGradesForCategory({ slug: "cashew-kernels" });
for (const expected of ["W180", "W210", "W240", "W320", "W450", "SW", "WS", "LP", "SP"]) {
  assert.ok(cashewGrades.includes(expected), `Cashew includes standard grade ${expected}`);
}
const pepperGrades = gradePricing.standardGradesForCategory({ slug: "pepper" });
for (const expected of ["500 g/L", "550 g/L", "570 g/L", "580 g/L", "White pepper"]) {
  assert.ok(pepperGrades.includes(expected), `Pepper includes standard grade ${expected}`);
}

/* ---------------- 2. Category switching reconciliation ---------------- */

const initialRows = [
  { id: "r1", selectedGrade: "W320", customGrade: "", priceMin: "7.2", priceMax: "7.5", incoterm: "FOB", moq: "1 MT" },
  { id: "r2", selectedGrade: gradePricing.CUSTOM_GRADE_OPTION, customGrade: "Broken roasted", priceMin: "", priceMax: "", incoterm: "CIF", moq: "500 kg" },
];
const switchedToPepper = gradePricing.reconcileGradeRowsForCategory(initialRows, { slug: "pepper" });
assert.equal(switchedToPepper[0].selectedGrade, "", "Incompatible standard grade resets when switching category");
assert.equal(switchedToPepper[1].selectedGrade, gradePricing.CUSTOM_GRADE_OPTION, "Custom self-entered grade stays intact across category switch");
assert.equal(switchedToPepper[1].customGrade, "Broken roasted");

/* ---------------- 3. Row validation (require_both & bounds) ---------------- */

const emptyGradeCheck = gradePricing.validateGradeRowsDraft(
  [{ id: "r1", selectedGrade: "", customGrade: "", priceMin: "7.2", priceMax: "7.5", incoterm: "FOB", moq: "1 MT" }],
  { slug: "cashew-kernels" },
);
assert.equal(emptyGradeCheck.valid, false);
assert.equal(emptyGradeCheck.rowResults[0].gradeError, "Chọn grade cho dòng này.");

const emptyCustomCheck = gradePricing.validateGradeRowsDraft(
  [{ id: "r1", selectedGrade: gradePricing.CUSTOM_GRADE_OPTION, customGrade: "   ", priceMin: "", priceMax: "", incoterm: "FOB", moq: "" }],
  { slug: "cashew-kernels" },
);
assert.equal(emptyCustomCheck.valid, false);
assert.equal(emptyCustomCheck.rowResults[0].gradeError, "Nhập tên grade cho dòng này.");

const missingUpperPrice = gradePricing.validateGradeRowsDraft(
  [{ id: "r1", selectedGrade: "W320", customGrade: "", priceMin: "7.2", priceMax: "", incoterm: "FOB", moq: "1 MT" }],
  { slug: "cashew-kernels" },
);
assert.equal(missingUpperPrice.valid, false);
assert.equal(missingUpperPrice.rowResults[0].priceError, "Nhập đủ giá từ và đến, hoặc để trống cả hai.");

const invertedPrice = gradePricing.validateGradeRowsDraft(
  [{ id: "r1", selectedGrade: "W180", customGrade: "", priceMin: "8.5", priceMax: "8.0", incoterm: "FOB", moq: "1 MT" }],
  { slug: "cashew-kernels" },
);
assert.equal(invertedPrice.valid, false);
assert.equal(invertedPrice.rowResults[0].priceError, "Giá đến phải lớn hơn hoặc bằng giá từ và lớn hơn 0.");

const validMixedRows = gradePricing.validateGradeRowsDraft(
  [
    { id: "r1", selectedGrade: "W180", customGrade: "", priceMin: "8.5", priceMax: "9.0", incoterm: "FOB", moq: "1 tấn" },
    { id: "r2", selectedGrade: "W320", customGrade: "", priceMin: "7.2", priceMax: "7.5", incoterm: "CIF", moq: "2 tấn" },
    { id: "r3", selectedGrade: "LP", customGrade: "", priceMin: "", priceMax: "", incoterm: "FOB", moq: "5 tấn" },
    { id: "r4", selectedGrade: gradePricing.CUSTOM_GRADE_OPTION, customGrade: "DW2 roasted", priceMin: "6.5", priceMax: "6.8", incoterm: "EXW", moq: "500 kg" },
  ],
  { slug: "cashew-kernels" },
);
assert.equal(validMixedRows.valid, true);
assert.equal(validMixedRows.rows.length, 4);
assert.equal(validMixedRows.rows[2].price_min, null, "Leaving both price inputs blank stores On request");
assert.equal(validMixedRows.rows[2].price_max, null);
assert.equal(validMixedRows.rows[3].is_custom, true);

// Min 1 / Max 10 enforcement on server payload
assert.equal(gradePricing.parseGradeRowsFromPayload([], { slug: "cashew-kernels" }).ok, false, "0 rows rejected");
const elevenRows = Array.from({ length: 11 }, (_, idx) => ({
  selectedGrade: "W320", customGrade: "", priceMin: "7", priceMax: "8", incoterm: "FOB", moq: `${idx + 1} MT`,
}));
assert.equal(gradePricing.parseGradeRowsFromPayload(elevenRows, { slug: "cashew-kernels" }).ok, false, ">10 rows rejected");

/* ---------------- 4. Scalar sync, specs storage & public projection ---------------- */

const summary = gradePricing.summarizeGradeRowsForProduct(validMixedRows.rows, { slug: "cashew-kernels" });
assert.equal(summary.ref_price, 6.5);
assert.equal(summary.ref_price_max, 9);
assert.equal(summary.currency, "USD");
assert.equal(summary.unit, "kg");
assert.equal(summary.incoterm, "FOB");
assert.equal(summary.moq, "1 MT");
assert.equal(summary.moq_qty, 1);
assert.equal(summary.moq_unit, "mt");

const specs = gradePricing.applyGradeRowsToSpecs({ moisture: "5%" }, validMixedRows.rows, { slug: "cashew-kernels" });
assert.equal(specs.moisture, "5%", "Non-grade attributes preserved");
assert.equal(specs.grade, "W180", "First standard grade synced to specs.grade");
assert.equal(specs.grade_rows.length, 4);

const productRecord = {
  name: "Vietnamese Cashew Kernels",
  spec: "Vacuum pack",
  specs,
  ref_price: summary.ref_price,
  ref_price_max: summary.ref_price_max,
  currency: summary.currency,
  unit: summary.unit,
  incoterm: summary.incoterm,
  moq: summary.moq,
  updated_at: "2026-10-25T00:00:00Z",
};

// Public projection WITH price consent
const publicAllowed = gradePricing.projectPublicGradeData(productRecord, { slug: "cashew-kernels" }, {
  canShowPrice: true,
  sanitizeText: (s) => s,
  translateMoq: (m) => m || "",
});
assert.equal(publicAllowed.hasGradeRows, true);
assert.deepEqual([...publicAllowed.standardGrades], ["W180", "W320", "LP"], "Custom grades excluded from standardGrades filter list");
assert.deepEqual([...publicAllowed.cardGrades], ["W180", "W320", "LP"], "cardGrades exposes canonical standard grades from Grade & giá");
assert.equal(publicAllowed.gradePricePoints.length, 2, "Only priced standard grades enter reference price points (LP unpriced + DW2 custom excluded)");
assert.equal(publicAllowed.summaryPrice, "USD 6.50 to 9.00/kg");
assert.equal(publicAllowed.gradeRows.length, 4, "All 4 rows render in PDP Grades & reference pricing table");
assert.equal(publicAllowed.gradeRows[0].priceText, "USD 8.50 to 9.00/kg");
assert.equal(publicAllowed.gradeRows[2].priceText, null, "Unpriced row renders On request");
assert.equal(publicAllowed.gradeRows[3].isCustom, true);

const conflictingMoqRows = gradePricing.projectPublicGradeData({
  ...productRecord, moq: "999 kg", specs: { grade_rows: [
    { grade: "W320", price_min: 6, price_max: 7, incoterm: "FOB", moq: "1000 kg", moq_unit: "cont_20ft" },
    { grade: "W240", price_min: 7, price_max: 8, incoterm: "FOB", moq: "1000 kg", moq_qty: 1, moq_unit: "cont_40ft" },
    { grade: "W180", price_min: 8, price_max: 9, incoterm: "FOB" },
  ] },
}, { slug: "cashew-kernels" }, { canShowPrice: true, sanitizeText: (s) => s, translateMoq: (m) => m || "", fallbackMoq: "999 kg" });
assert.equal(conflictingMoqRows.gradeRows[0].moq, "On request", "Incomplete structured container cannot use conflicting text");
assert.match(conflictingMoqRows.gradeRows[1].moq, /40ft container/, "Valid structured container stays a container, never a text weight");
assert.equal(conflictingMoqRows.gradeRows[2].moq, "On request", "A grade never borrows the product-level MOQ");

// Reversed supplier input still sorts cardGrades in canonical category order, and legacy name-only products expose empty cardGrades
const reversedPepper = gradePricing.projectPublicGradeData(
  {
    name: "Vietnam Pepper",
    spec: "550 g/L, 500 g/L",
    specs: {
      grade_rows: [
        { grade: "White pepper", is_custom: false, price_min: 2400, price_max: 2500, incoterm: "FOB", moq: "1 tấn" },
        { grade: "500 g/L", is_custom: false, price_min: 1500, price_max: 1600, incoterm: "FOB", moq: "1 tấn" },
      ],
    },
    updated_at: "2026-10-25T00:00:00Z",
  },
  { slug: "pepper" },
  { canShowPrice: true, sanitizeText: (s) => s, translateMoq: (m) => m || "" },
);
assert.deepEqual([...reversedPepper.cardGrades], ["500 g/L", "White pepper"], "cardGrades sorts by canonical category grade order");

const nameOnlyLegacy = gradePricing.projectPublicGradeData(
  {
    name: "Best Price Vietnam Black Pepper 500GL 550GL",
    spec: "",
    specs: {},
    ref_price: 1800,
    currency: "USD",
    unit: "MT",
    incoterm: "FOB",
    moq: "1 MT",
    updated_at: "2026-10-25T00:00:00Z",
  },
  { slug: "pepper" },
  { canShowPrice: true, sanitizeText: (s) => s, translateMoq: (m) => m || "" },
);
assert.deepEqual([...nameOnlyLegacy.cardGrades], [], "cardGrades never infers grade labels from product name");

// MT category formatting (/MT, never /t) + unified unit conversion for legacy products
const pepperGradeData = gradePricing.projectPublicGradeData(
  {
    name: "Vietnam Black Pepper",
    spec: "500 g/L, 550 g/L",
    specs: {
      grade_rows: [
        { grade: "500 g/L", is_custom: false, price_min: 1500, price_max: 1600, incoterm: "FOB", moq: "1 tấn" },
        { grade: "550 g/L", is_custom: false, price_min: 1800, price_max: 1900, incoterm: "FOB", moq: "1 tấn" },
      ],
    },
    ref_price: 1500,
    ref_price_max: 1900,
    currency: "USD",
    unit: "MT",
    incoterm: "FOB",
    moq: "1 tấn",
    updated_at: "2026-10-25T00:00:00Z",
  },
  { slug: "pepper" },
  { canShowPrice: true, sanitizeText: (s) => s, translateMoq: (m) => m || "" },
);
assert.equal(pepperGradeData.summaryPrice, "USD 1,500 to 1,900/MT", "MT categories format as /MT, never /t");
assert.equal(pepperGradeData.gradeRows[0].priceText, "USD 1,500 to 1,600/MT");

const legacyPepperInKg = gradePricing.projectPublicGradeData(
  {
    name: "Legacy Black Pepper 550 g/L",
    spec: "550 g/L",
    specs: {},
    ref_price: 5.8,
    ref_price_max: null,
    currency: "USD",
    unit: "kg",
    incoterm: "FOB",
    moq: "1 MT",
    updated_at: "2026-10-25T00:00:00Z",
  },
  { slug: "pepper" },
  { canShowPrice: true, sanitizeText: (s) => s, translateMoq: (m) => m || "" },
);
assert.equal(legacyPepperInKg.summaryPrice, "USD 5,800/MT", "Legacy kg product in an MT category converts to unified /MT");

// PDP layout: no duplicate giant Reference price box above grade table, lighter H1, and no duplicate Grade/MOQ/Incoterm in Key terms
const pdpSource = readFileSync(new URL("../app/(public)/products/[slug]/[productId]/page.tsx", import.meta.url), "utf8");
assert.match(pdpSource, /<h1 className="mt-2 break-words text-xl font-semibold leading-snug tracking-tight text-ink-900 sm:text-2xl">/);
assert.match(pdpSource, /gradeRows\.length > 0 \?/);
assert.match(pdpSource, /gradeRows\.length === 0 && <Spec label="Incoterm"/);

// Public projection WITHOUT price consent (must redact every row price)
const publicBlocked = gradePricing.projectPublicGradeData(productRecord, { slug: "cashew-kernels" }, {
  canShowPrice: false,
  sanitizeText: (s) => s,
  translateMoq: (m) => m || "",
});
assert.equal(publicBlocked.summaryPrice, null, "Summary price hidden when price gate fails");
assert.equal(publicBlocked.gradePricePoints.length, 0, "No price points emitted when price gate fails");
assert.ok(publicBlocked.gradeRows.every((r) => r.priceText === null && r.priceMin === null && r.priceMax === null), "All row prices redacted when price gate fails");

/* ---------------- 5. Multi-grade PriceRangeStrip highValue aggregation ---------------- */

const block = priceRange.buildPriceBlock(
  [
    { grade: "W320", value: 7.1, highValue: 7.4, unit: "kg", currency: "USD", updatedAt: "2026-10-25T00:00:00Z" },
    { grade: "W320", value: 7.2, highValue: 7.5, unit: "kg", currency: "USD", updatedAt: "2026-10-25T00:00:00Z" },
    { grade: "W320", value: 7.15, highValue: 7.45, unit: "kg", currency: "USD", updatedAt: "2026-10-25T00:00:00Z" },
  ],
  { now: new Date("2026-10-28T00:00:00Z"), unit: "kg" },
);
assert.equal(block.status, "ok");
assert.equal(block.rows[0].sampleSize, 3, "Each supplier row counts as 1 sample");
assert.equal(block.rows[0].low, 7.1, "Low uses minimum price_min");
assert.equal(block.rows[0].high, 7.5, "High uses maximum price_max");

/* ---------------- 6. GradePricingTable SSR + custom notice + inline alerts ---------------- */

const tableHtml = renderToStaticMarkup(
  React.createElement(GradePricingTable, {
    rows: [
      { id: "r1", selectedGrade: "W180", customGrade: "", priceMin: "8.5", priceMax: "", incoterm: "FOB", moq: "1 tấn" },
      { id: "r2", selectedGrade: gradePricing.CUSTOM_GRADE_OPTION, customGrade: "Hạt vỡ rang muối", priceMin: "", priceMax: "", incoterm: "CIF", moq: "500 kg" },
    ],
    onChange: () => {},
    category: { slug: "cashew-kernels" },
    showErrors: true,
    hiddenInputName: "grade_rows_json",
  }),
);
assert.match(tableHtml, /GIÁ \(USD\/KG\)/);
assert.match(tableHtml, /Nhập đủ giá từ và đến, hoặc để trống cả hai\./, "Inline price pair error rendered");
assert.match(tableHtml, /Grade tự nhập không có nhãn chuẩn, không tính vào bảng giá tham khảo và bộ lọc\./, "Amber custom-grade notice rendered");
assert.match(tableHtml, /font-mono[^"]*tabular-nums/, "Price inputs use JetBrains Mono tabular-nums");

/* ---------------- 7. Migration & zero forbidden AI characters ---------------- */

const migrationSql = readFileSync(new URL("../supabase/migrations/20261051_product_grade_rows.sql", import.meta.url), "utf8");
assert.match(migrationSql, /create or replace view public\.v_public_supplier_products/i);
assert.match(migrationSql, /\{"price_min": null, "price_max": null\}/, "Public view redacts per-row prices when price gates fail");
assert.match(migrationSql, /'W210'/, "Cashew standard grades include W210 in database seed");

for (const file of [
  "../lib/products/grade-pricing.ts",
  "../components/products/grade-pricing-table.tsx",
  "../supabase/migrations/20261051_product_grade_rows.sql",
  "../supabase/migrations/20261052_structured_units_and_moq.sql",
]) {
  const text = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.doesNotMatch(text, /[—–·•→“”‘’…]/, `${file} contains zero forbidden AI-style characters`);
}

/* ---------------- 8. Structured MOQ, bag/carton weight, container filter, reasonable price & lead time ---------------- */

// Bag MOQ missing weight -> rejected
const bagMissingWeight = gradePricing.validateGradeRowsDraft(
  [{
    id: "b1",
    selectedGrade: "500 g/L",
    customGrade: "",
    priceMin: "6000",
    priceMax: "6200",
    incoterm: "FOB",
    moq: "",
    moqQty: "280",
    moqUnit: "bag",
    moqUnitWeightKg: "",
  }],
  { slug: "pepper", price_unit: "mt" },
);
assert.equal(bagMissingWeight.valid, false);
assert.equal(bagMissingWeight.rowResults[0].moqError, "Nhập trọng lượng mỗi bao (kg).");

// Bag MOQ with 25 kg weight -> 7 MT ("7 MT (280 × 25 kg bags)") & Vi ("7 tấn (280 × bao 25 kg)") & "large" filter
const bagWithWeight = gradePricing.validateGradeRowsDraft(
  [{
    id: "b2",
    selectedGrade: "500 g/L",
    customGrade: "",
    priceMin: "6000",
    priceMax: "6200",
    incoterm: "FOB",
    moq: "",
    moqQty: "280",
    moqUnit: "bag",
    moqUnitWeightKg: "25",
  }],
  { slug: "pepper", price_unit: "mt" },
);
assert.equal(bagWithWeight.valid, true);
assert.equal(bagWithWeight.rows[0].moq, "7 MT (280 × 25 kg bags)");
assert.equal(bagWithWeight.rows[0].moq_mt_equivalent, 7);
assert.equal(gradePricing.formatStructuredMoqVi(280, "bag", 25), "7 tấn (280 × bao 25 kg)");
assert.equal(
  gradePricing.classifyMoqFilterGroup({
    moqUnit: bagWithWeight.rows[0].moq_unit,
    moqMtEquivalent: bagWithWeight.rows[0].moq_mt_equivalent,
    moqText: bagWithWeight.rows[0].moq,
  }),
  "large",
);

// Container MOQ -> "1 × 20ft container", null MT conversion, "container" (Full container) filter
const contRow = gradePricing.validateGradeRowsDraft(
  [{
    id: "c1",
    selectedGrade: "W320",
    customGrade: "",
    priceMin: "7.2",
    priceMax: "7.5",
    incoterm: "FOB",
    moq: "",
    moqQty: "1",
    moqUnit: "cont_20ft",
    moqUnitWeightKg: "",
  }],
  { slug: "cashew", price_unit: "kg" },
);
assert.equal(contRow.valid, true);
assert.equal(contRow.rows[0].moq, "1 × 20ft container");
assert.equal(contRow.rows[0].moq_mt_equivalent, null);
assert.equal(
  gradePricing.classifyMoqFilterGroup({
    moqUnit: contRow.rows[0].moq_unit,
    moqMtEquivalent: contRow.rows[0].moq_mt_equivalent,
    moqText: contRow.rows[0].moq,
  }),
  "container",
);

// Per-category allowed MOQ units enforcement
const restrictedCat = { slug: "rice", price_unit: "mt", moq_units: ["mt", "cont_20ft"] };
assert.deepEqual([...gradePricing.allowedMoqUnitsForCategory(restrictedCat)], ["mt", "cont_20ft"]);
const disallowedCarton = gradePricing.validateGradeRowsDraft(
  [{
    id: "rc1",
    selectedGrade: "ST25",
    customGrade: "",
    priceMin: "850",
    priceMax: "900",
    incoterm: "FOB",
    moq: "",
    moqQty: "100",
    moqUnit: "carton",
    moqUnitWeightKg: "10",
  }],
  restrictedCat,
);
assert.equal(disallowedCarton.valid, false);
assert.match(disallowedCarton.rowResults[0].moqError, /không nằm trong danh sách cho phép/);

// Reasonable converted price bounds (catches kg <-> MT mix-ups)
const mtEnteredInKgCat = gradePricing.validateGradeRowsDraft(
  [{ id: "p1", selectedGrade: "W320", customGrade: "", priceMin: "7800", priceMax: "8000", incoterm: "FOB", moq: "1 MT" }],
  { slug: "cashew", price_unit: "kg" },
);
assert.equal(mtEnteredInKgCat.valid, false);
assert.match(mtEnteredInKgCat.rowResults[0].priceError, /tối đa 500 USD\/kg/);

const kgEnteredInMtCat = gradePricing.validateGradeRowsDraft(
  [{ id: "p2", selectedGrade: "500 g/L", customGrade: "", priceMin: "6.5", priceMax: "7.0", incoterm: "FOB", moq: "1 MT" }],
  { slug: "pepper", price_unit: "mt" },
);
assert.equal(kgEnteredInMtCat.valid, false);
assert.match(kgEnteredInMtCat.rowResults[0].priceError, /tối thiểu 50 USD\/MT/);

// Lead time: Vietnamese on Portal vs English on Buyer
const ltWeeks = gradePricing.parseLeadTimeInput({ valueRaw: "2", unitRaw: "weeks" });
assert.equal(ltWeeks.ok, true);
assert.equal(ltWeeks.daysEquivalent, 14);
const specsWithWeeks = gradePricing.applyLeadTimeToSpecs({}, ltWeeks);
assert.equal(gradePricing.formatLeadTimeVi({ lead_time_days: 14, specs: specsWithWeeks }), "2 tuần");
assert.equal(gradePricing.formatLeadTimeBuyer({ lead_time_days: 14, specs: specsWithWeeks }), "2 weeks");
assert.equal(gradePricing.formatLeadTimeVi({ lead_time_days: null, specs: { lead_time: { value: null, unit: "on_request" } } }), "Theo yêu cầu");
assert.equal(gradePricing.formatLeadTimeBuyer({ lead_time_days: null, specs: { lead_time: { value: null, unit: "on_request" } } }), "On request");

// Legacy MOQ migration parser: clear vs manual review
assert.equal(gradePricing.parseLegacyMoqString("1 tấn").buyerText, "1 MT");
assert.equal(gradePricing.parseLegacyMoqString("100kg").buyerText, "100 kg");
assert.equal(gradePricing.parseLegacyMoqString("1 cont 20ft (~19,2 MT)").buyerText, "1 × 20ft container");
const unmigratedBag = gradePricing.parseLegacyMoqString("280 Túi");
assert.equal(unmigratedBag.status, "needs_review");
assert.equal(unmigratedBag.suggestedQty, 280);
assert.equal(unmigratedBag.suggestedUnit, "bag");

/* ---------------- 9. Phase-1 basic supplier pricing guardrails: max 1.35x spread & price-change detection ---------------- */

assert.equal(gradePricing.MAX_PRICE_SPREAD_RATIO, 1.35);

// Exact 1.35x spread is allowed (e.g. 6.00 -> 8.10 USD/kg, or 5000 -> 6750 USD/MT)
const exact135 = gradePricing.validateGradeRowsDraft(
  [{ id: "s1", selectedGrade: "W320", customGrade: "", priceMin: "6.00", priceMax: "8.10", incoterm: "FOB", moqQty: "1", moqUnit: "mt" }],
  { slug: "cashew", price_unit: "kg" },
);
assert.equal(exact135.valid, true, "1.35x spread should be valid");

// Exceeding 1.35x spread is rejected with a clear Vietnamese message
const over135 = gradePricing.validateGradeRowsDraft(
  [{ id: "s2", selectedGrade: "W320", customGrade: "", priceMin: "6.00", priceMax: "8.15", incoterm: "FOB", moqQty: "1", moqUnit: "mt" }],
  { slug: "cashew", price_unit: "kg" },
);
assert.equal(over135.valid, false, "Spread > 1.35x must be rejected");
assert.match(over135.rowResults[0].priceError, /1,35/);

const payloadOver135 = gradePricing.parseGradeRowsFromPayload(
  JSON.stringify([{ selectedGrade: "500 g/L", customGrade: "", priceMin: "5000", priceMax: "6800", incoterm: "FOB", moqQty: "1", moqUnit: "mt" }]),
  { slug: "pepper", price_unit: "mt" },
);
assert.equal(payloadOver135.ok, false);
assert.match(payloadOver135.message, /1,35/);

// hasProductPricingChanged: non-price edits vs real price changes
const baseApproved = {
  name: "Hạt điều nhân W320",
  spec: "W320",
  ref_price: 7.2,
  ref_price_max: 7.5,
  currency: "USD",
  unit: "kg",
  price_publicly_visible: true,
  specs: {
    grade_rows: [
      { grade: "W320", is_custom: false, price_min: 7.2, price_max: 7.5, incoterm: "FOB", moq: "1 MT", moq_qty: 1, moq_unit: "mt", moq_unit_weight_kg: null, moq_mt_equivalent: 1 },
    ],
  },
};
assert.equal(
  gradePricing.hasProductPricingChanged(baseApproved, { ...baseApproved, name: "Hạt điều nhân W320 xuất khẩu" }, { slug: "cashew", price_unit: "kg" }),
  false,
  "Changing only product name must not trigger price re-review",
);
assert.equal(
  gradePricing.hasProductPricingChanged(
    baseApproved,
    {
      ...baseApproved,
      ref_price: 6.9,
      ref_price_max: 7.4,
      specs: {
        grade_rows: [
          { ...baseApproved.specs.grade_rows[0], price_min: 6.9, price_max: 7.4 },
        ],
      },
    },
    { slug: "cashew", price_unit: "kg" },
  ),
  true,
  "Changing grade row prices must trigger price re-review",
);
assert.equal(
  gradePricing.hasProductPricingChanged(
    { ...baseApproved, price_publicly_visible: false },
    { ...baseApproved, price_publicly_visible: true },
    { slug: "cashew", price_unit: "kg" },
  ),
  true,
  "Enabling public price visibility on an approved priced product triggers price check",
);

console.log("✅ Grade & giá + Structured Units + Pricing Guardrails (1.35x spread & price-change check) passed.");
