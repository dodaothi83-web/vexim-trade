// node scripts/check-legacy-split-dependencies.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/legacy-split-dependencies.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, Number, Set, console });
const { assessSplitDependencies, SPLIT_DEPENDENCIES, SPLIT_PROVISIONAL_WRITE_TABLES } = exports;
const optional = new Set(['product_form_drafts', 'product_form_submissions']);
const counts = Object.fromEntries(Array.from(SPLIT_DEPENDENCIES, (name) => [name, optional.has(name) ? null : 0]));
const columns = [
  { schema: 'public', table: 'media_assets', column: 'product_id' },
  { schema: 'public', table: 'rfqs', column: 'source_product_id' },
  { schema: 'public', table: 'certificates', column: 'requested_product_ids' },
  { schema: 'public', table: 'certificates', column: 'approved_product_ids' },
  ...Array.from(SPLIT_DEPENDENCIES).filter((name) => !optional.has(name)).map((table) => ({ schema: 'public', table, column: 'product_id' })),
];
const issues = (x, y) => Array.from(assessSplitDependencies(x, y));
assert.equal(issues(counts, columns).length, 0);
const related = { ...counts, product_quantity_price_revisions: 1 };
assert.equal(issues(related, columns).find((i) => i.code === 'linked_records').relation, 'public.product_quantity_price_revisions');
const missing = { ...counts }; delete missing.sponsored_requests;
assert.ok(issues(missing, columns).some((i) => i.code === 'missing_inventory' && i.relation === 'public.sponsored_requests'));
assert.ok(issues({ ...counts, sponsored_requests: null }, columns).some((i) => i.code === 'missing_inventory'));
assert.ok(issues({ ...counts, sponsored_requests: -1 }, columns).some((i) => i.code === 'missing_inventory'));
assert.ok(issues(counts, [...columns, { schema: 'private', table: 'linked', column: 'product_id' }]).some((i) => i.code === 'unknown_reference'));
assert.ok(issues(counts, []).some((i) => i.code === 'missing_inventory'), 'An incomplete schema inventory is not treated as zero');
assert.ok(issues({ ...counts, product_form_drafts: 0 }, columns).some((i) => i.code === 'missing_inventory'));
assert.ok(issues(counts, [...columns, { schema: 'public', table: 'product_form_drafts', column: 'product_id' }]).some((i) => i.code === 'missing_inventory'));
assert.equal(issues({ ...counts, product_form_drafts: 0 }, [...columns, { schema: 'public', table: 'product_form_drafts', column: 'product_id' }]).length, 0);
assert.deepEqual(Array.from(SPLIT_PROVISIONAL_WRITE_TABLES), ['public.supplier_products', 'public.media_assets', 'public.rfqs', 'public.certificates', 'public.audit_log', 'storage.objects']);
console.log('Split dependencies: complete reference inventory, absent optional tables and fail-closed linked records passed');
