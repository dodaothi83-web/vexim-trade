// node scripts/check-legacy-grade-split-plan.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/legacy-grade-split-plan.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, structuredClone, Date, Number, Map, Set, console });
const { planLegacyGradeSplit } = exports;
const source = '11111111-1111-1111-1111-111111111111', supplier = '22222222-2222-2222-2222-222222222222';
const target = '33333333-3333-3333-3333-333333333333', a = '44444444-4444-4444-4444-444444444444';
const b = '55555555-5555-5555-5555-555555555555', rfqId = '66666666-6666-6666-6666-666666666666';
const certId = '77777777-7777-7777-7777-777777777777', now = '2026-10-29T10:00:00Z';
const input = { product: { id: source, supplier_id: supplier, category: 'pepper', updated_at: now,
  supplier_review_status: 'approved', ready_for_buyer: true, unit: 'MT', currency: 'USD', name: 'Pepper 500 and 550', description: 'Existing description',
  featured_media_id: a, images: [a], specs: { grade_rows: [
    { grade: '500 g/L', price_min: 1500, price_max: 1600, moq: '1 tấn', incoterm: 'FOB' },
    { grade: '550 g/L', price_min: 1800, price_max: 1900, moq: '1 tấn', incoterm: 'FOB' },
  ] } }, newProductId: target, resolvedCategorySlug: 'pepper',
  assets: [{ id: a, owner_type: 'product', product_id: source, supplier_id: supplier, kind: 'image', audience: 'buyer', status: 'checked',
    storage_path: `products/${source}/original.webp`, thumb_path: `products/${source}/original-thumb.webp` }],
  imageMappings: [{ sourceId: a, newId: b }],
  rfqs: [{ id: rfqId, source_product_id: source, updated_at: now, specs: { grade: '550 g/L' } }],
  certificates: [{ id: certId, updated_at: now, requested_product_ids: [source], approved_product_ids: [source] }],
};
const before = JSON.stringify(input);
const result = planLegacyGradeSplit(input); assert.equal(result.ok, true);
assert.equal(JSON.stringify(input), before, 'Planning never mutates the source');
const plan = result.plan;
assert.equal(plan.originalUrl, `/products/pepper/${source}`); assert.equal(plan.newUrl, `/products/pepper/${target}`);
assert.equal(plan.sourceGrade, '500 g/L'); assert.equal(plan.newGrade, '550 g/L');
assert.equal(plan.gradeRows[0].price_min, 1500); assert.equal(plan.gradeRows[0].price_max, 1600);
assert.equal(plan.gradeRows[1].price_min, 1800); assert.equal(plan.gradeRows[1].price_max, 1900);
assert.equal(plan.sourceSnapshot.supplier_review_status, 'approved'); assert.equal(plan.sourceSnapshot.ready_for_buyer, true);
assert.equal(plan.assetCopies[0].sourcePath, input.assets[0].storage_path);
assert.equal(plan.assetCopies[0].newPath, `products/${target}/${b}.webp`);
assert.equal(plan.assetCopies[0].newThumbPath, `products/${target}/${b}-thumb.webp`);
assert.equal(plan.featuredImageMapping.newId, b); assert.equal(plan.rfqs[0].decision, 'move_candidate');
assert.equal(plan.certificates[0].requested, true); assert.equal(plan.certificates[0].approved, true);
plan.sourceSnapshot.name = 'Changed'; plan.assetSnapshots[0].storage_path = 'changed'; plan.gradeRows[0].price_min = 1;
assert.equal(input.product.name, 'Pepper 500 and 550'); assert.equal(input.assets[0].storage_path, `products/${source}/original.webp`);
assert.equal(input.product.specs.grade_rows[0].price_min, 1500, 'Snapshots are detached');
function clone() { return structuredClone(input); }
for (const [grade, decision] of [['500 g/L', 'keep'], [' 550 G/l ', 'move_candidate'], ['', 'review'], ['550', 'review'], ['500 g/L, 550 g/L', 'review']]) {
  const value = clone(); value.rfqs[0].specs.grade = grade;
  assert.equal(planLegacyGradeSplit(value).plan.rfqs[0].decision, decision, grade);
}
let bad = clone(); bad.rfqs[0].source_product_id = null;
assert.equal(planLegacyGradeSplit(bad).ok, false, 'Never guess association from RFQ text');
bad = clone(); bad.product.specs.grade_rows.reverse();
const reversed = planLegacyGradeSplit(bad); assert.equal(reversed.ok, true); assert.equal(reversed.plan.sourceGrade, '550 g/L', 'Stored row order decides which keeps the URL');
bad = clone(); bad.product.specs.grade_rows[1].grade = '500 G/L'; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.product.specs.grade_rows[1].price_max = 1700; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.product.specs.grade_rows[1].price_min = '6.40000000000000001'; bad.product.specs.grade_rows[1].price_max = '6.4';
assert.equal(planLegacyGradeSplit(bad).ok, false, 'Compare prices exactly, not as floats');
bad = clone(); bad.product.specs.grade_rows[1].incoterm = 'bogus'; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.imageMappings = []; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.assets[0].storage_path = `products/${source}/../secret.webp`; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.assets[0].supplier_id = target; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.newProductId = source; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.imageMappings[0].newId = source; bad.assets.push({ ...bad.assets[0], id: source }); assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.assets.push({ ...bad.assets[0], kind: 'certificate' }); assert.equal(planLegacyGradeSplit(bad).ok, false, 'Unknown linked files need a separate copy plan');
bad = clone(); bad.product.reviewed_category_slug = 'cashew'; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.product.supplier_originated = true; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.resolvedCategorySlug = 'bad/path'; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.product.featured_media_id = target; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.product.unit = 'bag'; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); delete bad.product.ready_for_buyer; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.assets[0].owner_type = 'supplier'; assert.equal(planLegacyGradeSplit(bad).ok, false);
bad = clone(); bad.certificates[0].approved_product_ids = []; bad.certificates[0].requested_product_ids = [];
assert.equal(planLegacyGradeSplit(bad).ok, false, 'Never expand unrelated certificate scope');
console.log('Legacy two-grade split plan: first ID, exact rows, independent media paths, RFQ review and certificate scope passed');
