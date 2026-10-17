// node scripts/check-verification-media-scope.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const rows = [
  { id: 'shared', owner_type: 'supplier', supplier_id: 'sup-1', product_id: null, verification_id: null, sort_order: 0, created_at: '2026-01-01' },
  { id: 'product', owner_type: 'product', supplier_id: 'sup-1', product_id: 'prod-1', verification_id: null, sort_order: 0, created_at: '2026-01-02' },
  { id: 'docs', owner_type: 'verification', supplier_id: 'sup-1', product_id: null, verification_id: 'review-1', sort_order: 0, created_at: '2026-01-03' },
  { id: 'factory', owner_type: 'verification', supplier_id: 'sup-1', product_id: null, verification_id: 'review-2', sort_order: 0, created_at: '2026-01-04' },
];
function extract(file) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = source.indexOf('  async listMedia(ownerType: MediaOwnerType, ownerId: string) {');
  const end = source.indexOf('  async listMediaForProducts(', start);
  assert.ok(start >= 0 && end > start, `Missing listMedia in ${file}`);
  return source.slice(start, end);
}
function compile(method, env) {
  const code = ts.transpileModule(`exports.store = { ${method} };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, ...env });
  return exports.store;
}
const local = compile(extract('../lib/db/local.ts'), { load: () => ({ media: rows }) });
const must = () => ({ from: () => {
  const filters = [];
  const q = {
    select: () => q,
    eq: (key, value) => { filters.push([key, value]); return q; },
    order: () => q,
    then: (resolve, reject) => Promise.resolve({ data: rows.filter((row) => filters.every(([key, value]) => row[key] === value)), error: null }).then(resolve, reject),
  };
  return q;
} });
const supabase = compile(extract('../lib/db/supabase.ts'), { must, fail: (_action, error) => { throw error; } });
for (const store of [local, supabase]) {
  assert.equal((await store.listMedia('supplier', 'sup-1')).map((m) => m.id).join(','), 'shared', 'Supplier library cannot show verification or product evidence');
  assert.equal((await store.listMedia('verification', 'review-1')).map((m) => m.id).join(','), 'docs', 'Audit reads only its own review evidence');
  assert.equal((await store.listMedia('product', 'prod-1')).map((m) => m.id).join(','), 'product');
}
const audit = readFileSync(new URL('../app/crm/suppliers/[slug]/audit/[step]/page.tsx', import.meta.url), 'utf8');
const supplier = readFileSync(new URL('../app/crm/suppliers/[slug]/page.tsx', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../app/api/verifications/[id]/ai-review/route.ts', import.meta.url), 'utf8');
const auditForm = readFileSync(new URL('../app/crm/suppliers/[slug]/audit/[step]/audit-form.tsx', import.meta.url), 'utf8');
assert.match(audit, /store\.listMedia\("verification", current\.id\)/);
assert.match(auditForm, /form\.set\("ownerType", "verification"\)/);
assert.match(auditForm, /Tệp kho chung NCC không tự chuyển vào đây/);
assert.match(supplier, /Kho ảnh & tài liệu chung của NCC/);
assert.match(ai, /store\.listMedia\("verification", id\)/);
console.log('✅ Supplier files, product media and each verification evidence set remain distinct in both stores and UI.');
