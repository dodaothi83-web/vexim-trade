// node scripts/check-category-filters-migration.mjs
//
// Lỗi thật: TypeError: a.filters?.find is not a function ở trang /rfq, vì
// categories.filters là jsonb và một dòng đang giữ map {"grades": [...]} thay vì
// mảng CategoryFilter[]. Test này chạy đúng file migration trên PostgreSQL tạm
// (PGlite, không đụng Supabase) với các hình dạng dữ liệu đã gặp, rồi kiểm tra
// hàm chuẩn hoá phía ứng dụng trả về cùng một kết quả.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const migration = readFileSync(new URL('../supabase/migrations/20261051_category_filters_shape_repair.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

const db = new PGlite();
await db.exec(`
  create table public.categories (id text primary key, slug text not null, filters jsonb not null default '[]'::jsonb);
  insert into public.categories (id, slug, filters) values
    ('c1', 'cashew-kernels', '{"grades": ["W180", "W240", "W320"]}'::jsonb),
    ('c2', 'pepper', '[{"key": "grade", "label": "Grades", "options": [{"value": "500 g/L", "label": "500 g/L"}]}]'::jsonb),
    ('c3', 'dried-fruits', '[]'::jsonb),
    ('c4', 'cinnamon', '[{"key": "certs", "options": ["HACCP", "BRC"]}]'::jsonb),
    ('c5', 'rice', '[{"key": "grade", "label": "Grades", "values": ["ST25"]}]'::jsonb),
    ('c6', 'coffee', '"[]"'::jsonb),
    ('c7', 'coconut', '{"key": "grade", "label": "Grades", "options": ["Robusta"]}'::jsonb),
    ('c8', 'tea', 'null'::jsonb);
`);

await db.exec(migration);
const rows = async () => Object.fromEntries((await db.query('select slug, filters from public.categories')).rows.map((r) => [r.slug, r.filters]));

const after = await rows();
// Map cũ {"grades": [...]} thành mảng chuẩn, và số nhiều đổi về key mà form RFQ đọc.
assert.deepEqual(after['cashew-kernels'], [
  { key: 'grade', label: 'grades', options: [{ value: 'W180', label: 'W180' }, { value: 'W240', label: 'W240' }, { value: 'W320', label: 'W320' }] },
], 'A {"grades": [...]} map becomes a canonical filter list');
assert.deepEqual(after['pepper'], [
  { key: 'grade', label: 'Grades', options: [{ value: '500 g/L', label: '500 g/L' }] },
], 'An already canonical row keeps its label and options');
assert.deepEqual(after['dried-fruits'], [], 'An empty list stays empty');
assert.deepEqual(after['cinnamon'], [
  { key: 'certifications', label: 'certs', options: [{ value: 'HACCP', label: 'HACCP' }, { value: 'BRC', label: 'BRC' }] },
], 'Bare string options become {value,label} objects and certs maps to certifications');
assert.deepEqual(after['rice'], [
  { key: 'grade', label: 'Grades', options: [{ value: 'ST25', label: 'ST25' }] },
], 'An older "values" list is read as options');
assert.deepEqual(after['coffee'], [], 'A double-encoded "[]" string does not stay a string');
assert.deepEqual(after['coconut'], [
  { key: 'grade', label: 'Grades', options: [{ value: 'Robusta', label: 'Robusta' }] },
], 'A single filter object without its list still normalises');
assert.deepEqual(after['tea'], [], 'A null column degrades to an empty list');
for (const [slug, value] of Object.entries(after)) {
  assert.ok(Array.isArray(value), `${slug} is stored as a json array`);
}

// Idempotent: chạy lần hai không đổi dữ liệu.
await db.exec(migration);
assert.deepEqual(await rows(), after, 'Running the repair twice changes nothing');

// Cột chỉ nhận mảng sau migration.
await assert.rejects(db.exec(`update public.categories set filters = '{"grades": ["W180"]}'::jsonb where slug = 'cashew-kernels'`),
  /categories_filters_is_array/, 'The map shape can no longer be written back');

