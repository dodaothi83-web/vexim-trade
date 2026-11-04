import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: mod, exports: mod.exports, URL, Date,
    require: (id) => { assert.ok(id in mocks, id); return mocks[id]; },
  });
  return mod.exports;
}
const comparison = load('lib/public/product-comparison.ts');
const verification = load('lib/verification-status.ts');
const { comparisonPdfDefinition, COMPARISON_PDF_MARGIN: margin } = load('lib/public/product-comparison-pdf.ts', {
  '@/lib/public/product-comparison': comparison, '@/lib/verification-status': verification,
});
const pdfMake = require('pdfmake/build/pdfmake');
pdfMake.addVirtualFileSystem(require('pdfmake/build/vfs_fonts'));
const base = {
  id: 'one', name: 'Hạt điều Việt Nam', href: '/products/cashew/one', categorySlug: 'cashew', categoryName: 'Cashew kernels',
  supplierName: 'Công ty Đại Việt', grade: 'W320', specifications: [{ key: 'size', label: 'Size', value: 'Whole kernels' }],
  price: '$1,500/MT', priceCurrency: 'USD', priceUnit: 'MT', priceValidUntil: '2026-12-01', moq: '1 MT', packaging: 'Vacuum bags',
  leadTimeDays: 15, incoterm: 'FOB', incotermPlace: 'Ho Chi Minh City', exportPort: 'Cat Lai', monthlyCapacity: '50 MT',
  paymentTerms: 'Confirm with supplier', oem: true, odm: false, samples: true, province: 'Hanoi', rawMaterialRegion: 'Binh Phuoc', inputMaterialOrigin: 'Vietnam',
  verificationSteps: [1, 2], l2Scope: 'partner_contract', certificates: [{ name: 'Food safety', validUntil: '2027-01-01', holderMatch: 'owner' }],
};
async function check(products, stress = false) {
  const definition = comparisonPdfDefinition(products, 'https://veximtrade.com', new Date('2026-11-04T00:00:00Z'));
  assert.equal(definition.pageSize, 'A4');
  assert.equal(definition.pageOrientation, 'landscape');
  assert.ok(definition.pageMargins.every((m) => Math.abs(m - 42.52) < 0.01));
  const buffer = await pdfMake.createPdf(definition).getBuffer();
  assert.ok(buffer.subarray(0, 5).toString().startsWith('%PDF-'));
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: false });
  const pdf = await task.promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    assert.ok(Math.abs(viewport.width - 841.89) < 1);
    assert.ok(Math.abs(viewport.height - 595.28) < 1);
    const content = await page.getTextContent();
    const items = content.items.filter((item) => item.str?.trim());
    assert.ok(items.length > 5, 'No blank/trailing page');
    for (const item of items) {
      const [,,,, x, y] = item.transform;
      assert.ok(x >= margin - 1, `Left clipping on page ${i}: ${item.str}`);
      assert.ok(x + item.width <= viewport.width - margin + 1, `Right clipping on page ${i}: ${item.str}`);
      assert.ok(y >= 15 && y + item.height <= viewport.height - 10, `Vertical overflow: ${item.str}`);
      const furniture = item.str === 'Vexim Trade | Product comparison' || item.str === 'veximtrade.com' || /^\d+ \/ \d+$/.test(item.str);
      if (!furniture) assert.ok(y >= margin - 1 && y <= viewport.height - margin + 1, `Content outside body margins: ${item.str}`);
    }
    const pageText = items.map((item) => item.str).join(' ');
    assert.ok(pageText.includes(`${i} / ${pdf.numPages}`), 'Page numbering');
    assert.ok(pageText.includes('Criterion'), 'Repeated table column headers');
    text += pageText + '\n';
  }
  assert.ok(text.includes('Hạt điều Việt Nam'), 'Embedded font preserves Vietnamese');
  assert.ok(text.includes('Công ty Đại Việt'));
  assert.ok(text.includes('Payment terms'));
  assert.ok(text.includes('They do not certify these products or a specific lot.'));
  if (stress) {
    assert.ok(pdf.numPages > 3, 'Long content paginates');
    assert.ok(text.includes('END-LONG-CELL'), 'Oversized cell is not truncated');
    assert.ok(text.includes('LAST-SPEC-ROW'), 'Final specification survives pagination');
  }
  console.log(`✓ ${products.length}-product ${stress ? 'stress' : 'normal'} PDF: ${pdf.numPages} A4 pages, Unicode, repeated headers and bounded content.`);
  if (process.env.COMPARISON_PDF_SAMPLE && stress) writeFileSync(process.env.COMPARISON_PDF_SAMPLE, buffer);
  await task.destroy();
}
await check([base, { ...base, id: 'two', href: '/products/cashew/two' }]);
await check([base, { ...base, id: 'two', price: null, categorySlug: 'coffee' }, { ...base, id: 'three', priceUnit: 'kg' }]);
const longSpecifications = Array.from({ length: 35 }, (_, i) => ({ key: `spec-${i}`, label: `Specification ${i}`, value: i === 34 ? 'LAST-SPEC-ROW' : Array(12).fill('Long specification text').join(' ') }));
longSpecifications.unshift({ key: 'oversized', label: 'Oversized cell', value: Array(500).fill('Long cell content').join(' ') + ' END-LONG-CELL' });
await check([base, { ...base, id: 'two', specifications: longSpecifications }, { ...base, id: 'three' }], true);
assert.throws(() => comparisonPdfDefinition([base], 'https://veximtrade.com'));
const source = readFileSync(new URL('../components/download-comparison-pdf.tsx', import.meta.url), 'utf8');
assert.match(source, /import\("pdfmake\/build\/pdfmake"\)/, 'Renderer is lazy-loaded');
assert.match(source, /finally \{ setBusy\(false\)/, 'Failure allows retry');
