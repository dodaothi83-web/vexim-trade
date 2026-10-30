import assert from 'node:assert/strict';

import { parseProductSpecification, productSpecificationKey, publicExportPortDisplay, publicProductMoqDisplay, publicProductPlaceDisplay } from '../lib/public/product-detail-display.ts';

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
assert.equal(publicExportPortDisplay('Nam Đình Vũ'), 'Nam Dinh Vu');
assert.equal(publicExportPortDisplay('  NAM   ĐÌNH VŨ  '), 'Nam Dinh Vu', 'Capitalization and extra spaces match the same port');
assert.equal(publicExportPortDisplay('Nam Đình Vũ'.normalize('NFD')), 'Nam Dinh Vu', 'Decomposed accents are recognized');
assert.equal(publicExportPortDisplay('Cảng Nam Đình Vũ'), 'Nam Dinh Vu Port');
assert.equal(publicExportPortDisplay('Nam Đình Vũ Port'), 'Nam Dinh Vu Port');
assert.equal(publicExportPortDisplay('Nam Đình Vũ (Hải Phòng)'), 'Nam Dinh Vu (Hai Phong)');
assert.equal(publicExportPortDisplay('Nam Đình Vũ, Cát Lái / Hải Phòng'), 'Nam Dinh Vu, Cat Lai / Hai Phong');
assert.equal(publicExportPortDisplay('TCTT (Tân Cảng - Cảng Quốc Tế Thị Vải), Nam Đình Vũ'),
  'TCTT (Tan Cang - Thi Vai International Port), Nam Dinh Vu', 'A TCTT alias does not swallow other listed ports');
assert.equal(publicExportPortDisplay('TCTT (Tân Cảng - Cảng Quốc Tế Thị Vải) (Hải Phòng)'),
  'TCTT (Tan Cang - Thi Vai International Port) (Hai Phong)', 'Locations after TCTT are not lost');
assert.equal(publicExportPortDisplay('TCTT (Cảng khác tại Thị Vải)'), 'TCTT (Cảng khác tại Thị Vải)',
  'An unrecognized TCTT description is not replaced with a guessed port');
assert.equal(publicProductPlaceDisplay('Đà Nẵng'), 'Da Nang', 'Vietnamese Đ is a letter, not a removable accent');
assert.equal(publicProductPlaceDisplay('Đắk Lắk'), 'Dak Lak');
assert.equal(publicExportPortDisplay('Nam Hải Đình Vũ'), 'Nam Hai Dinh Vu', 'A similarly named port stays distinct from Nam Dinh Vu');
assert.equal(publicExportPortDisplay('Cảng Nam Hải Đình Vũ'), 'Nam Hai Dinh Vu Port');
assert.equal(publicExportPortDisplay('Đình Vũ'), 'Dinh Vu');
assert.equal(publicExportPortDisplay('Cảng Cát Lái'), 'Cat Lai Port');
assert.equal(publicExportPortDisplay('Cảng Hải Phòng'), 'Hai Phong Port');
assert.equal(publicExportPortDisplay('Cat Lai Port'), 'Cat Lai Port', 'Existing English port names stay unchanged');
assert.equal(publicExportPortDisplay('Cảng Chưa Biết'), 'Cảng Chưa Biết', 'Unknown Vietnamese names are not guessed');
assert.equal(publicExportPortDisplay(null), '');

console.log('✅ PDP display: structured specification rows, lossless fallback and English port aliases.');
