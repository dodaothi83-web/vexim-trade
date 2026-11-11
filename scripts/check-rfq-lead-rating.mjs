// Supplier lead ratings: who may rate, what is stored, and the two promises of the
// feature: the buyer never sees a rating, and a rating changes nothing by itself.
// VM mocks only: no live accounts or Supabase credentials.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const root = path.join(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, console: { ...console, error() {} }, Date, Set, Map, FormData, Promise, String,
      require(id) { assert.ok(id in mocks, `${file}: unexpected ${id}`); return mocks[id]; } },
    { filename: file });
  return mod.exports;
}
const contact = load('lib/rfq/buyer-contact.ts');
const channel = load('lib/rfq/channel.ts');
const rating = load('lib/rfq/lead-rating.ts', { './buyer-contact': contact, './channel': channel });

/* 1. Eligibility: a consented direct RFQ the supplier actually worked on. */
const consent = contact.buyerContactConsentSpec({ company: 'Buyer Co', contact_name: 'Jane',
  email: 'buyer@example.com', phone: null, country: 'VN', website: null, business_type: null },
'2026-11-05T00:00:00Z', 'rfq_form');
const direct = { id: 'r1', buyer_id: 'b1', status: 'matching', specs: consent, source_page: '/products/p1',
  source_product_id: 'p1', preferred_supplier_ids: ['s1'] };
const sourcing = { ...direct, id: 'r2', source_page: '/rfq', source_product_id: null, preferred_supplier_ids: [] };
const invited = { id: 'm1', rfq_id: 'r1', supplier_id: 's1', status: 'sent_to_supplier',
  sent_to_supplier_at: '2026-11-06T00:00:00Z', sent_to_buyer_at: null, quote_price: null, last_thread_message_at: null };
assert.equal(rating.canRateRfqLead(direct, invited), false, 'an invitation alone is no basis for a rating');
assert.equal(rating.canRateRfqLead(direct, { ...invited, quote_price: 9.5 }), true, 'a quote was sent');
assert.equal(rating.canRateRfqLead(direct, { ...invited, last_thread_message_at: '2026-11-07T00:00:00Z' }), true, 'a message was exchanged');
assert.equal(rating.canRateRfqLead(direct, { ...invited, quote_price: 9.5, status: 'not_selected' }), true, 'a closed RFQ can still be rated');
assert.equal(rating.canRateRfqLead(sourcing, { ...invited, rfq_id: 'r2', quote_price: 9.5 }), false, 'sourcing: supplier never dealt with the buyer');
assert.equal(rating.canRateRfqLead({ ...direct, specs: {} }, { ...invited, quote_price: 9.5 }), false, 'no buyer consent');
assert.equal(rating.canRateRfqLead(direct, { ...invited, quote_price: 9.5, sent_to_supplier_at: null }), false, 'never sent');
assert.equal(rating.canRateRfqLead(direct, { ...invited, quote_price: 9.5, status: 'proposed' }), false, 'only proposed');
assert.equal(rating.canRateRfqLead(direct, { ...invited, quote_price: 9.5, rfq_id: 'other' }), false, 'foreign match');

/* 2. Input: three levels; "poor" needs a known reason; other levels store none. */
const clean = (input) => rating.cleanLeadRating({ reasons: [], note: '', ...input });
assert.equal(JSON.stringify(clean({ rating: 'good', reasons: ['spam'], note: '  ok  ' })), JSON.stringify({ ok: true, rating: 'good', reasons: [], note: 'ok' }));
assert.equal(clean({ rating: 'normal' }).note, null);
assert.equal(clean({ rating: '5' }).error, 'rating');
assert.equal(clean({ rating: null }).error, 'rating');
assert.equal(clean({ rating: 'poor' }).error, 'reasons');
assert.equal(clean({ rating: 'poor', reasons: ['price_shopping'] }).error, 'reasons', 'intent cannot be observed: not a reason');
assert.deepEqual([...clean({ rating: 'poor', reasons: ['spam', 'no_reply', 'spam', 'x'] }).reasons], ['no_reply', 'spam']);
assert.equal(clean({ rating: 'good', note: 'x'.repeat(501) }).error, 'note');
assert.equal(rating.leadRatingSerious({ rating: 'poor', reasons: ['no_reply'] }), false);
assert.equal(rating.leadRatingSerious({ rating: 'poor', reasons: ['no_reply', 'fake_identity'] }), true);
assert.deepEqual([...rating.LEAD_RATING_LEVELS], ['good', 'normal', 'poor']);

