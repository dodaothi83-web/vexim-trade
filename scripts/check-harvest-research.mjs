#!/usr/bin/env node
// node --experimental-strip-types --no-warnings scripts/check-harvest-research.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

import * as harvest from "../lib/public/harvest.ts";

const require = createRequire(import.meta.url);
let fetchMock = async () => { throw new Error("Unexpected fetch"); };
const compile = (path, mocks) => {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (key) => {
      if (key.startsWith("node:")) return require(key);
      if (!(key in mocks)) throw new Error(`Unexpected import: ${key}`);
      return mocks[key];
    },
    process,
    console,
    Date,
    URL,
    Intl,
    AbortSignal,
    Buffer,
    TextDecoder,
    fetch: (...args) => fetchMock(...args),
  });
  return exports;
};

const readOutputText = (payload) => typeof payload.output_text === "string" ? payload.output_text : "";
const readSources = (payload) => Array.isArray(payload.citations) ? payload.citations : [];
const { researchHarvest } = compile("../lib/ai/harvest-research.ts", {
  "server-only": {},
  "@/lib/ai/company-introduction": { readOutputText, readSources },
  "@/lib/ai/site-signals": { readPublicHtml: async () => { throw new Error("A test must inject readSource"); } },
  "@/lib/public/harvest": harvest,
  "@/lib/types": {},
});
const runner = compile("../lib/ai/harvest-research-runner.ts", {
  "server-only": {},
  "@/lib/ai/harvest-research": { researchHarvest },
  "@/lib/db/types": {},
  "@/lib/public/harvest": harvest,
  "@/lib/types": {},
});
const siteSignals = compile("../lib/ai/site-signals.ts", {
  "server-only": {},
  "node:net": require("node:net"),
});

const category = { slug: "pepper", name_i18n: { en: "Pepper", vi: "Tiêu" } };
const sourceUrl = "https://agriculture.example/pepper-season";
const quote = "The main pepper harvest in Dak Lak runs from February to April.";
const validOutput = () => ({
  windows: [{
    label: "Main crop",
    start_month: 2,
    end_month: 4,
    peak: true,
    regions: ["Dak Lak"],
    note: "main pepper harvest in Dak Lak",
    evidence: [{ url: sourceUrl, quote }],
  }],
  conflicts: [],
});
const responsePayload = (output, citations = [{ url: sourceUrl, title: "Citation title" }]) => ({
  output_text: JSON.stringify(output),
  citations,
});
const runResearch = async ({ output = validOutput(), citations, pageText = `Before. ${quote} After.`, readSource } = {}) => {
  let requestBody;
  return researchHarvest(category, {
    apiKey: "test-key",
    model: "test-model",
    now: new Date("2026-10-24T18:00:00Z"),
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return { ok: true, json: async () => responsePayload(output, citations) };
    },
    readSource: readSource ?? (async () => ({ url: sourceUrl, title: "Actual page title", text: pageText })),
  }).then((result) => ({ result, requestBody }));
};

const valid = await runResearch();
assert.equal(valid.result.ok, true, "A cited, accessible, exact quote produces a verified calendar");
assert.equal(valid.requestBody.tools[0].type, "web_search_preview", "Research uses real web search");
assert.equal(valid.result.harvest.windows[0].start_month, 2);
assert.equal(valid.result.harvest.windows[0].end_month, 4);
assert.equal(valid.result.harvest.reviewed_on, "2026-10-25", "Review date uses Vietnam time");
assert.equal(valid.result.harvest.review_origin, "ai");
assert.equal(valid.result.harvest.sources[0].title, "Actual page title", "The source title comes from the fetched page");
assert.equal(valid.result.report.evidence_count, 1);
assert.equal(valid.result.report.source_urls[0], sourceUrl);

const vietnameseRegion = validOutput();
vietnameseRegion.windows[0].evidence[0].quote = "The main pepper harvest in Đắk Lắk runs from February to April.";
vietnameseRegion.windows[0].note = "main pepper harvest in Đắk Lắk";
{
  const { result } = await runResearch({ output: vietnameseRegion, pageText: vietnameseRegion.windows[0].evidence[0].quote });
  assert.equal(result.ok, true, "Vietnamese đ and unaccented d match when checking an explicitly quoted region");
}

