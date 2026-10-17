// node scripts/check-editor-workflow.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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
}, { filename: 'supplier-actions.ts' });

let res = await exports.createSupplierAction({ name: 'New', status: 'published', verification_level: 3, verified_at: '2025-01-01' });
assert.equal(res.ok, true);
assert.equal(lastWrite.status, 'draft');
assert.equal(lastWrite.verification_level, 0);
assert.equal(lastWrite.verified_at, null);

res = await exports.updateSupplierAction(current.id, { name: 'Edited', status: 'draft', verification_level: 3, verified_at: '2026-01-01' });
assert.equal(res.ok, true);
assert.equal(lastWrite.status, 'draft');
assert.equal(lastWrite.verification_level, undefined);
assert.equal(lastWrite.verified_at, undefined);
assert.equal(current.verification_level, 1);
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
assert.equal(res.ok, true);
assert.equal(categoryWrite.status, 'published');

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
