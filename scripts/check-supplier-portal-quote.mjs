import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
function load(file, mocks) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, Date, Number, console, require(id) { assert.ok(id in mocks, `Unexpected ${id}`); return mocks[id]; } });
  return mod.exports;
}
const quote = load("lib/supplier-portal/quote.ts", {
  "@/lib/public/product-selection": { withoutDirectContacts: (s) => String(s).replace(/[\w.+-]+@[\w.-]+|\+?\d[\d ]{7,}/g, "[redacted]") },
  "@/lib/rfq/channel": load("lib/rfq/channel.ts", {}),
});
const form = (o) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const good = { price: "6,25", currency: "usd", unit: "kg", incoterm: "fob", lead_time_days: "21", valid_until: "", note: "Carton 10kg" };
const now = new Date("2026-11-05T00:00:00Z");

// Kiểm tra dữ liệu form
const ok = quote.parseSupplierQuote(form(good), now);
assert.equal(ok.ok, true);
assert.equal(ok.value.price, 6.25);
assert.equal(ok.value.currency, "USD");
assert.equal(ok.value.incoterm, "FOB");
for (const [patch, error] of [
  [{ price: "0" }, "price"], [{ price: "-1" }, "price"], [{ price: "1.23456" }, "price"], [{ price: "abc" }, "price"],
  [{ currency: "JPY" }, "currency"], [{ unit: "" }, "unit"], [{ unit: "call 0912345678" }, "unit"],
  [{ incoterm: "XYZ" }, "incoterm"], [{ lead_time_days: "0" }, "leadTime"], [{ lead_time_days: "2.5" }, "leadTime"],
  [{ valid_until: "2026-11-01" }, "validUntil"], [{ valid_until: "2028-01-01" }, "validUntil"], [{ note: "x".repeat(1001) }, "note"],
]) assert.equal(quote.parseSupplierQuote(form({ ...good, ...patch }), now).error, error, JSON.stringify(patch));
assert.equal(quote.parseSupplierQuote(form({ intent: "decline", note: "" }), now).value.intent, "decline", "decline needs no price");

// Ghi báo giá
const rfqs = { r1: { id: "r1", code: "RFQ-1", status: "matching", source_page: "/rfq", specs: {} } };
const matches = {
  m1: { id: "m1", rfq_id: "r1", supplier_id: "s1", status: "sent_to_supplier", sent_to_supplier_at: "2026-11-01", supplier_replied_at: null, quote_price: null, sent_to_buyer_at: null },
  other: { id: "other", rfq_id: "r1", supplier_id: "s2", status: "sent_to_supplier", sent_to_supplier_at: "2026-11-01", quote_price: null },
};
const messages = [], audit = [];
const store = {
  getRfqMatch: async (id) => matches[id] ?? null,
  getRfq: async (id) => rfqs[id] ?? null,
  updateRfqMatch: async (id, patch) => Object.assign(matches[id], patch),
  addMessage: async (m) => messages.push(m),
  addAuditLog: async (e) => audit.push(e),
};
const record = (matchId, value, supplierId = "s1") => quote.recordSupplierPortalQuote({ store, supplier: { id: supplierId, email: "s1@example.com" }, actorEmail: "s1@example.com", matchId, quote: value });

await assert.rejects(record("other", ok.value), /notFound/, "cannot quote another supplier's invitation");
await assert.rejects(record("missing", ok.value), /notFound/);
assert.equal(matches.other.status, "sent_to_supplier");
const generalResult = await record("m1", ok.value);
assert.equal(generalResult.direct, false, "RFQ chung (Tìm nguồn): Vexim xem lại trước khi trình người mua");
assert.equal(matches.m1.status, "quoted");
assert.equal(matches.m1.quote_price, 6.25);
assert.equal(matches.m1.quote_lead_time_days, 21);
assert.ok(matches.m1.supplier_replied_at, "portal quote counts as a reply");
assert.equal(rfqs.r1.status, "matching", "portal quote never changes the RFQ status or contacts the buyer");
assert.equal(messages.at(-1).rfq_match_id, "m1");
assert.match(messages.at(-1).body_text, /6\.25 USD \/ kg[\s\S]*Carton 10kg/);
assert.equal(audit.at(-1).action, "supplier_portal.quote");

// Sửa báo giá trước khi Vexim trình người mua; khoá sau khi đã trình hoặc RFQ đóng
await record("m1", { ...ok.value, price: 6.1 });
assert.equal(matches.m1.quote_price, 6.1);
matches.m1.sent_to_buyer_at = "2026-11-03"; matches.m1.status = "presented_to_buyer";
await assert.rejects(record("m1", { ...ok.value, price: 1 }), /closed/);
assert.equal(matches.m1.quote_price, 6.1, "presented quote cannot be changed");
Object.assign(matches.m1, { sent_to_buyer_at: null, status: "sent_to_supplier" });
for (const status of ["won", "lost", "spam"]) {
  rfqs.r1.status = status;
  await assert.rejects(record("m1", ok.value), /closed/, status);
}
rfqs.r1.status = "matching";
rfqs.r1.specs = { inquiry_kind: "supplier_question" };
await assert.rejects(record("m1", ok.value), /notFound/, "direct questions have no quote flow");
rfqs.r1.specs = {};
matches.m1.sent_to_supplier_at = null;
await assert.rejects(record("m1", ok.value), /notFound/, "unsent invitation is not visible");
matches.m1.sent_to_supplier_at = "2026-11-01";

// RFQ trực tiếp (người mua chọn đúng nhà cung cấp này): nơi gọi tự trình báo giá cho người mua.
Object.assign(rfqs.r1, { preferred_supplier_ids: ["s1"], source_product_id: "p1" });
assert.equal((await record("m1", { ...ok.value, price: 6.2 })).direct, true);
Object.assign(rfqs.r1, { preferred_supplier_ids: [], source_product_id: null });

// Từ chối
await record("m1", { intent: "decline", note: "Hết hàng" });
assert.equal(matches.m1.status, "declined");
assert.match(messages.at(-1).body_text, /không tham gia[\s\S]*Hết hàng/);
await assert.rejects(record("m1", ok.value), /closed/, "declined invitation is closed");

// Giao diện: form chỉ là client component, quyền nằm ở server action
const action = read("app/supplier/portal/rfqs/quote-actions.ts");
assert.match(action, /^"use server"/);
assert.match(action, /supplierPortalAccess\(\)/);
assert.match(action, /portalApproved\(access\.supplier\)/);
assert.match(read("app/supplier/portal/rfqs/quote-form.tsx"), /^"use client"/);
assert.match(action, /result\.intent === "quote" && result\.direct[\s\S]*presentShortlistToBuyer/, "chỉ RFQ trực tiếp mới tự gửi người mua");
assert.match(action, /catch \(error\)[\s\S]*buyer delivery failed/, "gửi người mua lỗi không làm mất báo giá đã lưu");
assert.match(read("app/supplier/portal/rfqs/page.tsx"), /<SupplierQuoteForm/);
console.log("✅ Supplier portal quote: validation, ownership, revise-before-presentation lock, decline, timeline and audit; RFQ status untouched.");