// Hàm chuẩn hoá phía ứng dụng phải chịu được đúng những hình dạng trên và các
// biến thể mà database không giữ (chuỗi chưa parse, object lồng, giá trị lạ).
const source = ts.transpileModule(readFileSync(new URL('../lib/category-filters.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
// Cùng realm với test, để so sánh object bằng deepEqual không lệch prototype.
new Function('module', 'exports', 'require', source)(mod, mod.exports, () => ({}));
const { normalizeCategoryFilters, categoryFilterValues } = mod.exports;

assert.deepEqual(normalizeCategoryFilters({ grades: ['W180', 'W240'] }), [
  { key: 'grade', label: 'grades', options: [{ value: 'W180', label: 'W180' }, { value: 'W240', label: 'W240' }] },
], 'The app reads a map without throwing and matches the migration key');
assert.deepEqual(categoryFilterValues({ grades: ['W180'] }, 'grade'), ['W180'], 'The app finds plural grades under the canonical key');
assert.deepEqual(categoryFilterValues([{ key: 'certs', options: ['BRC'] }], 'certifications'), ['BRC'], 'certs becomes certifications');
assert.deepEqual(categoryFilterValues({ grade: ['W180'] }, 'grade'), ['W180'], 'A map keyed "grade" feeds the RFQ chips');
assert.deepEqual(categoryFilterValues([{ key: 'grade', options: [{ value: 'W320', label: 'W320' }, { value: 'W320', label: 'W320' }] }], 'grade'),
  ['W320'], 'Duplicate options collapse to one chip');
assert.deepEqual(categoryFilterValues('[{"key":"grade","options":["W450"]}]', 'grade'), ['W450'], 'A JSON string column is parsed');
assert.deepEqual(categoryFilterValues('{"key":"certifications","options":"HACCP"}', 'certifications'), [], 'A non-list options value is ignored');
for (const broken of [null, undefined, 42, true, 'not json', {}, [], { grade: 'x' }, [{ options: [] }, null, 'x']]) {
  assert.deepEqual(normalizeCategoryFilters(broken), [], `Broken column value ${JSON.stringify(broken)} degrades to an empty list`);
}

// Trang /rfq thật phải render được với đúng dữ liệu đang có trên production:
// cashew-kernels giữ map {"grades": [...]} cho tới khi migration chạy xong.
{
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const compiled = ts.transpileModule(readFileSync(new URL('../app/(public)/rfq/page.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  let formProps = null;
  const pageModule = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(pageModule, pageModule.exports, (id) => {
    if (id === 'react/jsx-runtime') return require('react/jsx-runtime');
    if (id === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
    if (id === '@/components/ui') return { Breadcrumbs: () => React.createElement('nav') };
    if (id === './rfq-form') return { RfqForm: (props) => { formProps = props; return React.createElement('div', null, 'rfq form'); } };
    if (id === '@/lib/category-filters') return mod.exports;
    if (id === '@/lib/db') return { getStore: () => ({ listCategories: async () => [{ slug: 'cashew-kernels', name_i18n: { en: 'Cashew kernels' }, filters: { grades: ['W180', 'W240', 'W320'] } }] }) };
    if (id === '@/lib/public/catalog') return { listPublicSuppliers: async () => [] };
    throw new Error(`Unexpected import in app/(public)/rfq/page.tsx: ${id}`);
  });
  const { default: RfqPage } = pageModule.exports;
  const html = renderToStaticMarkup(await RfqPage({ searchParams: Promise.resolve({ category: 'cashew-kernels' }) }));
  assert.match(html, /rfq form/, 'The RFQ page renders instead of throwing on a map-shaped column');
  assert.deepEqual(formProps.categorySpecs['cashew-kernels'], { grades: ['W180', 'W240', 'W320'], certs: [] },
    'The map row still feeds the grade chips it holds, and missing certifications stay empty');
}

// Regression gốc: trang /rfq từng gọi .find() trên object nên vỡ cả route.
const rfqPage = readFileSync(new URL('../app/(public)/rfq/page.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(rfqPage, /filters as CategoryFilter\[\] \| null\)\?\.find/, 'The page never calls .find straight on the jsonb column');
assert.match(rfqPage, /categoryFilterValues\(c\.filters, "grade"\)/, 'The page reads grades through the shared normaliser');
assert.match(rfqPage, /categoryFilterValues\(c\.filters, "certifications"\)/, 'The page reads certifications through the shared normaliser');
for (const file of ['app/(public)/products/[slug]/page.tsx', 'app/crm/categories/categories-manager.tsx']) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.match(text, /normalizeCategoryFilters\(/, `${file} normalises the column instead of trusting the type`);
}

assert.ok(schema.includes(migration.trim()), 'Consolidated schema contains this repair verbatim');
console.log('✅ Category filters: jsonb shapes (map, single object, JSON string, bare options) normalise for the app and the database; /rfq never crashes on them.');