for (const test of [
  { name: "inaccessible source", options: { readSource: async () => null }, code: "source_inaccessible" },
  { name: "quote mismatch", options: { pageText: "A different page without the requested evidence." }, code: "quote_mismatch" },
  { name: "uncited evidence", options: { citations: [{ url: "https://agriculture.example/another-page", title: "Other" }] }, code: "no_evidence" },
]) {
  const { result } = await runResearch(test.options);
  assert.equal(result.ok, false, `${test.name} does not produce a calendar`);
  assert.equal(result.code, test.code, `${test.name} has an actionable failure code`);
}

const missingMonths = validOutput();
missingMonths.windows[0].evidence[0].quote = "The main pepper harvest in Dak Lak is important.";
{
  const { result } = await runResearch({ output: missingMonths, pageText: missingMonths.windows[0].evidence[0].quote });
  assert.equal(result.ok, false);
  assert.equal(result.code, "quote_mismatch", "Exact text without explicit start and end months is insufficient");
}

const unsupportedMain = validOutput();
unsupportedMain.windows[0].evidence[0].quote = "Pepper in Dak Lak is harvested from February to April.";
{
  const { result } = await runResearch({ output: unsupportedMain, pageText: unsupportedMain.windows[0].evidence[0].quote });
  assert.equal(result.ok, false);
  assert.equal(result.code, "quote_mismatch", "A main-crop label cannot be inferred from months alone");
}

const forecast = validOutput();
forecast.windows[0].evidence[0].quote = "The main pepper harvest in Dak Lak is expected from February to April next season.";
forecast.windows[0].note = "";
{
  const { result } = await runResearch({ output: forecast, pageText: forecast.windows[0].evidence[0].quote });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_output", "A future-season forecast is not accepted as a recurring crop calendar");
}

const unsupportedNote = validOutput();
unsupportedNote.windows[0].note = "Prices will rise next season.";
{
  const { result } = await runResearch({ output: unsupportedNote });
  assert.equal(result.ok, false);
  assert.equal(result.code, "quote_mismatch", "Generated commentary or forecasts are not accepted as source-backed notes");
}

const invalidMonth = validOutput();
invalidMonth.windows[0].start_month = 13;
{
  const { result } = await runResearch({ output: invalidMonth });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_output", "Invalid months are rejected before source verification");
}

