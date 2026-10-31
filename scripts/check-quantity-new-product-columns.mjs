// node scripts/check-quantity-new-product-columns.mjs
//
// Lỗi P0001 "Invalid new product payload" (2026-10-31) xảy ra vì
// `create_supplier_product_with_quantity` giữ một allow-list cột cố định, còn form sản phẩm
// mới gửi thêm cột Phase 2 (từ khoá, giá mẫu, đóng gói có cấu trúc). Script này so danh sách
// đó với đúng những khoá mà `parseProduct` dựng nên, để lần sau thêm cột mà quên cập nhật
// hàm thì check đỏ ngay, không đợi tới lúc người bán bấm Lưu.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

/** Tách các đoạn ngang cấp trong một object literal (bỏ qua chuỗi và ngoặc lồng). */
function topLevelSegments(body) {
  const segments = [];
  let current = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (quote) {
      current += char;
      if (char === '\\') { current += body[i + 1] ?? ''; i += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; current += char; continue; }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;
    if (char === ',' && depth === 0) { segments.push(current); current = ''; continue; }
    current += char;
  }
  if (current.trim()) segments.push(current);
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

/** Lấy thân object literal của `return {` đầu tiên sau mốc `anchor`. */
function returnObjectBody(source, anchor, file) {
  const start = source.indexOf(anchor);
  assert.ok(start >= 0, `${file}: không tìm thấy ${anchor}`);
  const open = source.indexOf('{', source.indexOf('return', start));
  assert.ok(open >= 0, `${file}: không tìm thấy object literal sau ${anchor}`);
  let depth = 0;
  let quote = null;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === '\\') { i += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`${file}: object literal không đóng`);
}

/** Khoá của một object literal: `a: 1`, `b,` và các `...spread`. */
function objectKeys(source, anchor, file) {
  const keys = [];
  const spreads = [];
  for (const segment of topLevelSegments(returnObjectBody(source, anchor, file))) {
    if (segment.startsWith('...')) { spreads.push(segment.slice(3).trim()); continue; }
    const colon = segment.indexOf(':');
    const key = (colon >= 0 ? segment.slice(0, colon) : segment).trim();
    if (/^[A-Za-z_$][\w$]*$/.test(key)) keys.push(key);
  }
  return { keys, spreads };
}

const actions = read('../app/supplier/portal/product-actions.ts');
const extras = read('../lib/products/product-extras.ts');

const product = objectKeys(actions, 'function parseProduct(', 'product-actions.ts');
const extrasObject = objectKeys(extras, 'export function productExtrasFromForm(', 'product-extras.ts');
assert.deepEqual(product.spreads, ['extras'], 'parseProduct chỉ spread thêm `extras`');
assert.deepEqual(extrasObject.spreads, [], 'productExtrasFromForm không spread thêm object nào');

const sentKeys = [...product.keys, ...extrasObject.keys];

// Migration mới nhất định nghĩa lại hàm tạo sản phẩm là nguồn sự thật của allow-list.
const dir = new URL('../supabase/migrations/', import.meta.url);
const migrations = fs.readdirSync(dir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .filter((name) => read(`../supabase/migrations/${name}`).includes('allowed text[]'));
assert.ok(migrations.length, 'phải có migration định nghĩa allow-list của hàm tạo sản phẩm');
const migration = migrations.at(-1);
const sql = read(`../supabase/migrations/${migration}`);
const allowedBlock = sql.slice(sql.indexOf('allowed text[]'));
const allowed = new Set([...allowedBlock.slice(0, allowedBlock.indexOf('];') + 1).matchAll(/'([a-z0-9_]+)'/g)]
  .map((match) => match[1]));
assert.ok(allowed.size > 30, `${migration}: đọc được quá ít cột (${allowed.size})`);

const missing = sentKeys.filter((key) => !allowed.has(key));
assert.deepEqual(missing, [],
  `${migration}: hàm tạo sản phẩm chưa cho phép các cột form đang gửi → P0001 "Invalid new product payload": ${missing.join(', ')}`);

// Cột Phase 2 phải nằm trong allow-list của bản migration mới nhất (không chỉ ở migration cũ).
for (const column of ['keywords', 'sample_price_usd', 'package_type', 'package_weight_kg', 'package_size', 'units_per_carton']) {
  assert.ok(allowed.has(column), `${migration}: allow-list thiếu cột Phase 2 "${column}"`);
}

// Hàm không được phép ghi cột hệ thống.
for (const column of ['id', 'created_at', 'updated_at', 'translation_meta', 'featured_media_id']) {
  assert.ok(!allowed.has(column), `${migration}: allow-list không được chứa cột hệ thống "${column}"`);
}

console.log(`OK check-quantity-new-product-columns (${sentKeys.length} khoá form ⊆ ${allowed.size} cột của ${migration})`);
