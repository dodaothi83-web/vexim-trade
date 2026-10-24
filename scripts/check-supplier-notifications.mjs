// node scripts/check-supplier-notifications.mjs — recipient isolation, escaped review notes, distinct review/publication.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const messages = [];
let status = 'sent';
const sid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const linked = { supplier_id: sid, role: 'supplier', is_active: true, email: 'OWNER@example.com' };
const users = [linked, { ...linked, supplier_id: 'other', email: 'other@example.com' },
  { ...linked, is_active: false, email: 'inactive@example.com' },
  { role: 'admin', is_active: true, email: 'admin@example.com' },
  { role: 'sourcing', is_active: true, email: 'sourcing@example.com' },
  { role: 'viewer', is_active: true, email: 'viewer@example.com' }];
const mocks = {
  '@/lib/db': { getStore: () => ({ listUsers: async () => users }) },
  '@/lib/email/send': { transport: async (mail) => { messages.push(mail); return status === 'failed'
    ? { ok: false, status, error: 'mail failed' } : { ok: true, status }; } },
  '@/lib/email/templates': { escapeHtml: (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    wrapPlainEmail: ({ title, body }) => `<h1>${title}</h1>${body}` },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
};
const code = ts.transpileModule(readFileSync(new URL('../lib/supplier-portal/notify.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, process, console, URL, Set,
  require: (id) => { if (id === 'server-only') return {}; assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id]; },
});
const supplier = { id: sid, name: 'Factory <A>' };
const product = { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Cashew <W320>' };
assert.equal(await exports.notifyStaffProductSubmission(supplier, product), 'sent');
assert.equal(JSON.stringify(messages[0].to), JSON.stringify(['admin@example.com', 'sourcing@example.com']));
assert.ok(messages[0].html.includes('Cashew &lt;W320&gt;'));
assert.ok(messages[0].html.includes('Sản phẩm chưa được đăng'));
assert.equal(await exports.notifySupplierDecision({ supplierId: sid, decision: 'onboarding_changes_requested', note: 'Bổ sung <giấy phép>' }), 'sent');
assert.equal(JSON.stringify(messages[1].to), JSON.stringify(['owner@example.com']));
assert.ok(messages[1].html.includes('Bổ sung &lt;giấy phép&gt;'));
assert.ok(!messages[1].html.includes('other@example.com'));
assert.equal(await exports.notifySupplierDecision({ supplierId: sid, decision: 'certificate_approved', name: 'ISO' }), 'sent');
assert.ok(messages.at(-1).html.includes('chưa được công bố'));
assert.equal(await exports.notifySupplierDecision({ supplierId: sid, decision: 'certificate_published', name: 'ISO' }), 'sent');
assert.ok(messages.at(-1).html.includes('nếu sản phẩm công khai'));
assert.equal(await exports.notifySupplierDecision({ supplierId: sid, decision: 'product_approved', name: 'Cashew', note: 'PRIVATE STAFF ONLY' }), 'sent');
assert.ok(!messages.at(-1).html.includes('PRIVATE STAFF ONLY'), 'Approval notes are not sent to suppliers');
assert.ok(messages.at(-1).html.includes('đã được đăng') && messages.at(-1).html.includes('hiển thị cho buyer'), 'Approval notice tells the supplier the product is live');
assert.ok(!messages.at(-1).html.includes('chưa tự động sẵn sàng'), 'Approval notice no longer describes a separate unpublished step');
status = 'failed';
assert.equal(await exports.notifySupplierDecision({ supplierId: sid, decision: 'verification_returned', note: 'Bổ sung ảnh' }), 'failed');
users.splice(users.indexOf(linked), 1);
assert.equal(await exports.notifySupplierDecision({ supplierId: sid, decision: 'onboarding_approved' }), 'failed');
assert.equal(messages.length, 6, 'No email can go to a foreign or inactive user');
console.log('✅ Supplier notices: staff and linked supplier recipients, escaped feedback, approval-to-marketplace notice.');
