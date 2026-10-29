// node scripts/check-quantity-product-publication.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const id = '22222222-2222-2222-2222-222222222222', supplier = '55555555-5555-5555-5555-555555555555';
let session = { uid: 'actor', role: 'reviewer', email: 'reviewer@example.com' };
let actor = { id: 'actor', role: 'reviewer', email: 'reviewer@example.com', is_active: true };
let product = { id, supplier_id: supplier, name: 'Nhân điều', spec: 'Quy cách', supplier_review_status: 'pending', supplier_originated: true, supplier_category_proposal: 'cashew', reviewed_category_slug: null, ready_for_buyer: false, updated_at: '2026-10-29T00:00:00Z', specs: {} };
let status = 'price_not_approved', requests = [], audits = [];
const store = { getProduct: async () => product, getUser: async () => actor, getSupplier: async () => ({ id: supplier, status: 'published' }),
  listCategories: async () => [{ slug: 'cashew' }], listMedia: async () => [], addAuditLog: async (entry) => audits.push(entry) };
const db = { rpc: async (name, args) => { requests.push({ name, args }); return { data: { status, product: status === 'saved' ? { ...product, ready_for_buyer: true } : null }, error: null }; } };
const mocks = {
  'next/cache': { revalidatePath() {} }, '@/lib/auth/session': { guard: async () => null, getSession: async () => session },
  '@/lib/db': { getStore: () => store }, '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: store },
  '@/lib/supplier-portal/category-proposals': { categoryProposalOptions: (v) => v }, '@/lib/crm/badges': { refreshCrmBadges() {} },
  '@/lib/supplier-portal/notify': { notifySupplierDecision: async () => 'sent' },
  '@/lib/ai/product-translation-service': {}, '@/lib/ai/translate-content': {}, '@/lib/products/product-description': {},
  '@/lib/products/grade-pricing': { standardGradesForCategory: () => ['W320'] }, '@/lib/products/quantity-pricing': { nameContainsGrade: (name, grades) => grades.some((grade) => name.includes(grade)) },
  '@/lib/media/readiness': { productPublicationMediaState: () => ({ verifiedBuyerImages: true, uncheckedBuyerFiles: 0 }) },
  '@/lib/public/product-selection': { isTestOnlyProduct: () => false }, '@/lib/public/supplier-seo': { isSyntheticSupplier: () => false },
};
const exports = {}, process = { env: {} };
const code = ts.transpileModule(readFileSync(new URL('../app/crm/products/[slug]/edit/review-actions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, console, process, FormData, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
const form = new FormData(); form.set('product_id', id); form.set('decision', 'approved'); form.set('reviewed_category_slug', 'cashew');
let response = await exports.decideSupplierProductAction(form);
assert.equal(response.ok, false); assert.match(response.message, /duyệt bảng giá/i); assert.equal(requests[0].args.p_buyer_enabled, false);
status = 'buyer_not_enabled'; response = await exports.decideSupplierProductAction(form); assert.match(response.message, /chưa được bật/);
status = 'price_changed'; response = await exports.decideSupplierProductAction(form); assert.match(response.message, /gửi lại/);
status = 'category_changed'; response = await exports.decideSupplierProductAction(form); assert.match(response.message, /Danh mục/);
status = 'saved'; process.env.VEXIM_QUANTITY_BUYER_PREVIEW = 'true'; response = await exports.decideSupplierProductAction(form);
assert.equal(response.ok, true); assert.equal(requests.at(-1).args.p_buyer_enabled, true); assert.equal(audits.length, 1);
const before = requests.length; actor = { ...actor, is_active: false };
assert.equal((await exports.decideSupplierProductAction(form)).ok, false); assert.equal(requests.length, before, 'Inactive staff cannot call service role');
session = { ...session, role: 'supplier' }; assert.equal((await exports.decideSupplierProductAction(form)).ok, false);
console.log('Quantity product publication: strict reviewer authorization, readiness guard and buyer cutover gate passed');
