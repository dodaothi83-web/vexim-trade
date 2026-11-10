// node scripts/check-rfq-contact-attachment.mjs
// Per-request consent and compare-and-set Buyer CRM linkage after *real* delivery.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, mocks = {}) {
  const mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Date, Set, console,
    require(id) { assert.ok(id in mocks, `Unexpected import ${id} in ${path}`); return mocks[id]; },
  }, { filename: path });
  return mod.exports;
}
const consent = load('lib/rfq/buyer-contact.ts');
const channel = load('lib/rfq/channel.ts');
const { attachBuyerAfterDirectRfqDelivery: attach } = load('lib/rfq/attach-buyer.ts', {
  './channel': channel, './buyer-contact': consent,
});
const contact = { company: 'Iraivan Traders', contact_name: 'Ira', email: 'IRA@BUYER.EXAMPLE',
  phone: '+84 123', country: 'IN', website: 'buyer.example', business_type: 'Trading company',
  access_token: 'NEVER', notes: 'PRIVATE CRM' };
const grant = consent.buyerContactConsentSpec(contact, '2026-11-09T10:00:00Z', 'rfq_form');
assert.equal(grant.buyer_contact_policy_version, 'rfq_contact_v2');
assert.equal(grant.buyer_contact.email, 'ira@buyer.example');
assert.equal(Object.keys(grant.buyer_contact).length, 7, 'Only public RFQ contact fields enter the snapshot');
assert.doesNotMatch(JSON.stringify(grant), /NEVER|PRIVATE CRM/);
const direct = { id: 'rfq-ira', code: 'RFQ-20261110-00001', buyer_id: 'ira', status: 'matching',
  source_page: '/rfq', source_product_id: 'product-hm', preferred_supplier_ids: ['hm'], specs: grant };
assert.equal(consent.rfqBuyerContact(direct, 'hm').email, 'ira@buyer.example');
assert.equal(consent.rfqBuyerContact(direct, 'suggested'), null, 'Not even a sent suggested supplier inherits a named supplier grant');
assert.equal(consent.rfqBuyerContact({ ...direct, preferred_supplier_ids: [] }, 'hm'), null, 'A product RFQ without a named supplier is fail-closed');
for (const invalid of [
  { ...grant, buyer_contact_policy_version: 'v1' },
  { ...grant, buyer_contact_consent_at: 'not-a-date' },
  { ...grant, buyer_contact_consent_source: 'staff' },
  { ...grant, buyer_contact_supplier_ids: ['hm'] },
  { ...grant, buyer_contact: { ...grant.buyer_contact, email: '' } },
]) assert.equal(consent.rfqBuyerContact({ ...direct, specs: invalid }, 'hm'), null, 'Incomplete/forged consent is not valid');
const historical = { ...grant, buyer_contact_consent_source: 'confirmed_by_buyer', buyer_contact_supplier_ids: ['hm'] };
assert.equal(consent.rfqBuyerContact({ ...direct, specs: historical }, 'hm').email, 'ira@buyer.example');
assert.equal(consent.rfqBuyerContact({ ...direct, specs: historical }, 'other'), null);
assert.equal(consent.rfqBuyerContact({ ...direct, preferred_supplier_ids: ['other'], specs: historical }, 'hm').email, 'ira@buyer.example',
  'A separately confirmed recipient can be added to a historical direct request');

let match = { id: 'match-hm', rfq_id: direct.id, supplier_id: 'hm',
  status: 'sent_to_supplier', sent_to_supplier_at: '2026-11-10T04:07:12Z' };
let buyer = { id: 'ira', supplier_id: null, hide_buyer_from_supplier: true,
  stage: 'lead', owner: 'existing staff', notes: 'STAFF ONLY', cc_emails: 'internal@example.com' };
