// No database credentials required: exercise the HTTP handler with an in-memory store.
// Run: node scripts/check-verification-start.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(
  fs.readFileSync(new URL('../app/api/suppliers/[id]/verifications/route.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const module = { exports: {} };
const rows = [];
let canInspect = true;
let level = 0;
let dbError = false;
const store = {
  getSupplier: async (id) => ['sup-1', 'sup-2'].includes(id) ? { id, verification_level: level } : null,
  listVerifications: async (id) => rows.filter((r) => r.supplier_id === id),
  createVerification: async (input) => {
    if (dbError) throw Error("Could not find the 'checklist_notes' column of 'verifications' in the schema cache");
    const row = { id: `review-${rows.length + 1}`, ...input };
    rows.push(row);
    return row;
  },
  addAuditLog: async () => null,
};
const mocks = {
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  'next/cache': { revalidatePath: () => {} },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { guard: async () => canInspect ? null : { message: 'Không có quyền' }, getSession: async () => ({ uid: '00000000-0000-4000-8000-000000000001', email: 'inspector@example.com' }) },
  '@/lib/verification': {
    auditStep: (level) => ({ 1: { title: 'Kiểm tra giấy tờ' }, 2: { title: 'Thăm nhà máy' }, 3: { title: 'Lịch sử giao hàng' } })[level],
    auditHref: (id, level) => `/crm/suppliers/${id}/audit/${({ 1: 'documents', 2: 'factory', 3: 'deliveries' })[level]}`,
    auditItems: (level) => Array.from({ length: ({ 1: 7, 2: 9, 3: 3 })[level] }, (_, n) => ({ key: `item_${level}_${n}` })),
  },
};
vm.runInNewContext(source, { module, exports: module.exports, require: (name) => {
  assert.ok(name in mocks, `Unexpected import ${name}`);
  return mocks[name];
}, console: { error: () => {} }, Response, Request }, { filename: 'verification-route.ts' });
const { POST } = module.exports;
async function post(id, targetLevel) {
  const res = await POST(new Request('http://localhost/api/suppliers/' + id + '/verifications', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetLevel }),
  }), { params: Promise.resolve({ id }) });
  return { status: res.status, data: await res.json() };
}

canInspect = false;
assert.equal((await post('sup-1', 1)).status, 403);
canInspect = true;
assert.equal((await post('sup-1', 4)).status, 400);
assert.equal((await post('unknown', 1)).status, 404);
assert.equal((await post('sup-1', 2)).status, 409);
assert.equal((await post('sup-1', 1)).status, 200);
assert.equal(Object.keys(rows[0].checklist).length, 7);
assert.equal(rows[0].status, 'in_progress');
const repeated = await post('sup-1', 1);
assert.equal(repeated.data.existing, true);
assert.equal(rows.length, 1, 'double-click must not create another L1 review');
rows[0].status = 'approved'; level = 1;
assert.equal((await post('sup-1', 2)).status, 200);
assert.equal(Object.keys(rows[1].checklist).length, 9);
assert.equal((await post('sup-1', 3)).status, 409);
rows[1].status = 'approved'; level = 2;
const delivery = await post('sup-1', 3);
assert.equal(delivery.status, 200);
assert.match(delivery.data.href, /audit\/deliveries$/);
assert.equal(Object.keys(rows[2].checklist).length, 3);
assert.equal((await post('sup-1', 3)).data.existing, true);
level = 0; dbError = true;
const failed = await post('sup-2', 1);
assert.equal(failed.status, 500);
assert.match(failed.data.message, /migration/);
const migration = fs.readFileSync(new URL('../supabase/migrations/20261017_verification_workflow.sql', import.meta.url), 'utf8');
for (const field of ['checklist_notes', 'visit_lat', 'visit_lng', 'visit_address', 'return_reason', 'verification_id']) {
  assert.ok(migration.includes(`add column if not exists ${field}`));
}
assert.ok(migration.includes("owner_type in ('product','supplier','verification')"));
assert.ok(migration.includes("audience = 'internal'"));
console.log('✅ Three audit steps: creation, duplicate guard, permissions, prerequisites and schema errors.');
