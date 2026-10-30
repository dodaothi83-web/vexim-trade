// node --experimental-strip-types --no-warnings scripts/check-product-form-price-consent.mjs
import assert from 'node:assert/strict';
import { approvedFormPriceConsent as consent } from '../lib/products/product-form-price-consent.ts';
const priceRevision = { id: 'revision-1', product_id: 'product-1', status: 'approved' };
const record = { product_id: 'product-1', supplier_id: 'supplier-1', status: 'approved', approved_price_revision_id: 'revision-1',
  price_consent: true, price_publicly_visible: true };
const args = { record, productId: 'product-1', supplierId: 'supplier-1', priceRevision };
assert.equal(consent(args), true);
for (const override of [{ price_consent: false }, { price_consent: null }, { price_consent: 'true' }, { price_publicly_visible: false },
  { supplier_id: 'other' }, { product_id: 'other' }, { status: 'pending' }]) assert.equal(consent({ ...args, record: { ...record, ...override } }), false);
assert.equal(consent({ ...args, priceRevision: { ...priceRevision, status: 'pending' } }), false);
assert.equal(consent({ ...args, record: null }), null, 'Legacy offers keep their existing consent policy');
assert.equal(consent({ ...args, record: { ...record, approved_price_revision_id: 'old-revision' } }), false, 'An older form cannot authorize a newer price or fall back to legacy');
assert.equal(consent({ ...args, priceRevision: null }), false, 'A form without an approved price cannot authorize display');
console.log('Form price consent: exact approved revision and supplier binding, legacy fallback and fail-closed proof passed');
