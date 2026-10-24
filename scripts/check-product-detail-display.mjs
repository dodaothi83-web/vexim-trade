import assert from 'node:assert/strict';

import { parseProductSpecification, productSpecificationKey, publicExportPortDisplay, publicProductMoqDisplay } from '../lib/public/product-detail-display.ts';

const parsed = parseProductSpecification(`Composition: 100% natural cashew nuts
Quality / Grade: Organic, Excellent Grade 1
Size Classification (Grade): W180 / W240 / W320 / W450
Color: Ivory white
Broken Rate: Maximum 5%
Safety Certification: ISO 22000
Production & Processing: Raw and Dried
Shelf Life: 18 months
Storage: Cool dry
Packaging specification: PP vacuum bags / 10kg tin boxes
Minimum Order Quantity (MOQ): 1 Ton`);

assert.equal(parsed.length, 11, 'Every source line remains represented');
assert.equal(parsed.find((row) => row.key === 'size classification (grade)')?.label, 'Available grades');
assert.equal(parsed.find((row) => row.key === 'broken rate')?.value, 'Maximum 5%');
assert.equal(parsed.find((row) => row.key === 'production & processing')?.label, 'Processing');
assert.equal(parsed.find((row) => row.key === 'packaging specification')?.label, 'Packaging options');
assert.deepEqual(parseProductSpecification('Single unstructured note'), [
  { key: 'additional details', label: 'Additional details', value: 'Single unstructured note' },
], 'Unstructured supplier content is preserved');
assert.deepEqual(parseProductSpecification(null), []);
assert.equal(productSpecificationKey('  Minimum   Order Quantity (MOQ) '), 'minimum order quantity (moq)');

assert.equal(publicProductMoqDisplay('1 tấn'), '1 metric ton');
assert.equal(publicProductMoqDisplay('2 tấn'), '2 metric tons');
assert.equal(publicProductMoqDisplay('1 MT'), '1 MT', 'Existing English MOQ stays unchanged');

assert.equal(publicExportPortDisplay('TCTT (Tân Cảng - Cảng Quốc Tế Thị Vải)'),
  'TCTT (Tan Cang - Thi Vai International Port)');
assert.equal(publicExportPortDisplay('Cat Lai Port'), 'Cat Lai Port', 'Unknown ports keep their supplied name');
assert.equal(publicExportPortDisplay(null), '');

console.log('✅ PDP display: structured specification rows, lossless fallback and English port alias.');
