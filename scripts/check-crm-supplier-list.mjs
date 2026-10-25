// node scripts/check-crm-supplier-list.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path, mocks = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    module: mod,
    exports: mod.exports,
    require: (key) => {
      assert.ok(key in mocks, `Unexpected ${key} in ${path}`);
      return mocks[key];
    },
    console,
  }, { filename: path });
  return mod.exports;
}

const pipeline = load("../lib/pipeline.ts");
const list = load("../lib/crm/supplier-list.ts", { "@/lib/pipeline": pipeline });

const usage = list.buildSupplierOrderUsage([
  { supplier_id: "s-a", stage: "production" },
  { supplier_id: "s-a", stage: "completed" },
  { supplier_id: "s-a", stage: "lost" },
  { supplier_id: "s-b", stage: "quoted" },
  { supplier_id: null, stage: "lead" },
]);
assert.equal(usage["s-a"].total, 3, "Completed and lost orders still count toward the supplier total");
assert.equal(usage["s-a"].active, 1, "Only the open order remains active");
assert.equal(usage["s-b"].total, 1);
assert.equal(usage["s-b"].active, 1);
assert.equal(usage[""], undefined, "Unassigned buyers are not supplier orders");

const decisions = [
  { entity_id: "s-a", action: "supplier.portal_access_approved", created_at: "2026-01-10T01:00:00.000Z" },
  { entity_id: "s-a", action: "supplier.portal_access_approved", created_at: "2026-02-10T01:00:00.000Z" },
  { entity_id: "s-a", action: "supplier.profile_changes_requested", created_at: "2026-03-10T01:00:00.000Z" },
  { entity_id: "s-b", action: "supplier.profile_changes_requested", created_at: "2026-02-11T01:00:00.000Z" },
  { entity_id: "s-b", action: "supplier.portal_access_approved", created_at: "2026-02-12T01:00:00.000Z" },
  { entity_id: "s-c", action: "supplier.portal_access_approved", created_at: "2026-02-12T01:00:00.000Z" },
  { entity_id: "foreign", action: "supplier.portal_access_approved", created_at: "2026-02-12T01:00:00.000Z" },
];
const reviewedAt = list.buildSupplierReviewTimes([
  { id: "s-a", onboarding_status: "approved" },
  { id: "s-b", onboarding_status: "changes_requested" },
  { id: "s-c", onboarding_status: "pending" },
  { id: "s-d", onboarding_status: "approved" },
], decisions);
assert.equal(reviewedAt["s-a"], "2026-02-10T01:00:00.000Z", "Latest matching approval wins");
assert.equal(reviewedAt["s-b"], "2026-02-11T01:00:00.000Z", "Timestamp must match the current decision type");
assert.equal(reviewedAt["s-c"], undefined, "Resubmitted pending profile does not show an old review time");
assert.equal(reviewedAt["s-d"], undefined, "Missing audit history stays honestly unreported");
assert.equal(reviewedAt.foreign, undefined, "Another supplier's decision is never reused");

const table = fs.readFileSync(new URL("../components/supplier-table.tsx", import.meta.url), "utf8");
assert.match(table, /Tổng đơn hàng/);
assert.match(table, /Ngày giờ xét duyệt/);
assert.match(table, /u\.total\.toLocaleString\("vi-VN"\)/);
assert.match(table, /u\.active\.toLocaleString\("vi-VN"\)/);
assert.match(table, /timeZone: "Asia\/Ho_Chi_Minh"/);
assert.match(table, /Chưa ghi nhận/);
assert.match(table, /Chưa xét duyệt/);
assert.doesNotMatch(table, /s\.lead_time_days/, "Lead time is removed from this CRM table only");
assert.doesNotMatch(table, /\/ \{u\.total\} đơn/, "Total is not duplicated inside the active-order cell");

const page = fs.readFileSync(new URL("../app/crm/suppliers/page.tsx", import.meta.url), "utf8");
assert.match(page, /buildSupplierOrderUsage\(buyers\)/);
assert.match(page, /buildSupplierReviewTimes\(suppliers, reviewDecisions\)/);
assert.match(page, /listSupplierOnboardingDecisions\(\)\.catch/, "Audit read failure must not break the supplier list");

for (const path of ["../lib/db/supabase.ts", "../lib/db/local.ts"]) {
  const store = fs.readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(store, /listSupplierOnboardingDecisions/);
  assert.match(store, /supplier\.portal_access_approved/);
  assert.match(store, /supplier\.profile_changes_requested/);
}

console.log("✅ CRM supplier list: total and active orders, scoped review timestamps and honest empty states.");
