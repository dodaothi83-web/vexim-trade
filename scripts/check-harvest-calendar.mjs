#!/usr/bin/env node
// node --experimental-strip-types --no-warnings scripts/check-harvest-calendar.mjs
//
// Kiểm lịch mùa vụ ở hai lớp: logic thuần (tháng, vắt qua năm mới, chuẩn hóa dữ liệu)
// và phần render thật của component, để chắc biểu đồ là HTML chứ không phải ảnh và
// trình đọc màn hình đọc được nội dung.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";

import * as harvest from "../lib/public/harvest.ts";

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
    process,
    console,
    Date,
    React,
  });
  return exports;
};

const Link = ({ href, children, ...rest }) => React.createElement("a", { href, ...rest }, children);
const ArrowRight = () => React.createElement("span", { "data-icon": "arrow" });

const jsxRuntime = createRequire(import.meta.url)("react/jsx-runtime");
const section = compile("../components/harvest-calendar.tsx", {
  "react/jsx-runtime": jsxRuntime,
  "next/link": { default: Link },
  "lucide-react": { ArrowRight },
  "@/lib/public/harvest": harvest,
  "@/lib/types": {},
});

/* ---------------- Logic tháng ---------------- */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

assert.ok(same(harvest.monthsCovered({ start_month: 2, end_month: 5 }), [2, 3, 4, 5]), "A window inside one year covers each month");
assert.ok(same(harvest.monthsCovered({ start_month: 11, end_month: 1 }), [11, 12, 1]), "A window that crosses the new year wraps around");
assert.ok(same(harvest.monthsCovered({ start_month: 6, end_month: 6 }), [6]), "A single-month window covers one month");
assert.ok(same(harvest.monthsCovered({ start_month: 0, end_month: 5 }), []), "Invalid months produce no coverage");

assert.equal(harvest.buildMonthStates([]).length, 12, "The chart always has 12 months");
assert.ok(
  same(harvest.buildMonthStates([{ label: "Main", start_month: 2, end_month: 5 }]), ["none", "harvest", "harvest", "harvest", "harvest", "none", "none", "none", "none", "none", "none", "none"]),
  "A normal window marks the right months",
);
assert.ok(
  same(
    harvest.buildMonthStates([
      { label: "Main", start_month: 11, end_month: 1, peak: true },
      { label: "Second", start_month: 1, end_month: 3 },
    ]),
    ["peak", "harvest", "harvest", "none", "none", "none", "none", "none", "none", "none", "peak", "peak"],
  ),
  "A peak window wins over a normal window on overlapping months",
);

assert.equal(harvest.harvestHeadline([{ label: "Main", start_month: 2, end_month: 5 }]), "February to May");
assert.equal(
  harvest.harvestHeadline([
    { label: "Second", start_month: 8, end_month: 9 },
    { label: "Main", start_month: 2, end_month: 5 },
  ]),
  "February to May, then August to September",
  "Windows are listed in calendar order regardless of input order",
);
assert.equal(harvest.harvestHeadline([{ label: "All year", start_month: 1, end_month: 12 }]), "Harvested all year");

/* ---------------- Chuẩn hóa dữ liệu ---------------- */

assert.equal(harvest.normalizeHarvest(null), null, "No data means no block");
assert.equal(harvest.normalizeHarvest({ windows: [] }), null, "An empty list hides the block instead of drawing an empty chart");
assert.equal(harvest.normalizeHarvest({ windows: [{ label: "Bad", start_month: 13, end_month: 2 }] }), null, "Out-of-range months are dropped");

const normalized = harvest.normalizeHarvest({
  windows: [{ label: "Main", start_month: 2, end_month: 5, regions: "Binh Phuoc, Dong Nai", peak: true }],
  note_i18n: { en: "A note." },
  reviewed_on: "2026-10-24",
});
assert.equal(normalized.windows[0].regions.length, 2, "Regions given as a comma string become a list");
assert.equal(normalized.windows[0].peak, true, "Peak survives normalization");
assert.equal(normalized.reviewed_on, "2026-10-24", "A valid review date is kept");
assert.equal(harvest.normalizeHarvest({ windows: [{ label: "Main", start_month: 2, end_month: 5 }], reviewed_on: "24/10" }).reviewed_on, null, "A malformed review date becomes empty instead of leaking to the page");

/* ---------------- Render ---------------- */

const cashew = {
  windows: [
    { id: "main", label: "Main crop", start_month: 2, end_month: 5, regions: ["Binh Phuoc", "Dong Nai"], peak: true },
  ],
  note_i18n: { en: "Plants process kernels all year." },
  reviewed_on: null,
};

const html = renderToStaticMarkup(
  React.createElement(section.HarvestCalendarSection, {
    categoryName: "Cashew",
    harvest: cashew,
    note: "Plants process kernels all year.",
  }),
);

assert.ok(!/<img/i.test(html), "The chart is HTML and CSS, not an image");
assert.ok(html.includes('role="img"'), "The chart exposes a single label to assistive tech");
assert.ok(html.includes("February to May"), "The chart states the season in words");
assert.ok(html.includes("sr-only"), "A screen-reader description accompanies the bars");
assert.ok(html.includes("Binh Phuoc, Dong Nai"), "Regions reach the page");
assert.ok(html.includes("Review date not set"), "An unreviewed calendar says so instead of pretending to be verified");
assert.ok(html.includes("when the crop is harvested, not when it ships"), "The block explains what the months mean");
assert.ok(!html.includes("/products/cashew/market"), "No link to the market page while that page does not exist");
for (const label of ["Jan", "Jun", "Dec"]) assert.ok(html.includes(`>${label}<`) || html.includes(label), `Month label ${label} is present`);

const reviewed = renderToStaticMarkup(
  React.createElement(section.HarvestCalendarSection, {
    categoryName: "Cashew",
    harvest: { ...cashew, reviewed_on: "2026-10-24" },
    note: "",
    marketHref: "/products/cashew/market",
  }),
);
assert.ok(reviewed.includes("Reviewed 24 Oct 2026"), "A reviewed calendar shows the date");
assert.ok(reviewed.includes('href="/products/cashew/market"'), "The optional link appears only when a target is passed");
assert.ok(!reviewed.includes("Plants process kernels all year"), "An empty note renders nothing");

assert.equal(
  renderToStaticMarkup(React.createElement(section.HarvestCalendarSection, { categoryName: "Cashew", harvest: { windows: [] } })),
  "",
  "An empty calendar renders nothing at all",
);

/* ---------------- Trang danh mục dùng đúng component, đúng chỗ ---------------- */

const page = readFileSync(new URL("../app/(public)/products/[slug]/page.tsx", import.meta.url), "utf8");
assert.ok(page.includes('import { HarvestCalendarSection } from "@/components/harvest-calendar"'), "The category page uses the shared chart");
assert.ok(page.includes("normalizeHarvest(cat.harvest)"), "The category page normalizes stored data before rendering");

const gridIndex = page.indexOf("<CategoryProductGrid");
const chartIndex = page.indexOf("<HarvestCalendarSection", gridIndex);
const specIndex = page.indexOf("<CategoryContentSections", gridIndex);
assert.ok(gridIndex > -1 && chartIndex > gridIndex, "The chart sits after the product grid");
assert.ok(chartIndex < specIndex, "The chart sits before the spec block");

console.log("✅ check-harvest-calendar: tháng vắt qua năm mới, chuẩn hóa dữ liệu, render HTML và vị trí sau lưới sản phẩm đều đạt");
