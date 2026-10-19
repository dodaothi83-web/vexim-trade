// node scripts/check-rfq-targeted-supplier.mjs — RFQ gửi từ trang sản phẩm hoặc trang NCC:
// tự tạo lượt khớp đề xuất cho NCC buyer chỉ định, CRM thấy rõ chỉ định này, trang chi tiết
// NCC liệt kê các RFQ đã khớp, form RFQ chung thông báo Vexim hỗ trợ tìm NCC phù hợp.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const realRequire = createRequire(import.meta.url);
function load(file, mocks) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, console, Date, process, JSON, Object, Array, String, Boolean, Promise, Error, RegExp, Map, Set,
    require: (id) => {
      if (id === 'node:crypto') return realRequire('node:crypto');
      assert.ok(id in mocks, `${file}: unexpected import ${id}`);
      return mocks[id];
    },
  }, { filename: file });
  return mod.exports;
}

const { createPreferredSupplierMatches } = load('../lib/rfq/auto-match.ts', { '@/lib/types': {} });

function makeStore(existing = []) {
  const matches = [...existing];
  return {
    matches,
    async listRfqMatches(rfqId) { return matches.filter((m) => m.rfq_id === rfqId); },
    async createRfqMatch(input) { const row = { ...input }; matches.push(row); return row; },
  };
}

// Tạo lượt khớp đề xuất cho đúng NCC chỉ định, khử trùng lặp trong danh sách đầu vào.
{
  const store = makeStore();
  const created = await createPreferredSupplierMatches(store, 'rfq-1', ['sup-a', 'sup-b', 'sup-a', ' ']);
  assert.equal(created, 2);
  assert.deepEqual(store.matches.map((m) => m.supplier_id), ['sup-a', 'sup-b']);
  assert.ok(store.matches.every((m) => m.status === 'proposed' && m.rfq_id === 'rfq-1' && m.id),
    'lượt khớp tự tạo phải ở trạng thái đề xuất, chờ nhân viên gửi');
}

// Không tạo trùng khi NCC đã có lượt khớp; không có NCC chỉ định thì không tạo gì.
{
  const store = makeStore([{ rfq_id: 'rfq-1', supplier_id: 'sup-a' }]);
  assert.equal(await createPreferredSupplierMatches(store, 'rfq-1', ['sup-a', 'sup-b']), 1);
  assert.equal(await createPreferredSupplierMatches(store, 'rfq-1', []), 0);
  assert.equal(await createPreferredSupplierMatches(store, '', ['sup-a']), 0);
}

// Luồng gửi RFQ: chỉ RFQ bình thường mới tự khớp, spam và cần duyệt tay thì chờ nhân viên.
const submit = fs.readFileSync(new URL('../lib/rfq/submit.ts', import.meta.url), 'utf8');
assert.match(submit, /createPreferredSupplierMatches\(store, rfq\.id, preferredIds\)/, 'submit RFQ phải tự tạo lượt khớp cho NCC chỉ định');
assert.match(submit, /rfqStatus === "new" && preferredIds\.length > 0/, 'không tự khớp khi RFQ bị cách ly hoặc cần duyệt tay');

// Trang RFQ trong CRM phải cho nhân viên thấy chỉ định của buyer.
const rfqPage = fs.readFileSync(new URL('../app/crm/rfqs/[id]/page.tsx', import.meta.url), 'utf8');
assert.match(rfqPage, /Buyer chỉ định nhà cung cấp/, 'trang RFQ phải có hộp thông tin NCC buyer chỉ định');
assert.match(rfqPage, /preferred_supplier_ids/, 'trang RFQ phải đọc danh sách NCC chỉ định từ RFQ');
assert.match(rfqPage, />Buyer chỉ định</, 'lượt khớp của NCC chỉ định phải có nhãn riêng');

// Trang chi tiết NCC liệt kê các RFQ đã khớp kèm trạng thái xử lý.
const supplierPage = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/page.tsx', import.meta.url), 'utf8');
assert.match(supplierPage, /RFQ đã gửi cho NCC này/, 'trang chi tiết NCC phải có mục RFQ đã gửi');
assert.match(supplierPage, /listRfqMatchesBySupplier/, 'mục RFQ phải lấy lượt khớp theo NCC');
assert.match(supplierPage, /Đã khớp, chờ gửi/, 'phải phân biệt RFQ đã khớp nhưng chưa gửi');

// Form RFQ công khai: có NCC chỉ định thì nói rõ gửi cho ai; form chung thì báo Vexim tìm NCC.
const form = fs.readFileSync(new URL('../app/(public)/rfq/rfq-form.tsx', import.meta.url), 'utf8');
assert.match(form, /You are requesting a quote from/, 'form phải nói rõ NCC buyer đang xin báo giá');
assert.match(form, /Vexim will match it with\s+suitable Vietnamese suppliers/, 'form chung phải thông báo Vexim hỗ trợ tìm NCC phù hợp');
const rfqPublicPage = fs.readFileSync(new URL('../app/(public)/rfq/page.tsx', import.meta.url), 'utf8');
assert.match(rfqPublicPage, /initialSuppliers/, 'trang RFQ phải truyền tên NCC chỉ định xuống form');

console.log('✅ RFQ targeted supplier: auto proposed matches, CRM preference labels, supplier RFQ list, public form notices.');
