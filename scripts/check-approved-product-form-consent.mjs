// node --experimental-strip-types --no-warnings scripts/check-approved-product-form-consent.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as matching from '../lib/products/product-form-price-consent.ts';
const productId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', supplierId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', revisionId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const other = 'dddddddd-dddd-dddd-dddd-dddddddddddd', submissionId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const candidate = { productId, supplierId, priceRevision: { id: revisionId, product_id: productId, status: 'approved' } };
const row = { id: submissionId, product_id: productId, supplier_id: supplierId, status: 'approved', approved_price_revision_id: revisionId,
  price_consent: true, price_publicly_visible: true };
let rows = [], error = null, dbAvailable = true, queryCount = 0, selected = '';
const db = { from(table) { assert.equal(table, 'product_form_submissions'); let batch = [];
  return { select(value) { selected = value; return this; }, eq(key, value) { assert.equal(key, 'status'); assert.equal(value, 'approved'); return this; },
    in(key, value) { assert.equal(key, 'product_id'); batch = value; return this; }, order() { return this; },
    async range(start, end) { queryCount++; return { data: rows.filter((r) => batch.includes(r.product_id)).slice(start, end + 1), error }; } }; } };
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/approved-product-form-consent.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, Map, Set, Array, Object, require: (key) => {
  if (key === 'server-only') return {};
  if (key === '@/lib/db/supabase') return { getSupabaseClient: () => dbAvailable ? db : null };
  if (key === '@/lib/products/product-form-price-consent') return matching;
  throw Error(`Unexpected ${key}`);
} });
const read = exports.readApprovedFormPriceConsents;
assert.equal((await read([])).size, 0); assert.equal(queryCount, 0);
let result = await read([candidate]); assert.equal(result.get(productId), null, 'Legacy product has no form consent');
rows = [row]; result = await read([candidate]); assert.equal(result.get(productId), true);
let publication = (await exports.readApprovedFormPublications([candidate])).get(productId);
assert.equal(publication.submissionId, submissionId); assert.equal(publication.priceConsent, true);
rows = [{ ...row, id: 'bad' }]; publication = (await exports.readApprovedFormPublications([candidate])).get(productId);
assert.equal(publication.submissionId, null); assert.equal(publication.priceConsent, false); rows = [row];
assert.ok(selected.includes('price_consent:payload->priceConsent')); assert.doesNotMatch(selected, /(?:^|,)payload(?:,|$)/, 'Do not read full private payload');
rows = [{ ...row, price_consent: false }]; assert.equal((await read([candidate])).get(productId), false);
rows = [{ ...row, supplier_id: other }]; assert.equal((await read([candidate])).get(productId), false);
rows = [{ ...row, approved_price_revision_id: other }]; assert.equal((await read([candidate])).get(productId), false);
rows = [row, row]; await assert.rejects(() => read([candidate]), /Duplicate/);
rows = Array.from({ length: 501 }, (_, index) => ({ ...row, approved_price_revision_id: index === 500 ? revisionId : other }));
queryCount = 0; result = await read([candidate]); assert.equal(result.get(productId), true); assert.equal(queryCount, 2, 'No silent PostgREST page truncation');
await assert.rejects(() => read([{ ...candidate, priceRevision: { ...candidate.priceRevision, product_id: other } }]), /owner/);
await assert.rejects(() => read([{ ...candidate, priceRevision: { ...candidate.priceRevision, status: 'pending' } }]), /Invalid/);
await assert.rejects(() => read([candidate, { ...candidate, supplierId: other }]), /Conflicting/);
error = new Error('unavailable'); await assert.rejects(() => read([candidate]), /unavailable/); error = null;
dbAvailable = false; await assert.rejects(() => read([candidate]), /unavailable/);
console.log('Approved form consent reader: private flag projection, exact link, pagination and fail-closed DB errors passed');