let casCalls = [], activities = [], loseRace = false;
const store = {
  getRfqMatch: async () => match,
  getBuyer: async () => buyer,
  attachBuyerIfUnassigned: async (buyerId, supplierId) => {
    casCalls.push([buyerId, supplierId]);
    if (loseRace) { buyer.supplier_id = 'other'; return false; }
    if (buyer.supplier_id !== null) return false;
    buyer.supplier_id = supplierId;
    return true;
  },
  addActivity: async (activity) => { activities.push(activity); },
};
const denied = async (rfq, m = match) => {
  const before = casCalls.length; match = m;
  assert.equal(await attach(store, rfq, match.id), false);
  assert.equal(casCalls.length, before, 'A prohibited attachment never writes CRM');
};
await denied(direct, { ...match, sent_to_supplier_at: null });
await denied(direct, { ...match, status: 'proposed' });
await denied(direct, { ...match, rfq_id: 'different-rfq' });
await denied(direct, { ...match, supplier_id: 'other' });
await denied({ ...direct, preferred_supplier_ids: [] });
await denied({ ...direct, preferred_supplier_ids: ['hm', 'other'] });
await denied({ ...direct, specs: { ...grant, sourcing_request_id: 'request-1' } });
await denied({ ...direct, specs: {} });
await denied({ ...direct, specs: { ...grant, buyer_contact_policy_version: 'old' } });
match = { ...match, supplier_id: 'hm', rfq_id: direct.id, status: 'sent_to_supplier', sent_to_supplier_at: '2026-11-10T04:07:12Z' };
assert.equal(await attach(store, direct, match.id), true);
assert.deepEqual(casCalls, [['ira', 'hm']]);
assert.equal(buyer.supplier_id, 'hm');
assert.equal(buyer.hide_buyer_from_supplier, true, 'A per-RFQ grant must not flip the legacy global CRM hide flag');
assert.equal(buyer.owner, 'existing staff'); assert.equal(buyer.stage, 'lead');
assert.equal(buyer.notes, 'STAFF ONLY'); assert.equal(buyer.cc_emails, 'internal@example.com');
assert.equal(activities.length, 1, 'One CRM activity; never send a second connection email');
assert.equal(await attach(store, direct, match.id), false, 'Idempotent replay');
assert.equal(casCalls.length, 1); assert.equal(activities.length, 1);
buyer.supplier_id = 'other';
await denied(direct);
buyer.supplier_id = null; loseRace = true;
assert.equal(await attach(store, direct, match.id), false, 'A concurrent assignment wins');
assert.equal(buyer.supplier_id, 'other'); assert.equal(activities.length, 1);
loseRace = false; buyer.supplier_id = null;
assert.equal(await attach(store, { ...direct, specs: historical }, match.id), true, 'Historical one-supplier RFQ attaches after its scoped separate consent');
assert.equal(activities.length, 2);

// Production uses an atomic SQL compare-and-set; local simulation must not unhide CRM.
const remote = readFileSync(new URL('../lib/db/supabase.ts', import.meta.url), 'utf8');
const local = readFileSync(new URL('../lib/db/local.ts', import.meta.url), 'utf8');
const remoteCas = remote.match(/async attachBuyerIfUnassigned\([\s\S]*?\n  },/)?.[0];
const localCas = local.match(/async attachBuyerIfUnassigned\([\s\S]*?\n  },/)?.[0];
assert.ok(remoteCas?.includes('.is("supplier_id", null)') && remoteCas.includes('.eq("id", buyerId)'));
assert.ok(localCas?.includes('if (!buyer || buyer.supplier_id) return false;'));
assert.doesNotMatch(remoteCas + localCas, /hide_buyer_from_supplier|sendSupplierAssignedEmail/, 'Linking must not disclose other CRM data or send duplicate mail');
console.log('✅ RFQ buyer contact/CRM: direct + explicit historical grants only, sent match before atomic single-supplier link; no proposals, foreign link, legacy flag change or duplicate mail.');
