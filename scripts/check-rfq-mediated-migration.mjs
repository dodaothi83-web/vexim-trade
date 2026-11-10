// Apply BOTH real RFQ migrations in isolated PostgreSQL; no Supabase writes.
// Verifies the two private desks, atomic append/outbox, consent, historical
// direct chat, read guards and default Supabase service_role table grants.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const fixture = {
  buyer: '11111111-1111-1111-1111-111111111111', supplier: '22222222-2222-2222-2222-222222222222',
  other: '33333333-3333-3333-3333-333333333333', source: '44444444-4444-4444-4444-444444444444',
  sourcing: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', restricted: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  missing: 'cccccccc-cccc-cccc-cccc-cccccccccccc', direct: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  question: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', closed: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  legacy: '99999999-9999-9999-9999-999999999999', legacyInvite: '90000000-0000-0000-0000-000000000001',
  invite: 'a0000000-0000-0000-0000-000000000001', extra: 'a0000000-0000-0000-0000-000000000002',
  restrictedInvite: 'b0000000-0000-0000-0000-000000000001', restrictedOther: 'b0000000-0000-0000-0000-000000000002',
  missingInvite: 'c0000000-0000-0000-0000-000000000001', directInvite: 'd0000000-0000-0000-0000-000000000001',
  questionInvite: 'e0000000-0000-0000-0000-000000000001', closedInvite: 'f0000000-0000-0000-0000-000000000001',
};
for (const role of ['anon', 'authenticated', 'service_role']) await db.exec(`create role ${role};`);
await db.exec('alter default privileges in schema public grant all on tables to service_role;');
await db.exec(`
  create table public.rfqs (
    id uuid primary key, code text not null, buyer_id uuid not null, status text not null,
    source_page text, source_product_id uuid, preferred_supplier_ids uuid[] not null default '{}',
    specs jsonb not null default '{}', first_response_at timestamptz, updated_at timestamptz default now()
  );
  create table public.rfq_matches (
    id uuid primary key, rfq_id uuid not null references public.rfqs(id), supplier_id uuid not null,
    status text not null, sent_to_supplier_at timestamptz, quote_price numeric(14,2),
    quote_currency text, quote_unit text, quote_incoterm text, quote_lead_time_days integer,
    quote_valid_until date, sent_to_buyer_at timestamptz, internal_note text, updated_at timestamptz default now()
  );
  create function public.touch_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at := now(); return new; end;
  $$;
  create trigger rfq_matches_touch before update on public.rfq_matches
    for each row execute function public.touch_updated_at();
`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261116_rfq_portal_conversations.sql', import.meta.url), 'utf8'));
const consent = (version = 'rfq_mediated_v1', source = 'rfq_form', allowed) => JSON.stringify({
  buyer_contact_policy_version: version, buyer_contact_consent_source: source,
  buyer_contact_consent_at: '2026-11-04T00:00:00Z',
  buyer_contact: { company: 'Company', email: 'buyer@example.com' },
  ...(allowed && { buyer_contact_supplier_ids: allowed }),
});
const addRfq = async (id, status, page, product, preferred, specs) => db.query(
  'insert into public.rfqs (id,code,buyer_id,status,source_page,source_product_id,preferred_supplier_ids,specs) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
  [id, 'RFQ-TEST', fixture.buyer, status, page, product, preferred, specs]);
const addMatch = async (id, rfqId, supplierId, status = 'sent_to_supplier', sent = '2026-11-04T00:00:00Z', presented = null) => db.query(
  'insert into public.rfq_matches (id,rfq_id,supplier_id,status,sent_to_supplier_at,sent_to_buyer_at) values ($1,$2,$3,$4,$5,$6)',
  [id, rfqId, supplierId, status, sent, presented]);
await addRfq(fixture.sourcing, 'matching', '/rfq', null, [], consent());
await addRfq(fixture.restricted, 'matching', '/rfq', null, [], consent('rfq_mediated_v1', 'confirmed_by_buyer', [fixture.supplier]));
await addRfq(fixture.missing, 'matching', '/rfq', null, [], JSON.stringify({
  buyer_contact_consent_source: 'rfq_form', buyer_contact_consent_at: '2026-11-04T00:00:00Z',
  buyer_contact: { email: 'buyer@example.com' }, // missing policy must NOT pass SQL NULL comparison
}));
await addRfq(fixture.direct, 'matching', '/products', fixture.source, [fixture.supplier], consent('rfq_contact_v2'));
await addRfq(fixture.question, 'matching', '/rfq?intent=question', null, [fixture.supplier], consent('rfq_contact_v2'));
await addRfq(fixture.closed, 'won', '/rfq', null, [], consent());
await addRfq(fixture.legacy, 'quoted', '/rfq', null, [], consent('rfq_contact_v2', 'sourcing_form'));
await addMatch(fixture.legacyInvite, fixture.legacy, fixture.supplier, 'presented_to_buyer', '2026-11-04T00:00:00Z', '2026-11-05T00:00:00Z');
await addMatch(fixture.invite, fixture.sourcing, fixture.supplier, 'presented_to_buyer', '2026-11-04T00:00:00Z', '2026-11-05T00:00:00Z');
await addMatch(fixture.extra, fixture.sourcing, fixture.other, 'proposed', null);
await addMatch(fixture.restrictedInvite, fixture.restricted, fixture.supplier);
await addMatch(fixture.restrictedOther, fixture.restricted, fixture.other);
await addMatch(fixture.missingInvite, fixture.missing, fixture.supplier);
await addMatch(fixture.directInvite, fixture.direct, fixture.supplier);
await addMatch(fixture.questionInvite, fixture.question, fixture.supplier);
await addMatch(fixture.closedInvite, fixture.closed, fixture.supplier);
// The old sourcing direct exchange was once permitted after presentation: it must
// stay readable in the historical table, but new inserts will be rejected.
await db.query("insert into public.rfq_thread_messages(match_id,sender,sender_email,body) values ($1,'buyer','buyer@example.com','Older conversation')", [fixture.legacyInvite]);
await db.exec(readFileSync(new URL('../supabase/migrations/20261117_rfq_vexim_mediation.sql', import.meta.url), 'utf8'));
const rows = (sql, args = []) => db.query(sql, args).then((result) => result.rows);
const count = (table) => rows(`select count(*)::int as n from public.${table}`).then((r) => r[0].n);
const grants = (await rows(`select
  has_table_privilege('anon','public.rfq_mediated_messages','SELECT') as anon_messages,
  has_table_privilege('authenticated','public.rfq_mediated_threads','SELECT') as auth_threads,
  has_table_privilege('service_role','public.rfq_mediated_messages','SELECT') as service_messages,
  has_table_privilege('service_role','public.rfq_mediated_messages','INSERT') as service_insert,
  has_table_privilege('service_role','public.rfq_mediated_threads','UPDATE') as service_thread_update,
  has_table_privilege('service_role','public.rfq_mediated_alerts','UPDATE') as service_alert_update,
  has_table_privilege('service_role','public.rfq_mediated_alerts','DELETE') as service_alert_delete,
  has_function_privilege('anon','public.post_rfq_mediated_message(uuid,uuid,text,text,text)','EXECUTE') as anon_post,
  has_function_privilege('service_role','public.post_rfq_mediated_message(uuid,uuid,text,text,text)','EXECUTE') as service_post,
  has_function_privilege('authenticated','public.mark_rfq_mediated_read(uuid,text,timestamptz)','EXECUTE') as auth_read
`))[0];
assert.deepEqual(grants, { anon_messages: false, auth_threads: false, service_messages: true, service_insert: false,
  service_thread_update: false, service_alert_update: true, service_alert_delete: false, anon_post: false, service_post: true, auth_read: false });
for (const table of ['rfq_mediated_threads', 'rfq_mediated_messages', 'rfq_mediated_alerts']) {
  assert.equal((await rows('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`]))[0].relrowsecurity, true);
}
const post = (rfq, match, sender, body) => rows('select thread_id,sender,body,created_at from public.post_rfq_mediated_message($1,$2,$3,$4,$5)',
  [rfq, match, sender, `${sender}@example.com`, body]);
const one = await post(fixture.sourcing, null, 'buyer', 'Ask Vexim about prices');
assert.equal(one[0].thread_id, fixture.sourcing);
await post(fixture.sourcing, null, 'staff', 'We will invite suppliers.');
const supplier = await post(fixture.sourcing, fixture.invite, 'supplier', 'Quote details for Vexim only');
assert.equal(supplier[0].thread_id, fixture.invite);
await post(fixture.sourcing, fixture.invite, 'staff', 'Please clarify your grade.');
await assert.rejects(post(fixture.sourcing, fixture.invite, 'staff', 'Buyer email buyer@example.com'), /RFQ desk contact details not allowed/);
assert.equal(await count('rfq_mediated_threads'), 2, 'One buyer desk and one invited-supplier desk');
assert.equal(await count('rfq_mediated_alerts'), 4, 'Each message creates exactly one delayed outbox event');
assert.equal((await rows('select recipient from public.rfq_mediated_alerts where thread_id=$1 order by event_at', [fixture.invite]))[0].recipient, 'staff');
assert.equal((await rows('select count(*)::int as n from public.rfq_thread_messages'))[0].n, 1, 'Historical conversation preserved');
const reject = async (args, pattern) => assert.rejects(post(...args), pattern);
await reject([fixture.sourcing, null, 'supplier', 'Wrong desk'], /Buyer desk only/);
await reject([fixture.sourcing, fixture.invite, 'buyer', 'Wrong desk'], /Supplier desk only/);
await reject([fixture.sourcing, fixture.extra, 'supplier', 'Not invited'], /Supplier not invited/);
await reject([fixture.sourcing, fixture.directInvite, 'supplier', 'Wrong RFQ'], /Supplier not invited/);
await reject([fixture.restricted, fixture.restrictedOther, 'supplier', 'Not explicitly confirmed'], /RFQ recipient not confirmed/);
await post(fixture.restricted, fixture.restrictedInvite, 'supplier', 'Allowed for this supplier');
await reject([fixture.missing, fixture.missingInvite, 'supplier', 'No version'], /RFQ consent missing/);
await rows('update public.rfqs set specs=$2::jsonb where id=$1', [fixture.missing,
  JSON.stringify({ ...JSON.parse(consent()), buyer_contact: { email: 'buyer@example.com' } })]);
await reject([fixture.missing, fixture.missingInvite, 'supplier', 'No company in snapshot'], /RFQ consent missing/);
await rows('update public.rfqs set specs=$2::jsonb where id=$1', [fixture.missing,
  JSON.stringify({ ...JSON.parse(consent()), buyer_contact_consent_at: 'not-a-date' })]);
await reject([fixture.missing, fixture.missingInvite, 'supplier', 'Bad timestamp'], /RFQ consent missing/);
await rows('update public.rfqs set specs=$2::jsonb where id=$1', [fixture.missing,
  JSON.stringify({ ...JSON.parse(consent()), buyer_contact_supplier_ids: [fixture.other] })]);
await reject([fixture.missing, fixture.missingInvite, 'supplier', 'Form grant cannot invent a recipient list'], /RFQ recipient not confirmed/);
await reject([fixture.direct, null, 'buyer', 'Not sourcing'], /Sourcing RFQ is not open/);
await reject([fixture.question, null, 'buyer', 'Not sourcing'], /Sourcing RFQ is not open/);
await reject([fixture.closed, null, 'buyer', 'Closed'], /Sourcing RFQ is not open/);
assert.equal((await rows('select count(*)::int as n from public.rfq_mediated_messages where thread_id=$1', [fixture.missingInvite]))[0].n, 0);
const posted = await rows('select id,created_at from public.rfq_mediated_messages where thread_id=$1 order by created_at limit 1', [fixture.invite]);
await db.query('select public.mark_rfq_mediated_read($1,$2,$3)', [fixture.invite, 'party', posted[0].created_at]);
const read = (await rows('select party_last_read_at from public.rfq_mediated_threads where id=$1', [fixture.invite]))[0].party_last_read_at;
assert.equal(read.toISOString(), posted[0].created_at.toISOString());
await db.query('select public.mark_rfq_mediated_read($1,$2,$3)', [fixture.invite, 'party', '2999-01-01T00:00:00Z']);
const future = (await rows('select party_last_read_at,last_staff_message_at from public.rfq_mediated_threads where id=$1', [fixture.invite]))[0];
assert.ok(future.party_last_read_at <= new Date() && future.party_last_read_at >= read, 'Read marker is monotonic and clamped');
await assert.rejects(rows('select public.mark_rfq_mediated_read($1,$2,$3)', [fixture.invite, 'buyer', posted[0].created_at]), /Invalid RFQ read marker/);
await assert.rejects(rows("insert into public.rfq_thread_messages(match_id,sender,sender_email,body) values ($1,'supplier','supplier@example.com','New direct message')", [fixture.legacyInvite]), /Sourcing conversations go through Vexim/);
await rows("insert into public.rfq_thread_messages(match_id,sender,sender_email,body) values ($1,'supplier','supplier@example.com','Direct RFQ chat allowed')", [fixture.directInvite]);
assert.equal(await count('rfq_thread_messages'), 2);
for (let i = 0; i < 11; i++) await post(fixture.sourcing, null, 'buyer', `Buyer message ${i}`);
await assert.rejects(post(fixture.sourcing, null, 'buyer', 'Rate limited'), /RFQ desk rate limited/);
assert.equal((await rows('select count(*)::int as n from public.rfq_mediated_messages where thread_id=$1 and sender=$2', [fixture.sourcing, 'buyer']))[0].n, 12);
await db.close();
console.log('✅ PGlite RFQ mediation: independent desks, consent, history, grants, outbox, rate limit & read markers.');
