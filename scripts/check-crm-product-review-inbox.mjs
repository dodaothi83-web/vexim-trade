// Read-only CRM inbox: role checks, pagination, private snapshot mapping and fail-closed behavior.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const product = '11111111-1111-4111-8111-111111111111';
const supplier = '22222222-2222-4222-8222-222222222222';
const image = '33333333-3333-4333-8333-333333333333';
const id = '44444444-4444-4444-8444-444444444444';
const row = { id, product_id: product, supplier_id: supplier, payload: { name: 'Synthetic', category: 'test', valid: true },
  image_selection: [{ source: 'staged', id: image }],
  image_snapshot: [{ source: 'staged', row: { id: image, product_id: product, supplier_id: supplier } }] };
let calls = [], actor = { is_active: true, role: 'admin', email: 'staff@example.invalid' }, enabled = true, error = false;
const tables = { product_form_submissions: [row], product_quantity_price_revisions: [{ id, product_id: product }], product_english_name_revisions: [] };
const db = { from(table) { calls.push(table); return { select() { return this; }, eq() { return this; }, order() { return this; },
  async range(a, b) { return { data: tables[table].slice(a, b + 1), error }; } }; } };
const mocks = {
  'server-only': {},
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: { getUser: async () => actor } },
  '@/lib/products/product-form-staging-access': { isProductFormEnabled: () => enabled },
  '@/lib/products/product-form-image-selection': { parseDraftImageSelection: (selection) => Array.isArray(selection) &&
    selection.every((ref) => ref?.source === 'staged' && typeof ref.id === 'string') ? selection : null },
  '@/lib/products/product-form-model': { parseProductFormDraft: (payload) => payload?.valid ? payload : null },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/crm/product-review-inbox.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, Set, Map, Array, Promise, Error, encodeURIComponent, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
} });
const { loadCrmReviewInbox: load, pendingFormSummary: summary } = exports;
const session = { uid: id, role: 'admin', email: 'staff@example.invalid' };
assert.equal(await load({ ...session, role: 'sale' }), null);
assert.equal(calls.length, 0, 'Sales must never query private submissions');
actor = { ...actor, is_active: false };
await assert.rejects(load(session)); assert.equal(calls.length, 0, 'Inactive staff cannot query inbox');
actor = { ...actor, is_active: true, role: 'viewer' };
await assert.rejects(load(session)); assert.equal(calls.length, 0, 'Session role must match the active database user');
actor = { ...actor, role: 'reviewer' };
const reviewerInbox = await load({ ...session, role: 'reviewer' });
assert.equal(reviewerInbox.forms.length, 1, 'Active reviewers have the same guarded inbox access');
calls = []; actor = { ...actor, role: 'admin' };
const inbox = await load(session);
assert.equal(inbox.forms.length, 1); assert.equal(inbox.prices.length, 1); assert.equal(inbox.names.length, 0);
assert.deepEqual(calls.sort(), ['product_english_name_revisions', 'product_form_submissions', 'product_quantity_price_revisions'].sort());
let result = summary(inbox.forms[0], { id: product, supplier_id: supplier });
assert.equal(result.draft.name, 'Synthetic'); assert.equal(result.imageUrl, `/api/product-form/images/${product}/${image}`);
assert.equal(summary(row, { id: product, supplier_id: image }), null, 'Never project a different supplier’s draft');
assert.equal(summary(row, { id: image, supplier_id: supplier }), null);
assert.equal(summary({ ...row, payload: null }, { id: product, supplier_id: supplier }).draft, null);
assert.equal(summary({ ...row, image_snapshot: [{ ...row.image_snapshot[0], row: { ...row.image_snapshot[0].row, supplier_id: image } }] },
  { id: product, supplier_id: supplier }).imageUrl, null, 'Cross-supplier image metadata must not be used');
assert.equal(summary({ ...row, image_snapshot: [] }, { id: product, supplier_id: supplier }).imageUrl, null);
calls = []; enabled = false; assert.equal((await load(session)).forms.length, 0);
assert.ok(!calls.includes('product_form_submissions'), 'Feature gate is respected');
enabled = true; error = true; await assert.rejects(load(session), /Review inbox unavailable/);
error = false; tables.product_form_submissions = [{ ...row, id: 'invalid' }]; await assert.rejects(load(session), /Invalid review inbox rows/);
console.log('CRM review inbox: verified staff, private snapshot ownership, feature gate and failure handling passed');
