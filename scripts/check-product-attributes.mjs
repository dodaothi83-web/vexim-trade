// node --experimental-strip-types --no-warnings scripts/check-product-attributes.mjs
import assert from 'node:assert/strict';
import { validateProductFields, fieldsFor, saveProductAttributes, publicProductAttributes, attributesFromForm } from '../lib/product-attributes.ts';
const category = { product_fields: validateProductFields([
  { key: 'type', label: 'Type', type: 'select', options: ['Raw', 'Kernels'], filterable: true },
  { key: 'grade', label: 'Grade', type: 'select', options: ['W240', 'W320'], filterable: true, showWhen: { key: 'type', value: 'Kernels' } },
  { key: 'moisture', label: 'Moisture', type: 'text', options: [] },
]) };
assert.equal(fieldsFor(category).length, 3);
assert.throws(() => validateProductFields([{ key: '__proto__', label: 'Unsafe', type: 'text', options: [] }]));
assert.throws(() => validateProductFields([{ key: 'grade', label: 'Grade', type: 'select', options: ['W320', 'W320'] }]));
assert.throws(() => validateProductFields([{ key: 'grade', label: 'Grade', type: 'select', options: ['W320'], showWhen: { key: 'missing', value: 'x' } }]));
assert.throws(() => saveProductAttributes(category, { type: 'Kernels', grade: 'W999' }), /Grade/);
assert.deepEqual(saveProductAttributes(category, { type: 'Raw', grade: 'W320', moisture: '5%' }, { legacy: 'kept' }),
  { legacy: 'kept', type: 'Raw', moisture: '5%' }, 'Hidden grade cannot be saved with raw cashews');
const saved = saveProductAttributes(category, { type: 'Kernels', grade: 'W320', moisture: '5%' }, { legacy: 'kept' });
assert.deepEqual(publicProductAttributes(category, saved), { type: 'Kernels', grade: 'W320', moisture: '5%' });
assert.deepEqual(publicProductAttributes(category, { type: 'Raw', grade: 'W320' }), { type: 'Raw' }, 'Reject stale conditional values');
assert.deepEqual(publicProductAttributes(category, { type: 'Kernels', grade: 'W999' }), { type: 'Kernels' }, 'Reject stale options');
assert.deepEqual(publicProductAttributes({ product_fields: [] }, saved), {}, 'No structured values before Vexim configures a category');
const form = new FormData(); form.set('attribute:type', 'Kernels'); form.set('attribute:grade', 'W320'); form.set('attribute:evil', 'anything');
assert.deepEqual(attributesFromForm(form), { type: 'Kernels', grade: 'W320', evil: 'anything' });
assert.deepEqual(saveProductAttributes(category, attributesFromForm(form)), { type: 'Kernels', grade: 'W320' }, 'Unknown keys never enter product specs');
console.log('✅ Category-defined product attributes: configured options, conditional fields, legacy preservation, safe public projection.');
