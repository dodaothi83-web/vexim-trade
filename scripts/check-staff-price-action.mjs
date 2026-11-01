// node --experimental-strip-types --no-warnings scripts/check-staff-price-action.mjs
// Vexim chốt giá thay nhà cung cấp: quyền, cam kết giá, phiên bản sản phẩm và dấu vết.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as pricing from '../lib/products/quantity-pricing.ts';

const id = '22222222-2222-2222-2222-222222222222';
const actor = { id: '33333333-3333-3333-3333-333333333333', role: 'admin', email: 'admin@example.com', is_active: true };
let session = { uid: actor.id, role: 'admin', email: actor.email };
let product = { id, supplier_id: '55555555-5555-5555-5555-555555555555', name: 'Vỏ quế', category: 'cassia',
  supplier_category_proposal: 'cassia', reviewed_category_slug: null, updated_at: '2026-11-01T09:00:00.000Z',
  price_publicly_visible: true };
let rpcResult = { data: { status: 'saved', revision_id: '44444444-4444-4444-4444-444444444444' }, error: null };
const calls = [], audits = [];
const chain = { select: () => chain, eq: () => chain, in: async () => ({ data: [
  { id: '66666666-6666-6666-6666-666666666666', status: 'approved', grade: 'A', incoterm: 'FOB', tiers: [{ minKg: 1000, priceUsdPerKg: 6 }], product_context: { name: 'Vỏ quế' } },
] }) };
const db = { from: () => chain, rpc: async (name, args) => { calls.push({ name, args }); return rpcResult; } };
const store = { getUser: async () => actor, getProduct: async () => product, getCategoryBySlug: async () => ({ id: 'c1', slug: 'cassia', status: 'published', is_published: true }),
  addAuditLog: async (entry) => audits.push(entry) };
const mocks = {
  'next/cache': { revalidatePath() {} },
  '@/lib/auth/session': { getSession: async () => session },
  '@/lib/auth/permissions': { hasPermission: (role, permission) => role === 'admin' && permission === 'products.manage' },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: store },
  '@/lib/products/grade-pricing': { standardGradesForCategory: () => ['A'] },
  '@/lib/products/quantity-price-config': { readQuantityPricingPolicy: async () => pricing.DEFAULT_QUANTITY_PRICING_POLICY },
  '@/lib/products/quantity-pricing': pricing,
  'server-only': {},
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/crm/products/[slug]/edit/price-actions.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, console, process: { env: {} }, FormData, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });

const form = (overrides = {}) => {
  const data = new FormData();
  data.set('product_id', id); data.set('expected_product_updated_at', product.updated_at);
  data.set('grade', 'A'); data.set('incoterm', 'FOB'); data.set('quantity_currency', 'USD');
  data.set('quantity_tiers_json', JSON.stringify([{ minKg: '2000', priceUsdPerKg: '6.25' }]));
  data.set('confirm_quantity_price_consent', 'yes');
  for (const [key, value] of Object.entries(overrides)) value === null ? data.delete(key) : data.set(key, value);
  return data;
};

let response = await exports.adjustQuantityPriceAction(form());
assert.equal(response.ok, true, response.message);
assert.equal(calls[0].name, 'staff_set_quantity_price');
assert.equal(calls[0].args.p_product_id, id);
assert.equal(calls[0].args.p_actor_id, actor.id, 'Ghi người chốt giá');
assert.deepEqual(calls[0].args.p_tiers, [{ minKg: 2000, priceUsdPerKg: 6.25, incoterm: 'FOB', currency: 'USD' }], 'Giá được chuẩn hoá trước khi ghi');
assert.equal(audits.length, 1);
assert.equal(audits[0].action, 'staff.quantity_price_adjusted');
assert.equal(audits[0].after.revision_id, rpcResult.data.revision_id);
assert.equal(audits[0].before.revisions[0].id, '66666666-6666-6666-6666-666666666666', 'Dấu vết giữ bảng giá bị thay thế');
assert.equal(audits[0].after.supplier_confirmation_attested, true);

// Không xác nhận cam kết giá thì không ghi gì.
let before = calls.length;
response = await exports.adjustQuantityPriceAction(form({ confirm_quantity_price_consent: null }));
assert.equal(response.ok, false); assert.match(response.message, /cam kết giá/); assert.equal(calls.length, before);
// Giá ẩn với người mua thì không cần cam kết công khai.
product = { ...product, price_publicly_visible: false };
response = await exports.adjustQuantityPriceAction(form({ confirm_quantity_price_consent: null }));
assert.equal(response.ok, true, 'Giá nội bộ vẫn chốt được');
product = { ...product, price_publicly_visible: true };

// Trang đã cũ so với sản phẩm: từ chối để không ghi đè dữ liệu mới.
before = calls.length;
response = await exports.adjustQuantityPriceAction(form({ expected_product_updated_at: '2026-10-01T00:00:00.000Z' }));
assert.equal(response.ok, false); assert.match(response.message, /tải lại trang/); assert.equal(calls.length, before);
// Bảng giá rác bị chặn trước khi tới cơ sở dữ liệu.
response = await exports.adjustQuantityPriceAction(form({ quantity_tiers_json: '[{"minKg":1,"priceUsdPerKg":1}]' }));
assert.equal(response.ok, false); assert.match(response.message, /không hợp lệ/i);
// Nhà cung cấp không được dùng đường này.
session = { ...session, role: 'supplier' };
response = await exports.adjustQuantityPriceAction(form()); assert.equal(response.ok, false);
session = { uid: actor.id, role: 'admin', email: actor.email };
// Tài khoản đã bị khoá: không được gọi service role.
actor.is_active = false;
response = await exports.adjustQuantityPriceAction(form()); assert.equal(response.ok, false);
actor.is_active = true;
// Cơ sở dữ liệu trả lỗi: báo lỗi chung, không lộ chi tiết.
rpcResult = { data: { status: 'invalid' }, error: null };
response = await exports.adjustQuantityPriceAction(form()); assert.equal(response.ok, false);
console.log('Staff price action: permission, price consent, stale page, validation and audit trail passed');
