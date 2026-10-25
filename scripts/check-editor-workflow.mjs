// node scripts/check-editor-workflow.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { validateProductFields } from '../lib/product-attributes.ts';

const source = readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
const actions = source.slice(source.indexOf('function parseSupplierInput('), source.indexOf('/* ------------------------- SẢN PHẨM NCC'));
assert.ok(actions.includes('export async function updateSupplierAction'), 'Could not isolate supplier actions');
const js = ts.transpileModule(actions, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let current = { id: 'sup-1', name: 'Existing', status: 'draft', verification_level: 1, verified_at: '2025-01-01' };
let lastWrite = null;
let role = 'sourcing';
const store = {
  async createSupplier(row) { lastWrite = row; return { ...row, id: 'sup-2' }; },
  async getSupplier() { return current; },
  async updateSupplier(id, patch) { assert.equal(id, current.id); lastWrite = patch; current = { ...current, ...patch }; return current; },
  async deleteSupplier() {},
  async listProductsBySupplier() { return []; },
  async listCategories() { return []; },
  async setSupplierCategories() {},
};
const exports = {};
const str = (v) => typeof v === 'string' ? (v.trim() || null) : null;
const num = (v) => v === null || v === undefined || v === '' ? null : Number(v);
const bool = (v, fallback = false) => typeof v === 'boolean' ? v : v === 'on' ? true : fallback;
vm.runInNewContext(js, {
  exports, str, num, bool, EMAIL_RE: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  assignSupplierCategories: () => ({ ids: [], primaryId: null, slugs: [] }), console,
  guard: async () => null, getStore: () => store,
  getSession: async () => ({ role }),
  hasPermission: (r, permission) => r === 'admin' && permission === 'suppliers.publish',
  nextStatusOptions: (status) => ({ draft: ['submitted'], submitted: ['in_verification'], in_verification: ['published'], published: ['suspended', 'archived'] })[status] ?? [],
  statusMeta: (status) => ({ label: status }), revalidateAll: () => {},
  ensureSupplierProfileEnglish: async () => {}, syncSupplierIndustries: async () => null,
}, { filename: 'supplier-actions.ts' });

let res = await exports.createSupplierAction({ name: 'New', status: 'published', verification_level: 3, verified_at: '2025-01-01', fob_min: 999, fob_max: 1000, fob_publicly_visible: true, fob_updated_at: '2099-01-01' });
assert.equal(res.ok, true);
assert.equal(lastWrite.status, 'draft');
assert.equal(lastWrite.verification_level, 0);
assert.equal(lastWrite.verified_at, null);
assert.equal(lastWrite.fob_min, undefined, 'Do not create supplier-wide prices');
assert.equal(lastWrite.fob_max, undefined);
assert.notEqual(lastWrite.fob_updated_at, '2099-01-01', 'Consent timestamp must come from server');

current.fob_min = 7.8;
current.fob_max = 8.4;
current.fob_publicly_visible = true;
current.fob_updated_at = '2026-09-01T00:00:00Z';
res = await exports.updateSupplierAction(current.id, { name: 'Edited', status: 'draft', verification_level: 3, verified_at: '2026-01-01', fob_min: 999, fob_max: 1000, fob_publicly_visible: true, fob_updated_at: current.fob_updated_at });
assert.equal(res.ok, true);
assert.equal(lastWrite.status, 'draft');
assert.equal(lastWrite.verification_level, undefined);
assert.equal(lastWrite.verified_at, undefined);
assert.equal(current.verification_level, 1);
assert.equal(lastWrite.fob_min, undefined, 'Updating supplier must not overwrite stored legacy range');
assert.equal(lastWrite.fob_max, undefined);
assert.equal(current.fob_min, 7.8);
assert.equal(lastWrite.fob_updated_at, '2026-09-01T00:00:00Z', 'Editing profile must not renew consent');
res = await exports.updateSupplierAction(current.id, { name: 'Edited', status: 'draft', fob_publicly_visible: true, fob_updated_at: '2099-01-01' });
assert.equal(res.ok, true);
assert.notEqual(lastWrite.fob_updated_at, '2099-01-01', 'Reconfirmation must use server time');
res = await exports.updateSupplierAction(current.id, { name: 'Edited', status: 'draft', fob_publicly_visible: false });
assert.equal(lastWrite.fob_publicly_visible, false, 'Revoking consent hides prices');
res = await exports.updateSupplierAction(current.id, { name: 'Edited', status: 'draft' });
assert.equal(lastWrite.fob_publicly_visible, false, 'Editing with no consent field does not silently re-enable prices');
res = await exports.updateSupplierAction(current.id, { name: 'Edited', status: 'published' });
assert.equal(res.ok, false, 'Cannot jump directly from draft to published');
current.status = 'in_verification';
res = await exports.updateSupplierAction(current.id, { name: 'Edited', status: 'published' });
assert.equal(res.ok, false, 'Sourcing cannot publish');
role = 'admin';
res = await exports.updateSupplierAction(current.id, { name: 'Edited', status: 'published' });
assert.equal(res.ok, true, 'Admin can publish explicitly');
assert.equal(lastWrite.status, 'published');

const form = readFileSync(new URL('../components/supplier-form.tsx', import.meta.url), 'utf8');
assert.ok(form.includes('status: nextStatus ?? (saved.status'), 'Save must not silently change status');
assert.ok(!form.includes('onClick={() => set("verification_level"'), 'Verification level must not be editable');
assert.ok(!form.includes('Giá FOB thấp nhất') && !form.includes('fob_min'), 'Supplier form cannot enter a price');
assert.ok(form.includes('Quyền hiển thị giá của sản phẩm'), 'Supplier consent remains separate from product prices');
const productForm = readFileSync(new URL('../components/product-form.tsx', import.meta.url), 'utf8');
assert.ok(productForm.includes('value={v("ref_price")}') && productForm.includes('value={v("ref_price_max")}'), 'Each product can enter a lower and optional upper reference price');
assert.ok(productForm.indexOf('label="Đơn vị giá"') > productForm.indexOf('Giá tham khảo từ'), 'Price unit belongs beside price and currency, not the description');
assert.ok(productForm.includes('price_publicly_visible') && productForm.includes('description_detail'), 'Staff can set long description and explicit price opt-in');
assert.ok(source.includes('price_publicly_visible: bool(raw.price_publicly_visible, false)'), 'Staff server action persists opt-in only when selected');
const parseProductCode = source.slice(source.indexOf('function parseProductInput('), source.indexOf('async function autoAssignProduct('));
const productParser = { exports: {} };
vm.runInNewContext(ts.transpileModule(parseProductCode + '\nexports.parseProductInput = parseProductInput;', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: productParser.exports, str, num, bool, displayNameInput: (value) => str(value)?.slice(0, 120) ?? null });
const parsedProduct = productParser.exports.parseProductInput({ supplier_id: 'supplier-a', name: 'Cashew',
  description: 'Short', description_detail: 'Long details\nApplication', ref_price: 7, ref_price_max: 9, price_publicly_visible: true,
  fob_updated_at: '2099-01-01' });
assert.equal(parsedProduct.description_detail, 'Long details\nApplication');
assert.equal(parsedProduct.price_publicly_visible, true);
assert.equal(parsedProduct.ref_price_max, 9);
assert.equal(parsedProduct.fob_updated_at, undefined, 'A product editor cannot forge supplier-wide consent');
assert.equal(productParser.exports.parseProductInput({}).price_publicly_visible, false, 'No opt-in means private price');
const compare = readFileSync(new URL('../app/(public)/compare/page.tsx', import.meta.url), 'utf8');
assert.ok(!compare.includes('formatFob') && compare.includes('See individual products'), 'Comparison must link to per-product prices');
const categories = readFileSync(new URL('../app/crm/categories/categories-manager.tsx', import.meta.url), 'utf8');
assert.ok(categories.includes('onPublish={(publish) => onUpdate(c.id, publish)}'), 'Publish must be explicit');
const categorySource = source.slice(source.indexOf('function parseJsonList('));
const categoryJs = ts.transpileModule(categorySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const categoryExports = {};
let category = { id: 'cat-1', slug: 'cashew', name_i18n: { en: 'Cashew' }, intro_i18n: { en: 'Old text' }, status: 'draft', is_published: false, active_on_homepage: false, seo_indexable: false };
let categoryWrite = null;
role = 'sourcing';
vm.runInNewContext(categoryJs, {
  exports: categoryExports, str, num, bool,
  guard: async () => null, getSession: async () => ({ role, uid: 'staff-1', email: 'test@veximtrade.com' }),
  hasPermission: (r, p) => r === 'admin' && p === 'categories.publish',
  validateProductFields,
  getStore: () => ({
    getCategory: async () => category,
    getCategoryBySlug: async () => category,
    updateCategory: async (_id, patch) => { categoryWrite = patch; category = { ...category, ...patch }; return category; },
    addAuditLog: async () => {},
  }),
  revalidateAll: () => {},
}, { filename: 'category-actions.ts' });
const categoryRaw = { slug: 'cashew', name_en: 'Cashew', intro_en: '', is_published: '', active_on_homepage: '' };
res = await categoryExports.updateCategoryAction(category.id, { ...categoryRaw, is_published: 'on' });
assert.equal(res.ok, false, 'Non-admin cannot publish by request');
res = await categoryExports.updateCategoryAction(category.id, { ...categoryRaw, active_on_homepage: 'on' });
assert.equal(res.ok, false, 'Non-admin cannot alter public visibility via save');
role = 'admin';
res = await categoryExports.updateCategoryAction(category.id, categoryRaw);
assert.equal(res.ok, true);
assert.equal(categoryWrite.intro_i18n.en, '', 'Clearing intro must persist');
res = await categoryExports.updateCategoryAction(category.id, { ...categoryRaw, is_published: 'on' });
assert.equal(res.ok, false, 'Saving copy cannot also approve publication');
assert.equal(categoryWrite.status, 'draft');

const aiSource = readFileSync(new URL('../app/api/ai/editor-draft/route.ts', import.meta.url), 'utf8');
const aiJs = ts.transpileModule(aiSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let mockRole = null;
let providerRequests = 0;
const aiExports = {};
vm.runInNewContext(aiJs, {
  exports: aiExports,
  process: { env: { OPENAI_API_KEY: 'mock-key' } },
  console,
  AbortSignal,
  fetch: async () => { providerRequests++; return new Response(JSON.stringify({ output_text: 'A factual English introduction.' }), { status: 200 }); },
  require: (path) => ({
    'next/server': { NextResponse: { json: (data, options = {}) => new Response(JSON.stringify(data), { status: options.status ?? 200 }) } },
    '@/lib/auth/session': { getSession: async () => mockRole && { uid: 'staff-1', role: mockRole } },
    '@/lib/auth/permissions': { hasPermission: (r, p) => r === 'admin' && p === 'categories.manage' },
    '@/lib/ai/company-introduction': { readOutputText: (p) => p.output_text },
    '@/lib/ai/draft-style': {
      HUMAN_STYLE_RULES: '', CATEGORY_INTRO_SYSTEM: '', FAQ_SYSTEM: '',
      sanitizeDraftText: (text) => text, parseFaqDraft: () => [],
    },
    '@/lib/rfq/rate-limit': { rateLimit: () => ({ ok: true }) },
  })[path],
}, { filename: 'ai-editor-route.ts' });
const request = (kind) => new Request('https://test.local/api/ai/editor-draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, name: 'Cashew' }) });
assert.equal((await aiExports.POST(request('category'))).status, 401);
mockRole = 'viewer';
assert.equal((await aiExports.POST(request('category'))).status, 403);
mockRole = 'admin';
const drafted = await aiExports.POST(request('category'));
assert.equal(drafted.status, 200);
assert.equal((await drafted.json()).text, 'A factual English introduction.');
assert.equal(providerRequests, 1);
console.log('✅ Supplier save vs transition, verification integrity, category publish and guarded AI draft.');
