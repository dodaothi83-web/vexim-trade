// node --experimental-strip-types --no-warnings scripts/check-product-form-submit-action.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const supplier = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const id = '11111111-1111-1111-1111-111111111111';
const submissionId = '22222222-2222-2222-2222-222222222222';
let access = { supplier: { id: supplier } }, product = { id, supplier_id: supplier },
  draft = { category: 'cashew', descriptionDetail: '', valid: true }, revision = 1, category = { id: 'cat', status: 'published', is_published: true },
  media = [{ kind: 'image', product_id: id, supplier_id: supplier, storage_path: 'one.webp' }],
  validation = { errors: [], warnings: [], quantity: { grade: 'W320', incoterm: 'FOB', tiers: [{ quantityGrams: 1000000 }] } },
  rpcData = { status: 'submitted', submission_id: submissionId }, calls = [];
const store = { getProduct: async () => product, getCategoryBySlug: async () => category, listMedia: async () => media };
const db = {
  from(table) { const filter = {}; return { select() { return this; }, eq(key, value) { filter[key] = value; return this; },
    async maybeSingle() { calls.push({ table, filter }); return { data: { revision, payload: draft }, error: null }; } }; },
  async rpc(name, args) { calls.push({ name, args }); return { data: rpcData, error: null }; },
};
let validationContext;
const mocks = {
  'next/cache': { revalidatePath() {} }, '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: store },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => access }, '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
  '@/lib/products/grade-pricing': { standardGradesForCategory: () => ['W320'] }, '@/lib/products/quantity-price-config': { readQuantityPricingPolicy: async () => ({ settings: true }) },
  '@/lib/products/product-form-model': { parseProductFormDraft: (value) => value?.valid ? value : null,
    validateProductFormSubmission: (_draft, ctx) => { validationContext = ctx; return validation; } },
  '@/lib/products/product-description': { sanitizeProductDescriptionForSave: (value) => value === '<script>bad</script>' ? '' : value },
  '@/lib/products/quantity-revision-v2': { toQuantityRevisionV2: (value) => value.tiers },
  '@/lib/media/readiness': { isExpired: (asset) => asset.status === 'expired' },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/product-form-submit-action.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, console, Number, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
const submit = exports.submitProductFormDraftAction;
assert.equal((await submit('invalid', 1)).ok, false);
access = null; assert.equal((await submit(id, 1)).ok, false); access = { supplier: { id: supplier } };
product = { id, supplier_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
assert.equal((await submit(id, 1)).ok, false); assert.equal(calls.length, 0, 'Unauthorized callers cannot read private drafts');
product = { id, supplier_id: supplier };
assert.equal((await submit(id, 2)).ok, false);
draft = { ...draft, descriptionDetail: '<script>bad</script>' }; assert.equal((await submit(id, 1)).ok, false);
draft = { ...draft, descriptionDetail: '' };
validation = { errors: [{ code: 'grade', message: 'Chọn grade' }], warnings: [], quantity: null };
assert.equal((await submit(id, 1)).errors[0].code, 'grade'); assert.ok(!calls.some((call) => call.name));
validation = { errors: [], warnings: [{ code: 'grade_price_outlier', message: 'Giá cần kiểm tra' }], quantity: { grade: 'W320', incoterm: 'FOB', tiers: [{ quantityGrams: 1000000 }] } };
let result = await submit(id, 1); assert.equal(result.ok, true); assert.equal(result.submissionId, submissionId);
assert.equal(validationContext.categoryValid, true); assert.equal(validationContext.imageCount, 1);
const call = calls.find((item) => item.name); assert.equal(call.name, 'submit_product_form_draft');
assert.equal(call.args.p_supplier_id, supplier); assert.equal(call.args.p_expected_revision, 1);
assert.equal(call.args.p_validated_payload, draft); assert.equal(call.args.p_quantity.grade, 'W320');
assert.equal(call.args.p_warnings[0].code, 'grade_price_outlier');
rpcData = { status: 'images_changed' }; result = await submit(id, 1); assert.equal(result.ok, false); assert.match(result.message, /Ảnh/);
category = null; validation = { errors: [{ code: 'category', message: 'Chọn danh mục' }], warnings: [], quantity: null };
result = await submit(id, 1); assert.equal(result.ok, false); assert.equal(validationContext.categoryValid, false); assert.equal(validationContext.policy, null);
console.log('Product form submit action: authorization, trusted inputs, HTML safety and server validation passed');