{
  const { result } = await runResearch({ output: { windows: [], conflicts: [] } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "no_evidence", "An empty research answer never clears an existing calendar");
}
{
  const { result } = await runResearch({ output: { windows: validOutput().windows, conflicts: ["Sources disagree"] } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "conflict", "Conflicting evidence blocks an automatic update");
}

/* ---------------- Guarded source reader ---------------- */

const responseAt = (url, body, init = {}) => {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", { value: url });
  return response;
};
{
  fetchMock = async () => responseAt(sourceUrl, `<html><head><title>Pepper &amp; harvest</title><style>.x{}</style></head><body><script>ignore()</script><p>${quote}</p></body></html>`, {
    status: 200, headers: { "content-type": "text/html; charset=utf-8" },
  });
  const page = await siteSignals.readPublicHtml(sourceUrl);
  assert.equal(page.title, "Pepper & harvest");
  assert.equal(page.url, sourceUrl);
  assert.ok(page.text.includes(quote) && !page.text.includes("ignore()"), "The reader returns visible source text, not script or style content");
}
{
  fetchMock = async () => responseAt(sourceUrl, "%PDF-1.7", { status: 200, headers: { "content-type": "application/pdf" } });
  assert.equal(await siteSignals.readPublicHtml(sourceUrl), null, "A PDF is not treated as verified HTML text");
}
{
  let calls = 0;
  fetchMock = async () => {
    calls += 1;
    return responseAt(sourceUrl, null, { status: 302, headers: { location: "http://169.254.169.254/latest" } });
  };
  assert.equal(await siteSignals.readPublicHtml(sourceUrl), null, "A redirect to a private address is blocked");
  assert.equal(calls, 1, "The private redirect target is never fetched");
}
{
  fetchMock = async () => { throw new Error("must not fetch"); };
  assert.equal(await siteSignals.readPublicHtml("http://127.0.0.1/private"), null, "A direct private URL is rejected");
}

/* ---------------- Writer and rotation ---------------- */

const oldCalendar = { windows: [{ label: "Old", start_month: 1, end_month: 2 }], reviewed_on: "2025-01-01" };
const newCalendar = { windows: [{ label: "Verified", start_month: 3, end_month: 5 }], reviewed_on: "2026-10-25", review_origin: "ai" };
const fullCategory = (id, slug, value = oldCalendar) => ({
  id, slug, name_i18n: { en: slug }, harvest: value, is_published: true,
});
function mockStore(initialCategory) {
  let current = initialCategory.harvest;
  const audits = [];
  const updates = [];
  const store = {
    listCategories: async () => [{ ...initialCategory, harvest: current }],
    listHarvestResearchRuns: async () => [],
    getCategory: async () => ({ ...initialCategory, harvest: current }),
    updateCategory: async (_id, patch) => {
      updates.push(patch);
      current = patch.harvest;
      return { ...initialCategory, harvest: current };
    },
    addAuditLog: async (entry) => {
      audits.push(entry);
      return { ...entry, id: audits.length, created_at: "2026-10-25T00:00:00Z" };
    },
  };
  return {
    store, audits, updates,
    get current() { return current; },
    set current(value) { current = value; },
  };
}

{
  const db = mockStore(fullCategory("1", "pepper"));
  const report = await runner.runHarvestResearchBatch({
    store: db.store,
    research: async () => ({ ok: true, harvest: newCalendar, report: { model: "test", source_urls: [sourceUrl], evidence_count: 1 } }),
  });
  assert.equal(report.updated, 1);
  assert.equal(db.current, newCalendar, "Validated research overwrites the one existing harvest field");
  assert.equal(db.audits[0].action, "category.harvest_research_updated");
  assert.equal(db.audits[0].before.harvest, oldCalendar);
}

{
  const db = mockStore(fullCategory("1", "pepper"));
  const report = await runner.runHarvestResearchBatch({
    store: db.store,
    research: async () => ({ ok: false, code: "source_inaccessible", message: "Cannot read source" }),
  });
  assert.equal(report.unchanged, 1);
  assert.equal(db.updates.length, 0, "Failed research never writes the category");
  assert.equal(db.current, oldCalendar, "Failed research preserves the old calendar");
  assert.equal(db.audits[0].action, "category.harvest_research_failed");
  assert.equal(db.audits[0].after.code, "source_inaccessible");
}

{
  const db = mockStore(fullCategory("1", "pepper"));
  const report = await runner.runHarvestResearchBatch({
    store: db.store,
    research: async () => {
      db.current = { windows: [{ label: "Staff edit", start_month: 6, end_month: 7 }] };
      return { ok: true, harvest: newCalendar, report: { model: "test", source_urls: [sourceUrl], evidence_count: 1 } };
    },
  });
  assert.equal(report.results[0].code, "concurrent_change");
  assert.equal(db.updates.length, 0, "A staff edit during research blocks the automatic overwrite");
  assert.equal(db.current.windows[0].label, "Staff edit");
}

const rotation = runner.selectHarvestResearchCategories(
  [fullCategory("a", "alpha"), fullCategory("b", "beta"), fullCategory("c", "charlie")],
  [
    { entity_id: "a", action: "category.harvest_research_updated", created_at: "2026-10-24T00:00:00Z" },
    { entity_id: "b", action: "category.harvest_research_failed", created_at: "2026-10-20T00:00:00Z" },
  ],
  2,
);
assert.deepEqual(rotation.map((item) => item.id), ["c", "b"], "Unscanned categories go first, then the oldest attempt, including failures");

const cronRoute = readFileSync(new URL("../app/api/cron/harvest-research/route.ts", import.meta.url), "utf8");
assert.ok(cronRoute.includes("Authorization: Bearer <CRON_SECRET>") && cronRoute.includes("isAuthorized"), "The cron route requires bearer authentication");
assert.ok(!cronRoute.includes("harvest_research"), "No parallel harvest_research column is introduced");

console.log("✅ check-harvest-research: source verification, failure preservation, direct update, conflict protection and category rotation đều đạt");