/* 3. Migration: own table, constraints mirror the app, no client role can read it. */
const sql = read('supabase/migrations/20261118_rfq_lead_ratings.sql');
assert.match(sql, /create table public\.rfq_lead_ratings/);
assert.match(sql, /match_id uuid not null unique references public\.rfq_matches\(id\)/);
assert.match(sql, /rating in \('good', 'normal', 'poor'\)/);
for (const reason of rating.LEAD_RATING_REASONS) assert.ok(sql.includes(`'${reason}'`), `migration knows ${reason}`);
assert.match(sql, /\(rating = 'poor'\) = \(cardinality\(reasons\) > 0\)/);
assert.match(sql, /enable row level security/);
assert.match(sql, /revoke all on public\.rfq_lead_ratings from public, anon, authenticated, service_role/);
assert.match(sql, /grant select, insert, update on public\.rfq_lead_ratings to service_role/);
assert.doesNotMatch(sql, /create policy/, 'no client policy');
assert.doesNotMatch(sql, /alter table public\.(rfqs|rfq_matches|buyers)/, 'buyer-visible tables are untouched');

/* 4. The buyer never sees it: no buyer / public route, buyer component or email names it. */
const NAMES = /lead[-_ ]?rating|LeadRating|rfq_lead_ratings/i;
function walk(dir, out = []) {
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}
const buyerSide = [...walk('app/(public)'), ...walk('app/api/buyer'), ...walk('app/api/public'), ...walk('lib/buyer'), ...walk('lib/email'),
  ...walk('components').filter((file) => /components\/buyer-/.test(file))];
assert.ok(buyerSide.length > 20, 'buyer-side files were found');
for (const file of buyerSide) assert.doesNotMatch(read(file), NAMES, `${file} must not reference lead ratings`);
// The shared projections every buyer page and supplier board is built from stay clean too.
for (const file of ['lib/rfq/portal-core.ts', 'lib/rfq/portal-access.ts', 'lib/supplier-portal/dashboard.ts', 'lib/rfq/buyer-notify.ts'])
  assert.doesNotMatch(read(file), NAMES, `${file} must not project lead ratings`);

