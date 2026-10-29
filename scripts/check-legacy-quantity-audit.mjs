// node --experimental-strip-types --no-warnings scripts/check-legacy-quantity-audit.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const dir = mkdtempSync(join(tmpdir(), 'vexim-audit-'));
try {
  const base = { currency: 'USD', unit: 'kg', incoterm: 'FOB', ref_price: 6.4, ref_price_max: 6.8, specs: { grade: 'W320' } };
  const products = [
    { ...base, id: 'good', moq: '1000 kg' },
    { ...base, id: 'bags', moq: '40 bags x 25 kg' },
    { ...base, id: 'bad-moq', moq: 'Full container' },
    { ...base, id: 'ambiguous', moq: '1,000 kg' },
    { ...base, id: 'missing-weight', moq: '100 bags' },
    { ...base, id: 'fractional', moq_qty: 0.99, moq_unit: 'kg' },
    { ...base, id: 'precision', unit: 'MT', ref_price: 6401, moq: '1 MT' },
    { ...base, id: 'bad-currency', currency: 'VND', moq: '1000 kg' },
    { ...base, id: 'multi', specs: { grade_rows: [
      { grade: 'W320', price_min: 6.4, price_max: 6.8, incoterm: 'FOB', moq: '1000 kg' },
      { grade: 'W240', price_min: 7, price_max: 7.2, incoterm: 'CIF', moq: '2000 kg' },
    ] } },
  ];
  const file = join(dir, 'products.json'); writeFileSync(file, JSON.stringify(products));
  const report = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'scripts/audit-legacy-quantity.mjs', file], { encoding: 'utf8' }));
  const find = (id) => report.items.filter((item) => item.productId === id);
  assert.equal(report.products, 9); assert.equal(report.rows, 10);
  assert.equal(find('good')[0].candidate.quantityKg, 1000);
  assert.equal(find('good')[0].candidate.priceUsdPerKg, 6.4, 'Use the lower historical price');
  assert.equal(find('bags')[0].candidate.quantityKg, 1000);
  for (const id of ['bad-moq', 'ambiguous', 'missing-weight', 'fractional', 'precision', 'bad-currency']) assert.equal(find(id)[0].candidate, null, id);
  assert.equal(find('multi').length, 2); assert.equal(find('multi')[1].candidate.grade, 'W240');
  console.log('Legacy quantity audit: read-only inventory, per-grade suggestions and ambiguous data checks passed');
} finally { rmSync(dir, { recursive: true, force: true }); }
