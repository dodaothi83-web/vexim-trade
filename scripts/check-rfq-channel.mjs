// node --experimental-strip-types scripts/check-rfq-channel.mjs
// Sàn B2B: RFQ gửi tới một nhà cung cấp cụ thể đi thẳng; chỉ yêu cầu không chọn nhà cung cấp
// mới vào hộp thư Tìm nguồn để Vexim ghép. Yêu cầu tìm nguồn chuyển thành RFQ liên kết, không tạo trùng.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
function load(file, mocks) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, Date, Number, Set, console: { ...console, error() {} },
      require: (id) => { assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id]; } });
  return mod.exports;
}

const channel = load("lib/rfq/channel.ts", {});
const base = { source_page: "/rfq", specs: {}, preferred_supplier_ids: [], source_product_id: null };
assert.equal(channel.rfqChannel(base), "sourcing", "form /rfq chung không chọn nhà cung cấp → Tìm nguồn");
assert.equal(channel.rfqChannel({ ...base, source_product_id: "p1", preferred_supplier_ids: ["s1"] }), "direct", "từ trang sản phẩm → thẳng nhà cung cấp");
assert.equal(channel.rfqChannel({ ...base, preferred_supplier_ids: ["s1"] }), "direct", "từ trang nhà cung cấp → thẳng nhà cung cấp");
assert.equal(channel.rfqChannel({ ...base, source_page: "/rfq?intent=question", preferred_supplier_ids: ["s1"] }), "question");
assert.equal(channel.rfqChannel({ ...base, specs: { inquiry_kind: "supplier_question" } }), "question");
assert.equal(channel.rfqChannel({ ...base, specs: { sourcing_request_id: "req-1" }, preferred_supplier_ids: ["s1"] }), "sourcing",
  "RFQ tạo từ yêu cầu tìm nguồn vẫn thuộc Tìm nguồn kể cả sau khi thêm nhà cung cấp");
assert.equal(channel.rfqChannel({ ...base, preferred_supplier_ids: null }), "sourcing", "dữ liệu cũ thiếu mảng vẫn phân loại được");

const rfqLib = { generateAccessToken: () => crypto.randomBytes(8).toString("hex"), rfqDayKey: () => "20261105",
  generateRfqCode: (seq, day) => `RFQ-${day}-${String(seq).padStart(5, "0")}` };
const contact = load("lib/rfq/buyer-contact.ts", {});
const toRfq = load("lib/sourcing/to-rfq.ts", { "@/lib/rfq": rfqLib, "@/lib/rfq/channel": channel, "@/lib/rfq/buyer-contact": contact });
assert.equal(toRfq.sourcingSummary("\n  Need cashew W320\nDetails..."), "Need cashew W320");
assert.equal(toRfq.sourcingSummary("x".repeat(200)).length, 118);
assert.equal(toRfq.sourcingSummary("   "), "Yêu cầu tìm nguồn");

const rfqs = [{ id: "old", code: "RFQ-20261105-00003", specs: {} }];
const buyers = [], audits = [];
const store = {
  listRfqs: async () => rfqs,
  getBuyerByEmail: async (email) => buyers.find((b) => b.email === email) ?? null,
  getBuyerUserByEmail: async () => ({ company_name: "Acme Foods" }),
  createBuyer: async (input) => { const b = { ...input, id: `b${buyers.length + 1}` }; buyers.push(b); return b; },
  createRfq: async (input) => { const r = { ...input, id: `r${rfqs.length + 1}` }; rfqs.push(r); return r; },
  addAuditLog: async (entry) => audits.push(entry),
};
const request = { id: "req-1", buyer_email: "Buyer@Example.com ", content: "Need cashew W320\n10 MT to Rotterdam", attachments: [{ id: "f1" }], status: "new", assigned_to: null };
const actor = { id: "staff-1", email: "staff@example.com" };

