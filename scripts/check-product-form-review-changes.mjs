// node scripts/check-product-form-review-changes.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const product = '11111111-1111-1111-1111-111111111111', submission = '22222222-2222-2222-2222-222222222222', actorId = '33333333-3333-3333-3333-333333333333';
let session = { uid: actorId, role: 'reviewer', email: 'reviewer@example.com' },
  actor = { id: actorId, role: 'reviewer', email: 'reviewer@example.com', is_active: true },
  result = { data: { status: 'changes_requested', already_decided: false }, error: null }, calls = [], audits = [], paths = [];
const mocks = { 'next/cache': { revalidatePath: (path) => paths.push(path) },
  '@/lib/auth/session': { getSession: async () => session },
  '@/lib/db/supabase': { getSupabaseClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return result; } }),
    supabaseStore: { getUser: async () => actor, addAuditLog: async (entry) => { audits.push(entry); } } } };
const exports = {};
const js = ts.transpileModule(readFileSync(new URL('../app/crm/products/product-form-review-actions.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(js, { exports, console: { error() {} }, Number, Date, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
} });
const act = exports.requestProductFormChangesAction;
const form = (values = {}) => { const f = new FormData(); for (const [key, value] of Object.entries({ product_id: product, submission_id: submission,
  product_updated_at: '2026-01-01T00:00:00Z', note: 'Sửa ảnh', ...values })) f.set(key, value); return f; };
assert.equal((await act(form({ note: ' ' }))).ok, false); assert.equal((await act(form({ product_id: 'bad' }))).ok, false);
session = { ...session, role: 'supplier' }; assert.equal((await act(form())).ok, false); assert.equal(calls.length, 0);
session = { ...session, role: 'reviewer' }; actor = { ...actor, is_active: false }; assert.equal((await act(form())).ok, false); assert.equal(calls.length, 0);
actor = { ...actor, is_active: true }; assert.equal((await act(form())).ok, true);
assert.equal(calls[0].name, 'request_product_form_changes'); assert.equal(calls[0].args.p_actor_id, actorId); assert.equal(audits.length, 1); assert.ok(paths.includes(`/supplier/portal/products/${product}`));
result = { data: { status: 'changes_requested', already_decided: true }, error: null }; assert.equal((await act(form())).ok, true); assert.equal(audits.length, 1, 'A retry must not duplicate the audit');
result = { data: { status: 'product_changed' }, error: null }; assert.match((await act(form())).message, /đã thay đổi/);
result = { data: null, error: { message: 'timeout' } }; assert.match((await act(form())).message, /Không xác nhận/);
console.log('Form review changes: staff authorization, decision CAS and idempotent audit passed');
