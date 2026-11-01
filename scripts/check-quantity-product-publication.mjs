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
  '@/lib/media/readiness': { productPublicationMediaState: () => ({ buyerImages: 1, buyerFiles: 1, ready: true }) },
  '@/lib/public/product-selection': { isTestOnlyProduct: () => false }, '@/lib/public/supplier-seo': { isSyntheticSupplier: () => false },
  'server-only': {},
  // Chẩn đoán lệch giá: đọc bản chụp thật trong cơ sở dữ liệu, ở đây giả lập một trường lệch.
  '@/lib/products/price-context-diff': {
    readPriceContextDiff: async () => ({ revisionId: '11111111-1111-1111-1111-111111111111', revisionStatus: 'approved', changed: ['name'], missingContext: false }),
    describePriceContextChanges: (changed) => changed.map((key) => key === 'name' ? 'tên sản phẩm' : key).join(', '),
  },
};
const exports = {}, process = { env: {} };
const code = ts.transpileModule(readFileSync(new URL('../app/crm/products/[slug]/edit/review-actions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, console, process, FormData, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
const form = new FormData(); form.set('product_id', id); form.set('decision', 'approved'); form.set('reviewed_category_slug', 'cashew');
let response = await exports.decideSupplierProductAction(form);
assert.equal(response.ok, false); assert.match(response.message, /chưa có bảng giá nào để duyệt cùng/i);
assert.equal(requests[0].args.p_actor_id, 'actor', 'Người duyệt được ghi vào bảng giá đầu tiên');
assert.equal('p_buyer_enabled' in requests[0].args, false, 'Đăng sản phẩm không còn phụ thuộc cờ triển khai');
// Thông tin sản phẩm đổi sau khi chốt giá: nói rõ lệch chỗ nào và chỉ việc chốt lại giá,
// không còn đẩy nhà cung cấp vào vòng gửi lại bảng giá.
status = 'price_changed'; response = await exports.decideSupplierProductAction(form);
assert.match(response.message, /Chốt lại giá/);
assert.doesNotMatch(response.message, /yêu cầu nhà cung cấp gửi lại/i);
assert.match(response.message, /Lệch ở: tên sản phẩm/);
status = 'category_changed'; response = await exports.decideSupplierProductAction(form); assert.match(response.message, /Danh mục/);
status = 'saved'; response = await exports.decideSupplierProductAction(form);
assert.equal(response.ok, true);
assert.equal(audits.length, 1);
const before = requests.length; actor = { ...actor, is_active: false };
assert.equal((await exports.decideSupplierProductAction(form)).ok, false); assert.equal(requests.length, before, 'Inactive staff cannot call service role');
session = { ...session, role: 'supplier' }; assert.equal((await exports.decideSupplierProductAction(form)).ok, false);
console.log('Quantity product publication: strict reviewer authorization, first price approved with the product, no deployment gate');
