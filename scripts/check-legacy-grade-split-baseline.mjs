// node scripts/check-legacy-grade-split-baseline.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function compile(name) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../lib/products/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, structuredClone, Date, Number, Map, Set, Object, JSON, console });
  return exports;
}
const { planLegacyGradeSplit } = compile('legacy-grade-split-plan');
const { compareLegacySplitBaseline } = compile('legacy-grade-split-baseline');
const pid = '11111111-1111-1111-1111-111111111111', sid = '22222222-2222-2222-2222-222222222222';
const newId = '33333333-3333-3333-3333-333333333333', oldImage = '44444444-4444-4444-4444-444444444444';
const newImage = '55555555-5555-5555-5555-555555555555', rfq = '66666666-6666-6666-6666-666666666666';
const cert = '77777777-7777-7777-7777-777777777777', now = '2026-10-29T10:00:00Z';
const input = { product: { id: pid, supplier_id: sid, category: 'pepper', updated_at: now,
  supplier_review_status: 'approved', ready_for_buyer: true, currency: 'USD', unit: 'MT', featured_media_id: oldImage,
  specs: { grade_rows: [{ grade: '500 g/L', price_min: 1500, price_max: 1600, moq: '1 MT', incoterm: 'FOB' },
    { grade: '550 g/L', price_min: 1800, price_max: 1900, moq: '1 MT', incoterm: 'FOB' }] } },
  newProductId: newId, resolvedCategorySlug: 'pepper',
  assets: [{ id: oldImage, owner_type: 'product', product_id: pid, supplier_id: sid, kind: 'image', storage_path: `products/${pid}/old.webp`, thumb_path: null }],
  imageMappings: [{ sourceId: oldImage, newId: newImage }],
  rfqs: [{ id: rfq, source_product_id: pid, updated_at: now, specs: { grade: '550 g/L' }, access_token: 'must-not-be-saved' }],
  certificates: [{ id: cert, updated_at: now, requested_product_ids: [pid], approved_product_ids: [pid] }],
};
const planned = planLegacyGradeSplit(input); assert.equal(planned.ok, true);
const plan = planned.plan;
assert.ok(!JSON.stringify(plan.rfqSnapshots).includes('must-not-be-saved'), 'RFQ access token not retained');
const current = () => ({ product: structuredClone(input.product), resolvedCategorySlug: input.resolvedCategorySlug,
  assets: structuredClone(input.assets), rfqs: structuredClone(input.rfqs), certificates: structuredClone(input.certificates),
  targetProductExists: false, existingTargetMediaIds: [], referencedTargetPaths: [] });
let state = current(); assert.equal(compareLegacySplitBaseline(plan, state).length, 0);
const issues = (state) => Array.from(compareLegacySplitBaseline(plan, state));
state = current(); state.product.name = 'Changed without timestamp'; assert.ok(issues(state).includes('product_changed'));
state = current(); state.product.specs.grade_rows.reverse(); assert.ok(issues(state).includes('product_changed'));
state = current(); state.resolvedCategorySlug = 'cashew'; assert.ok(issues(state).includes('category_changed'));
state = current(); state.assets[0].audience = 'internal'; assert.ok(issues(state).includes('media_changed'));
state = current(); state.assets.push({ ...state.assets[0], id: 'other', kind: 'catalogue' }); assert.ok(issues(state).includes('media_changed'));
state = current(); state.rfqs[0].specs.grade = '500 g/L'; assert.ok(issues(state).includes('rfqs_changed'), 'Grade checked even without timestamp change');
state = current(); state.rfqs.push({ ...state.rfqs[0], id: 'new' }); assert.ok(issues(state).includes('rfqs_changed'), 'New RFQ invalidates inventory');
state = current(); state.certificates[0].approved_product_ids = []; assert.ok(issues(state).includes('certificates_changed'));
state = current(); state.certificates.push({ ...state.certificates[0], id: 'new' }); assert.ok(issues(state).includes('certificates_changed'));
state = current(); state.targetProductExists = true; assert.ok(issues(state).includes('target_product_taken'));
state = current(); state.existingTargetMediaIds = [newImage.toUpperCase()]; assert.ok(issues(state).includes('target_media_taken'));
state = current(); state.referencedTargetPaths = [plan.assetCopies[0].newPath]; assert.ok(issues(state).includes('target_paths_referenced'));
state = current(); delete state.targetProductExists; assert.deepEqual(issues(state), ['invalid_inventory']);
state = current(); state.existingTargetMediaIds = [null]; assert.deepEqual(issues(state), ['invalid_inventory']);
state = current(); state.assets = [null]; assert.deepEqual(issues(state), ['invalid_inventory']);
state = current(); state.product = Object.fromEntries(Object.entries(state.product).reverse());
assert.equal(issues(state).length, 0, 'Object key order is irrelevant');
console.log('Split baseline comparison: product, category, complete inventories, RFQ grade and target collisions passed');