const first = await toRfq.startSourcingMatch({ store, request, actor });
assert.equal(first.created, true);
assert.equal(first.rfq.code, "RFQ-20261105-00004", "mã RFQ nối tiếp, không trùng");
assert.equal(first.rfq.specs.sourcing_request_id, "req-1");
assert.equal(first.rfq.specs.notes, request.content, "nội dung gốc giữ nguyên để nhân viên đọc");
assert.equal(contact.rfqBuyerContact(first.rfq, 's1'), null, 'Old sourcing requests never gain consent by conversion');
assert.equal(first.rfq.product_text, "Need cashew W320");
assert.equal(first.rfq.status, "in_progress");
assert.equal(first.rfq.assigned_to, "staff-1", "người bấm ghép nhận việc khi yêu cầu chưa có người phụ trách");
assert.equal(first.rfq.preferred_supplier_ids.length, 0, "không tự chọn hay liên hệ nhà cung cấp nào");
assert.equal(channel.rfqChannel(first.rfq), "sourcing");
assert.equal(buyers.length, 1);
assert.equal(buyers[0].email, "buyer@example.com", "email người mua chuẩn hoá");
assert.equal(buyers[0].company, "Acme Foods");
assert.equal(buyers[0].hide_buyer_from_supplier, true, "cờ email CRM cũ không thay thế đồng ý chia sẻ riêng trên RFQ");
assert.equal(audits.at(-1).action, "sourcing.start_match");

const again = await toRfq.startSourcingMatch({ store, request, actor });
assert.equal(again.created, false, "bấm lại mở RFQ đã có, không tạo trùng");
assert.equal(again.rfq.id, first.rfq.id);
assert.equal(rfqs.length, 2);

const other = await toRfq.startSourcingMatch({ store, request: { ...request, id: "req-2", status: "in_progress", assigned_to: "staff-2" }, actor });
assert.equal(buyers.length, 1, "người mua đã có thì dùng lại");
assert.equal(other.rfq.assigned_to, "staff-2", "giữ người phụ trách đã có");
const consented = await toRfq.startSourcingMatch({ store, request: { ...request, id: 'req-consented',
  buyer_contact_consent_at: '2026-11-05T10:00:00Z',
  buyer_contact: { company: 'Buyer Co', contact_name: 'Jane', email: 'buyer@example.com', phone: '123', country: null, website: null, business_type: null } }, actor });
assert.equal(contact.rfqBuyerContact(consented.rfq, 's1'), null, 'Mediated sourcing never reveals buyer contact');
assert.equal(contact.sourcingInviteConsent(consented.rfq, 's1'), true);
await assert.rejects(toRfq.startSourcingMatch({ store, request: { ...request, id: "req-3", status: "closed" }, actor }), /closed/);

// Support may read direct RFQs, but staff cannot convert, release or manage them.
const staff = load('lib/rfq/staff-access.ts', { './channel': channel });
const supportStore = { getRfq: async (id) => ({ ...base, id, preferred_supplier_ids: id === 'direct' ? ['s1'] : [] }) };
await assert.rejects(staff.assertStaffMayProcessRfq(supportStore, 'direct'), /chỉ được xem/);
assert.equal((await staff.assertStaffMayProcessRfq(supportStore, 'sourcing')).id, 'sourcing');
assert.equal(fs.existsSync(new URL('../lib/rfq/release-after-review.ts', import.meta.url)), false,
  'No staff approval endpoint may turn a held direct RFQ into staff sourcing');

// Phân luồng trong giao diện và huy hiệu.
const layout = read("app/crm/layout.tsx");
assert.match(layout, /rfqChannel\(r\) === "sourcing" && UNCLAIMED_RFQ_STATUSES/, "huy hiệu Tìm nguồn đếm RFQ chung chưa tiếp nhận");
assert.match(layout, /rfqChannel\(r\) === "question" && UNCLAIMED_RFQ_STATUSES\.includes\(r\.status\)/, "RFQ đích danh không nằm trong hàng việc nhân viên; chỉ giữ câu hỏi cũ");
assert.match(read("app/crm/rfqs/page.tsx"), /rfqChannel\(r\) !== "sourcing"/, "hộp thư RFQ chỉ còn RFQ trực tiếp và câu hỏi");
const inbox = read("app/crm/sourcing/page.tsx");
assert.match(inbox, /rfqChannel\(r\) === "sourcing"/, "hộp thư Tìm nguồn có RFQ chung");
assert.match(inbox, /startSourcingMatchAction/);
const action = read("app/crm/sourcing/actions.ts");
assert.match(action, /startSourcingMatchAction[\s\S]*requirePagePermission\("rfq\.manage"/, "chỉ người có quyền xử lý RFQ mới ghép");

console.log("✅ RFQ channels: direct/question/sourcing routing, split badges, sourcing request → linked RFQ without duplicates or supplier contact.");
