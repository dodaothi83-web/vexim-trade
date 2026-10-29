// Read-only: node --experimental-strip-types --no-warnings scripts/audit-legacy-quantity.mjs path/to/products.json
// The input must be a JSON array exported from an isolated staging database.
// Output contains product IDs and original MOQ values; keep it out of Git.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as gradeResolution from '../lib/public/grade-resolution.ts';
import * as priceUnits from '../lib/public/price-units.ts';

function compile(relative, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Intl, console, require: (key) => {
    if (!(key in mocks)) throw Error(`Unexpected import ${key}`);
    return mocks[key];
  } });
  return exports;
}
const grade = compile('../lib/products/grade-pricing.ts', {
  '@/lib/public/grade-resolution': gradeResolution, '@/lib/public/price-units': priceUnits,
});
const audit = compile('../lib/products/legacy-quantity-audit.ts', {
  '@/lib/products/grade-pricing': grade, '@/lib/public/price-units': priceUnits,
});
const file = process.argv[2];
if (!file || process.argv.length !== 3) {
  console.error('Usage: node --experimental-strip-types --no-warnings scripts/audit-legacy-quantity.mjs /path/to/staging-products.json');
  process.exit(2);
}
const records = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(records)) throw Error('Expected a JSON array of product objects');
const rows = audit.auditLegacyQuantityProducts(records);
const report = { products: records.length, rows: rows.length, suggestions: rows.filter((row) => row.candidate).length,
  needsReview: rows.filter((row) => !row.candidate).length, items: rows };
console.log(JSON.stringify(report, null, 2));
