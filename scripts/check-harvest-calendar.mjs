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
const { parseHarvestInput } = compile("../lib/crm/harvest-input.ts", {
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

/* ---------------- Hình học đường cong và hai trục ---------------- */

const curve = harvest.buildHarvestChartGeometry(["none", "harvest", "peak", "peak", "harvest", "none", "none", "harvest", "peak", "none", "none", "none"]);
assert.equal(curve.points.length, 12, "The curve keeps one observed point for every month");
assert.equal(curve.points[0].x, curve.left, "January starts at the y-axis");
assert.equal(curve.points.at(-1).x, curve.right, "December ends at the right edge");
assert.equal(curve.points[0].y, curve.bottom, "Outside the season stays on the baseline");
assert.equal(curve.points[1].y, (curve.top + curve.bottom) / 2, "In season uses the middle activity level");
assert.equal(curve.points[2].y, curve.top, "Main harvest uses the highest activity level");
assert.ok(curve.path.startsWith("M ") && curve.path.includes(" C "), "Month points join with smooth cubic curves");
assert.ok(curve.areaPath.endsWith(" Z"), "The light area closes on the baseline");
assert.ok(curve.points.every((point) => point.y >= curve.top && point.y <= curve.bottom), "No observed point exceeds the three data levels");
assert.deepEqual(curve.ticks.map((tick) => tick.label), ["Main harvest", "In season", "Outside the season"], "The y-axis retains categorical season meanings");

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

const sourced = harvest.normalizeHarvest({
  windows: [{ label: "Main", start_month: 2, end_month: 5, peak: true }],
  reviewed_on: "2026-10-25",
  review_origin: "ai",
  sources: [
    { title: "Crop authority", url: "https://agriculture.example/season#harvest" },
    { title: "Duplicate", url: "https://agriculture.example/season" },
    { title: "Unsafe", url: "javascript:alert(1)" },
  ],
});
assert.equal(sourced.sources.length, 1, "Source normalization removes duplicates and unsafe URLs");
assert.equal(sourced.sources[0].url, "https://agriculture.example/season", "Source fragments are not stored");
assert.equal(sourced.review_origin, "ai", "Automatic review provenance survives normalization");

/* ---------------- Category editor save parsing ---------------- */

assert.equal(parseHarvestInput(undefined), undefined, "A missing harvest field leaves the stored value untouched");
assert.equal(parseHarvestInput(JSON.stringify({ windows: [], reviewed_on: null })), null, "An explicitly empty editor saves as null");
assert.equal(parseHarvestInput(JSON.stringify({ windows: [], note_i18n: { en: "Old note" }, reviewed_on: "2026-10-25" })), null, "Empty windows remove the whole calendar, including its old metadata");
assert.throws(() => parseHarvestInput(JSON.stringify({ windows: [{ label: "Bad", start_month: 13, end_month: 2 }] })), /ít nhất một cửa sổ/, "A nonempty invalid calendar is still rejected");
const manual = parseHarvestInput(JSON.stringify({
  windows: [{ label: "Main", start_month: 2, end_month: 5, peak: true }],
  sources: [{ title: "Old source", url: "https://agriculture.example/season" }],
  review_origin: "ai",
}));
assert.equal(manual.review_origin, "staff", "A manual save marks the calendar as staff-reviewed");
assert.equal(manual.sources, undefined, "A manual save cannot retain stale automatic-source provenance");

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

assert.ok(!/<img/i.test(html), "The chart is inline SVG, not an image");
assert.ok(html.includes("<svg") && html.includes('viewBox="0 0 840 250"'), "The curve renders in a responsive SVG frame");
assert.ok(html.includes(" C "), "The rendered line uses smooth curve segments");
assert.equal((html.match(/<circle/g) ?? []).length, 12, "The SVG shows twelve monthly data points");
assert.ok(html.includes('role="img"'), "The chart exposes a single label to assistive tech");
for (const label of ["Harvest activity", "Month", "Main harvest", "In season", "Outside the season"]) {
  assert.ok(html.includes(label), `The axes show ${label}`);
}
assert.ok(html.includes("overflow-x-auto") && html.includes("min-w-[720px]"), "Small screens scroll instead of shrinking the axis labels");
assert.ok(html.includes("Scroll to see all months"), "Mobile visitors receive a scroll cue");
assert.ok(html.includes("February to May"), "The chart states the season in words");
assert.ok(html.includes("sr-only"), "A screen-reader description accompanies the chart");
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

const sourcedHtml = renderToStaticMarkup(
  React.createElement(section.HarvestCalendarSection, {
    categoryName: "Pepper",
    harvest: sourced,
    note: "",
  }),
);
assert.ok(sourcedHtml.includes("Sources for this update"), "The public calendar lists its sources");
assert.ok(sourcedHtml.includes('href="https://agriculture.example/season"'), "The source URL is linked directly");
assert.ok(sourcedHtml.includes('rel="noopener noreferrer"'), "External source links use safe rel values");
assert.ok(sourcedHtml.includes("Sources checked 25 Oct 2026"), "Automatic source verification has a clear review label");
assert.ok(!sourcedHtml.includes("javascript:alert"), "Unsafe source URLs never reach the page");

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

/* ---------------- Nhắc rà soát mùa vụ trong CRM ---------------- */

const TODAY = "2026-10-23";
const oneWindow = (reviewed) => ({ windows: [{ label: "Main", start_month: 2, end_month: 5 }], reviewed_on: reviewed });

assert.equal(harvest.harvestReviewState(null, TODAY), "missing", "A calendar with no review date is flagged");
assert.equal(harvest.harvestReviewState("", TODAY), "missing", "An empty review date is flagged");
assert.equal(harvest.harvestReviewState("2026-10-23", TODAY), "current", "A review dated today is current");
assert.equal(harvest.harvestReviewState("2025-10-24", TODAY), "current", "One day short of 12 months is still current");
assert.equal(harvest.harvestReviewState("2025-10-23", TODAY), "stale", "Exactly 12 months old counts as stale");
assert.equal(harvest.harvestReviewState("2024-10-24", TODAY), "stale", "Two years old counts as stale");
assert.equal(harvest.harvestReviewState("2026-10-24", TODAY), "current", "A review dated tomorrow is timezone skew, not an error");
assert.equal(harvest.harvestReviewState("2026-10-30", TODAY), "current", "A week ahead is still inside the tolerance");
assert.equal(harvest.harvestReviewState("2026-10-31", TODAY), "missing", "Past the tolerance, a future date is treated as a typo");
assert.equal(harvest.harvestReviewState("2027-01-01", TODAY), "missing", "A wrong year is a typo, not a fresh review");
assert.equal(harvest.harvestReviewState("not-a-date", TODAY), "missing", "An unparsable date is treated as missing");

assert.equal(harvest.addMonths("2024-01-31", 1), "2024-02-29", "Month maths clamps to the end of February in a leap year");
assert.equal(harvest.addMonths("2025-01-31", 1), "2025-02-28", "Month maths clamps to the end of February otherwise");
assert.equal(harvest.addMonths("2025-11-15", 12), "2026-11-15", "Twelve months lands on the same day");
assert.equal(harvest.addMonths("2025-10-14", 12), "2026-10-14", "Calendar totals stay in October");

assert.equal(harvest.monthsSinceReview("2025-10-23", TODAY), 12, "A full year reads as 12 months");
assert.equal(harvest.monthsSinceReview("2026-09-24", TODAY), 0, "A partial month rounds down");

const queue = harvest.harvestReviewQueue([
  { id: "a", slug: "cashew", name_i18n: { en: "Cashew" }, harvest: oneWindow("2024-01-01") },
  { id: "b", slug: "pepper", name_i18n: { en: "Pepper" }, harvest: oneWindow("2026-10-01") },
  { id: "c", slug: "rice", name_i18n: { en: "Rice" }, harvest: oneWindow(null) },
  { id: "d", slug: "nothing", name_i18n: { en: "Nothing" }, harvest: null },
  { id: "e", slug: "empty", name_i18n: { en: "Empty" }, harvest: { windows: [] } },
], TODAY);

assert.equal(queue.length, 2, "Only categories that have a calendar and a bad date are listed");
assert.deepEqual(queue.map((e) => e.slug), ["cashew", "rice"], "Oldest first, then the categories with no date");
assert.equal(queue[0].state, "stale", "The first entry is the stale one");
assert.equal(queue[1].state, "missing", "The second entry has no review date");
assert.equal(queue[1].reviewed_on, null, "A missing review date stays null");
assert.ok(queue[0].months_since_review > 12, "The stale entry reports how many months have passed");
assert.equal(
  harvest.harvestReviewQueue([{ id: "x", slug: "star-anise", harvest: oneWindow(null) }], TODAY)[0].name,
  "star-anise",
  "A category without an English name falls back to its slug",
);
assert.deepEqual(
  harvest.harvestReviewQueue([
    { id: "1", slug: "b", name_i18n: { en: "Beta" }, harvest: oneWindow(null) },
    { id: "2", slug: "a", name_i18n: { en: "Alpha" }, harvest: oneWindow(null) },
  ], TODAY).map((e) => e.name),
  ["Alpha", "Beta"],
  "Categories with no date are listed alphabetically",
);
assert.equal(harvest.harvestReviewQueue(null, TODAY).length, 0, "No categories means no reminder");

/* ---------------- Nối vào trang danh mục của CRM ---------------- */

const crmPage = readFileSync(new URL("../app/crm/categories/page.tsx", import.meta.url), "utf8");
assert.ok(crmPage.includes("harvestReviewQueue(categories"), "The CRM list computes the reminder on the server");
assert.ok(crmPage.includes("harvestReview={harvestReview}"), "The reminder is passed to the list component");
assert.ok(crmPage.includes("Asia/Ho_Chi_Minh"), "The review date is compared in Vietnam time, not server time");

const manager = readFileSync(new URL("../app/crm/categories/categories-manager.tsx", import.meta.url), "utf8");
assert.ok(manager.includes('openEditor(item.id, "harvest")'), "Each reminder opens the harvest tab directly");
assert.ok(manager.includes("quá 12 tháng"), "The reminder states the threshold it uses");

console.log("✅ check-harvest-calendar: tháng vắt qua năm mới, chuẩn hóa dữ liệu, render HTML, vị trí sau lưới sản phẩm và nhắc rà soát trong CRM đều đạt");
