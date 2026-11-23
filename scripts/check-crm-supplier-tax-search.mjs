// node --experimental-strip-types --no-warnings scripts/check-crm-supplier-tax-search.mjs
// Danh sách nhà cung cấp CRM: tìm theo mã số thuế (MST) và gắn nhãn hồ sơ trùng MST.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  duplicateTaxIds, formatTaxId, taxIdDigits, taxIdKey, taxIdMatches, taxIdNeedle,
} from '../lib/crm/supplier-tax-id.ts';

// Chuẩn hoá: chỉ so dãy chữ số; chi nhánh dùng chung 10 số đầu với công ty mẹ.
assert.equal(taxIdDigits(' 0110.001.327 '), '0110001327');
assert.equal(taxIdKey('0110001327'), '0110001327');
assert.equal(taxIdKey('0110001327-001'), '0110001327', 'Chi nhánh cùng doanh nghiệp');
assert.equal(taxIdKey('12345'), null, 'MST quá ngắn không đủ căn cứ so trùng');
assert.equal(taxIdKey(null), null);
assert.equal(formatTaxId('0110001327001'), '0110001327-001');
assert.equal(formatTaxId('0110 001 327'), '0110001327');

// Từ khoá MST: số kèm dấu cách/chấm/gạch, tối thiểu 3 số. Tên có chữ thì không phải MST.
assert.equal(taxIdNeedle('0110 001 327'), '0110001327');
assert.equal(taxIdNeedle('0110-001'), '0110001');
assert.equal(taxIdNeedle('01'), null, 'Hai số quá ít, dễ khớp nhầm');
assert.equal(taxIdNeedle('Cashew 0110'), null);
assert.ok(taxIdMatches('0110001327', taxIdNeedle('0110 001 327')), 'Gõ có dấu cách vẫn tìm ra');
assert.ok(taxIdMatches('0110001327-001', taxIdNeedle('0110001327')), 'Gõ MST mẹ ra cả chi nhánh');
assert.ok(taxIdMatches('0110.001.327', taxIdNeedle('001327')), 'Gõ một đoạn MST vẫn tìm ra');
assert.ok(!taxIdMatches('0314831453', taxIdNeedle('0110001327')));
assert.ok(!taxIdMatches(null, taxIdNeedle('0110001327')));

const dup = duplicateTaxIds([
  { tax_id: '0110001327' }, { tax_id: '0110 001 327' }, { tax_id: '0110001327-002' },
  { tax_id: '0314831453' }, { tax_id: '' }, { tax_id: null }, { tax_id: '123' }, { tax_id: '123' },
]);
assert.deepEqual([...dup], [['0110001327', 3]], 'Chỉ giữ MST lặp lại; MST rỗng hoặc quá ngắn không tính');

// Bảng CRM: render thật với dữ liệu mẫu.
const req = createRequire(import.meta.url);
const jsx = req('react/jsx-runtime');
const taxModule = await import('../lib/crm/supplier-tax-id.ts');
const source = ts.transpileModule(readFileSync(new URL('../components/supplier-table.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const icon = () => React.createElement('svg');
const mocks = {
  react: React, 'react/jsx-runtime': jsx,
  'next/link': { default: ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children) },
  'lucide-react': { ArrowUpRight: icon, Crown: icon, MailWarning: icon, Package: icon, Plus: icon, Search: icon },
  '@/lib/supplier': { roleLabel: () => 'Xưởng', supplierTypeLabel: () => 'Nhà sản xuất', statusMeta: () => ({ label: 'Nháp', badge: '' }) },
  '@/components/ui': {
    Badge: ({ children }) => React.createElement('span', null, children),
    Button: ({ children }) => React.createElement('button', null, children),
    EmptyState: ({ title }) => React.createElement('div', null, title),
    cx: (...parts) => parts.filter(Boolean).join(' '),
  },
  '@/lib/supplier-plans': {
    SUPPLIER_PLAN_LABELS: { basic: 'Basic', premium: 'Premium', pro: 'Pro' },
    effectiveSupplierPlan: () => 'basic', isSupplierPlan: () => true,
  },
  '@/lib/crm/supplier-tax-id': taxModule,
};
const module = { exports: {} };
vm.runInNewContext(source, {
  module, exports: module.exports, console, Intl, Date, Number, Math, Object, Array, String, Map, Set,
  require(id) { assert.ok(id in mocks, `unexpected import ${id}`); return mocks[id]; },
});
const supplier = (id, name, tax_id) => ({
  id, name, tax_id, status: 'published', onboarding_status: 'approved', supplier_type: 'manufacturer', role: 'factory',
  province: 'Bình Phước', products: 'Hạt điều', contact_name: null, email: `${id}@example.com`, plan: 'basic',
});
const render = (suppliers) => renderToStaticMarkup(React.createElement(module.exports.SupplierTable, { suppliers, usage: {} }));

let html = render([
  supplier('a', 'Công ty A', '0110001327'),
  supplier('b', 'Công ty A chi nhánh', '0110001327-001'),
  supplier('c', 'Công ty C', '0314831453'),
  supplier('d', 'Công ty D', null),
]);
assert.match(html, /placeholder="Tìm xưởng, mã số thuế, mặt hàng, tỉnh, người liên hệ\.\.\."/);
assert.match(html, /MST <span[^>]*>0110001327<\/span>/, 'Mỗi dòng hiện MST');
assert.match(html, /0110001327-001/, 'Chi nhánh hiện đủ hậu tố');
assert.match(html, /Chưa có MST/, 'Thiếu MST được nêu rõ');
assert.equal((html.match(/Trùng MST · 2/g) ?? []).length, 2, 'Hai hồ sơ cùng MST đều có nhãn');
assert.match(html, />Trùng MST<span[^>]*>2<\/span>/, 'Có tab lọc Trùng MST kèm số lượng');

html = render([supplier('a', 'Công ty A', '0110001327'), supplier('c', 'Công ty C', '0314831453')]);
assert.doesNotMatch(html, /Trùng MST/, 'Không trùng thì không có nhãn hay tab');

const table = readFileSync(new URL('../components/supplier-table.tsx', import.meta.url), 'utf8');
assert.match(table, /taxIdMatches\(s\.tax_id, taxNeedle\)/, 'Ô tìm kiếm so MST theo dãy chữ số');
assert.match(table, /setQ\(taxKey\)/, 'Bấm nhãn trùng thì lọc đúng các hồ sơ cùng MST');

console.log('✅ CRM nhà cung cấp: tìm theo MST (bỏ qua dấu cách/chấm/gạch), nhãn và tab Trùng MST, gộp chi nhánh theo 10 số đầu.');