/* 5. The action: ownership first, no buyer page revalidated, nothing else written. */
const actions = read('app/supplier/portal/rfqs/[matchId]/actions.ts');
const action = actions.slice(actions.indexOf('export async function supplierLeadRatingAction'));
assert.ok(action.indexOf('supplierOfferAccess(matchId)') < action.indexOf('saveRfqLeadRating'), 'ownership is checked before saving');
assert.ok(action.indexOf('canRateRfqLead(access.rfq, access.match)') < action.indexOf('saveRfqLeadRating'));
assert.match(action, /supplier_id: access\.supplier\.id/, 'supplier comes from the session, not the form');
assert.match(action, /buyer_id: access\.rfq\.buyer_id/);
assert.doesNotMatch(action, /revalidatePath\([^)]*\/buyer\//, 'saving must not refresh a buyer page');
// A rating is a signal for staff only: it must not move a score, a status or an account.
assert.doesNotMatch(action, /updateRfq|updateBuyer|updateRfqMatch|spam_score|send[A-Z]\w*Email|addAuditLog/);
for (const file of ['lib/rfq/lead-rating.ts', 'components/crm/lead-ratings.tsx'])
  assert.doesNotMatch(read(file), /spam_score|updateBuyer|updateRfq\b/, `${file} applies no automatic penalty`);

/* 5b. The action, run against mocks: session supplier only, eligible RFQ only. */
const saved = []; const revalidated = [];
let access = { store: { saveRfqLeadRating: async (row) => { saved.push(row); return row; } }, rfq: direct,
  match: { ...invited, quote_price: 9.5 }, supplier: { id: 's1' }, user: { email: 'owner@example.com' } };
const mod = load('app/supplier/portal/rfqs/[matchId]/actions.ts', {
  'next/cache': { revalidatePath: (p) => revalidated.push(p) },
  '@/lib/rfq/portal-access': { supplierOfferAccess: async (id) => { if (id !== 'm1') throw new Error('NOT_FOUND'); return access; } },
  '@/lib/rfq/portal-core': {}, '@/lib/rfq/portal-conversation': {}, '@/lib/rfq/mediated': {},
  '@/lib/rfq/lead-rating': rating, '@/lib/db/migration-hints': { migrationHint: () => null },
});
const submit = (fields, state = { error: null, saved: false, seq: 0 }) => {
  const fd = new FormData();
  for (const [key, value] of fields) fd.append(key, value);
  return mod.supplierLeadRatingAction(state, fd);
};
await assert.rejects(submit([['match_id', 'someone-else'], ['rating', 'good']]), /NOT_FOUND/);
assert.equal((await submit([['match_id', 'm1'], ['rating', 'poor']])).error, 'reasons');
assert.equal(saved.length, 0);
// A forged supplier / buyer id in the form is ignored.
let result = await submit([['match_id', 'm1'], ['rating', 'poor'], ['reasons', 'spam'], ['note', ' fake site '],
  ['supplier_id', 's9'], ['buyer_id', 'b9']]);
assert.equal(JSON.stringify(result), JSON.stringify({ error: null, saved: true, seq: 1 }));
assert.equal(JSON.stringify(saved[0]), JSON.stringify({ match_id: 'm1', rfq_id: 'r1', supplier_id: 's1', buyer_id: 'b1',
  rating: 'poor', reasons: ['spam'], note: 'fake site', rated_by_email: 'owner@example.com' }));
assert.equal(JSON.stringify(revalidated), JSON.stringify(['/supplier/portal/rfqs/m1', '/crm/rfqs/r1', '/crm/buyers/b1']));
access = { ...access, match: invited };
assert.equal((await submit([['match_id', 'm1'], ['rating', 'good']])).error, 'unavailable');
access = { ...access, match: { ...invited, quote_price: 9.5 }, store: { saveRfqLeadRating: async () => { throw new Error('down'); } } };
result = await submit([['match_id', 'm1'], ['rating', 'good']], { error: null, saved: true, seq: 1 });
assert.equal(JSON.stringify(result), JSON.stringify({ error: 'unknown', saved: false, seq: 1 }));
assert.equal(saved.length, 1);

/* 5c. The real migration in an isolated PostgreSQL (PGlite); no Supabase writes. */
const db = new PGlite();
// As on Supabase: service_role bypasses RLS, the client roles do not.
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec('alter default privileges in schema public grant all on tables to service_role;');
const id = (n) => `${String(n).repeat(8)}-0000-0000-0000-000000000000`;
await db.exec(`
  create table public.buyers (id uuid primary key);
  create table public.suppliers (id uuid primary key);
  create table public.rfqs (id uuid primary key, buyer_id uuid not null references public.buyers(id));
  create table public.rfq_matches (id uuid primary key, rfq_id uuid not null references public.rfqs(id),
    supplier_id uuid not null references public.suppliers(id), sent_to_supplier_at timestamptz);
  insert into public.buyers values ('${id(1)}'), ('${id(2)}');
  insert into public.suppliers values ('${id(3)}'), ('${id(4)}');
  insert into public.rfqs values ('${id(5)}', '${id(1)}');
  insert into public.rfq_matches values ('${id(6)}', '${id(5)}', '${id(3)}', now()), ('${id(7)}', '${id(5)}', '${id(4)}', null);
`);
await db.exec(sql);
const insert = (match, supplier, buyer, level, reasons) => db.query(
  `insert into public.rfq_lead_ratings (match_id, rfq_id, supplier_id, buyer_id, rating, reasons) values ($1,$2,$3,$4,$5,$6)
   on conflict (match_id) do update set rating = excluded.rating, reasons = excluded.reasons returning *`,
  [match, id(5), supplier, buyer, level, reasons]);
await db.exec('set role service_role;');
const first = (await insert(id(6), id(3), id(1), 'poor', ['no_reply'])).rows[0];
const second = (await insert(id(6), id(3), id(1), 'good', [])).rows[0];
assert.equal(second.id, first.id, 'one rating per match: a second save revises it');
assert.equal(second.rating, 'good');
assert.ok(second.updated_at >= first.updated_at && +second.created_at === +first.created_at);
await assert.rejects(insert(id(6), id(3), id(1), 'poor', []), /rfq_lead_ratings_reasons_required/);
await assert.rejects(insert(id(6), id(3), id(1), 'good', ['spam']), /rfq_lead_ratings_reasons_required/);
await assert.rejects(insert(id(6), id(3), id(1), 'poor', ['price_shopping']), /rfq_lead_ratings_reasons_known/);
await assert.rejects(insert(id(6), id(3), id(1), 'bad', []), /rating/);
await assert.rejects(insert(id(6), id(4), id(1), 'good', []), /Invalid RFQ lead rating/, "another supplier's match");
await assert.rejects(insert(id(6), id(3), id(2), 'good', []), /Invalid RFQ lead rating/, 'wrong buyer');
await assert.rejects(insert(id(7), id(4), id(1), 'good', []), /Invalid RFQ lead rating/, 'invitation never sent');
await assert.rejects(db.exec('delete from public.rfq_lead_ratings'), /permission denied/);
for (const role of ['anon', 'authenticated']) {
  await db.exec(`reset role; set role ${role};`);
  await assert.rejects(db.query('select * from public.rfq_lead_ratings'), /permission denied/, `${role} cannot read`);
  await assert.rejects(insert(id(6), id(3), id(1), 'good', []), /permission denied/, `${role} cannot write`);
}
await db.exec('reset role;');
assert.equal((await db.query('select count(*)::int as n from public.rfq_lead_ratings')).rows[0].n, 1);

/* 6. Pages: optional + collapsed for the supplier, staff-only list in the CRM. */
const page = read('app/supplier/portal/rfqs/[matchId]/page.tsx');
assert.match(page, /canRateLead \? await store\.getRfqLeadRating\(match\.id\)/, 'read only after the eligibility check');
assert.match(page, /<LeadRatingForm matchId=\{match\.id\}/);
const form = read('app/supplier/portal/rfqs/lead-rating-form.tsx');
assert.match(form, /<details id="lead-rating"/, 'collapsed by default');
assert.doesNotMatch(form, /<details[^>]* open/);
assert.match(form, /copy\.privacy/);
// React resets a form after its `action` runs; a rejected rating must keep what was entered.
assert.doesNotMatch(form, /<form action=/);
assert.match(form, /<form onSubmit=\{submit\}/);
assert.doesNotMatch(read('app/supplier/portal/rfqs/page.tsx'), NAMES, 'not on the RFQ list: rate after reading the request');
for (const file of ['app/crm/rfqs/[id]/page.tsx', 'app/crm/buyers/[id]/page.tsx']) assert.match(read(file), /LEAD_RATING_STAFF_NOTE/);
assert.match(read('app/crm/buyers/[id]/page.tsx'), /canViewRfqs \? store\.listRfqLeadRatings/);

/* 7. Both policy languages disclose the feedback. */
assert.match(read('app/(legal)/privacy-policy/page.tsx'), /optional feedback on how that request went/);
assert.match(read('app/(legal)/chinh-sach-bao-mat/page.tsx'), /nhận xét không bắt buộc về yêu cầu đó/);

console.log('rfq lead rating: ok');
