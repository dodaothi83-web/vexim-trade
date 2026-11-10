// Run the actual portal migration in isolated PostgreSQL (PGlite). No Supabase writes.
// Covers backfill privacy, atomic quote/version/outbox transitions, consent-gated threads,
// read markers and table/function grants. PGlite cannot prove live concurrent sessions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = readFileSync(new URL('../supabase/migrations/20261116_rfq_portal_conversations.sql', import.meta.url), 'utf8');
const ids = {
  buyer: '11111111-1111-1111-1111-111111111111', supplier: '22222222-2222-2222-2222-222222222222',
  other: '33333333-3333-3333-3333-333333333333', product: '44444444-4444-4444-4444-444444444444',
  sourcing: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', direct: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  old: 'cccccccc-cccc-cccc-cccc-cccccccccccc', revision: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  question: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  bad: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  sourcingOne: 'a0000000-0000-0000-0000-000000000001',
  sourcingTwo: 'a0000000-0000-0000-0000-000000000002',
  directMatch: 'b0000000-0000-0000-0000-000000000001',
  otherDirect: 'b0000000-0000-0000-0000-000000000002',
  oldMatch: 'c0000000-0000-0000-0000-000000000001',
  revisionMatch: 'f0000000-0000-0000-0000-000000000001',
  questionMatch: 'd0000000-0000-0000-0000-000000000001',
  badMatch: 'e0000000-0000-0000-0000-000000000001',
};
for (const role of ['anon', 'authenticated', 'service_role']) await db.exec(`create role ${role};`);
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
const consent = (source) => JSON.stringify({ buyer_contact_policy_version: 'rfq_contact_v2',
  buyer_contact_consent_source: source, buyer_contact_consent_at: '2026-11-04T00:00:00Z',
  buyer_contact: { company: 'Buyer Co', email: 'buyer@example.com' } });
const request = async (id, status, sourcePage, product, preferred, specs) => db.query(
  'insert into public.rfqs (id, code, buyer_id, status, source_page, source_product_id, preferred_supplier_ids, specs) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
  [id, `RFQ-${id.slice(0, 4)}`, ids.buyer, status, sourcePage, product, preferred, specs]);
await request(ids.sourcing, 'matching', '/rfq', null, [], consent('sourcing_form'));
await request(ids.direct, 'matching', '/products', ids.product, [ids.supplier], consent('rfq_form'));
await request(ids.old, 'quoted', '/rfq', null, [], '{}');
await request(ids.revision, 'quoted', '/rfq', null, [], consent('sourcing_form'));
await request(ids.question, 'matching', '/rfq?intent=question', null, [ids.supplier], consent('rfq_form'));
await request(ids.bad, 'matching', '/rfq', null, [], '{}');
const match = async (mid, rid, sid, status, price, sent, presented = null, note = null) => db.query(
  'insert into public.rfq_matches (id,rfq_id,supplier_id,status,quote_price,quote_currency,quote_unit,sent_to_supplier_at,sent_to_buyer_at,internal_note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
  [mid, rid, sid, status, price, 'USD', 'kg', sent, presented, note]);
const invited = '2026-11-05T00:00:00Z';
await match(ids.sourcingOne, ids.sourcing, ids.supplier, 'quoted', 6.25, invited);
await match(ids.sourcingTwo, ids.sourcing, ids.other, 'quoted', 7.5, invited);
await match(ids.directMatch, ids.direct, ids.supplier, 'sent_to_supplier', null, invited);
await match(ids.otherDirect, ids.direct, ids.other, 'sent_to_supplier', null, invited);
await match(ids.oldMatch, ids.old, ids.supplier, 'presented_to_buyer', 8.25, invited,
  '2026-11-06T00:00:00Z', 'PRIVATE STAFF NOTE — NEVER BACKFILL');
await match(ids.revisionMatch, ids.revision, ids.supplier, 'quoted', 13.5, invited,
  '2026-11-06T00:00:00Z', 'UNPUBLISHED REVISION — NEVER BACKFILL');
await match(ids.questionMatch, ids.question, ids.supplier, 'sent_to_supplier', null, invited);
await match(ids.badMatch, ids.bad, ids.supplier, 'sent_to_supplier', null, invited);

await db.exec(migration);
const rows = (sql, params = []) => db.query(sql, params).then((r) => r.rows);
let versions = await rows('select match_id,version,quote_price,buyer_note from public.rfq_quote_versions');
assert.equal(versions.length, 1, 'Legacy drafts with an older sent timestamp must not leak into the backfill');
assert.equal(versions[0].match_id, ids.oldMatch);
assert.equal(versions[0].buyer_note, null, 'Never backfill private notes');
assert.doesNotMatch(JSON.stringify(versions), /PRIVATE STAFF NOTE/);
const legacyRevision = (await rows('select status,sent_to_buyer_at,legacy_sent_to_buyer_at from public.rfq_matches where id=$1', [ids.revisionMatch]))[0];
assert.equal(legacyRevision.status, 'quoted');
assert.equal(legacyRevision.sent_to_buyer_at, null, 'An unrecoverable old offer must not unlock sourcing chat or imply publication');
assert.ok(legacyRevision.legacy_sent_to_buyer_at, 'Keep historical email time for staff audit');
assert.equal((await rows('select sent_to_buyer_at from public.rfq_matches where id=$1', [ids.oldMatch]))[0].sent_to_buyer_at.toISOString(),
  '2026-11-06T00:00:00.000Z', 'Already presented quotes stay accessible');
await assert.rejects(rows('insert into public.rfq_thread_messages(match_id,sender,sender_email,body) values ($1,\'buyer\',\'buyer@example.com\',\'Please confirm the old quote\')', [ids.revisionMatch]),
  /not been presented/, 'A legacy draft cannot enable a sourcing conversation before staff publishes it');
const tableGrants = await rows(`select
  has_table_privilege('anon','public.rfq_quote_versions','SELECT') as anon_versions,
  has_table_privilege('authenticated','public.rfq_thread_messages','INSERT') as auth_messages,
  has_table_privilege('service_role','public.rfq_quote_versions','SELECT') as service_versions,
  has_table_privilege('service_role','public.rfq_quote_versions','UPDATE') as update_versions,
  has_table_privilege('service_role','public.rfq_thread_messages','DELETE') as delete_messages,
  has_table_privilege('service_role','public.rfq_portal_alerts','UPDATE') as update_alerts,
  has_function_privilege('anon','public.publish_rfq_quotes(uuid,uuid[],jsonb)','EXECUTE') as anon_publish,
  has_function_privilege('service_role','public.publish_rfq_quotes(uuid,uuid[],jsonb)','EXECUTE') as service_publish`);
assert.deepEqual(tableGrants[0], { anon_versions: false, auth_messages: false, service_versions: true,
  update_versions: false, delete_messages: false, update_alerts: true, anon_publish: false, service_publish: true });
assert.equal((await rows("select relrowsecurity from pg_class where oid='public.rfq_quote_versions'::regclass"))[0].relrowsecurity, true);
const publish = async (rid, mids, expected) => {
  const revisions = expected ?? Object.fromEntries((await rows('select id::text,updated_at::text from public.rfq_matches where id = any($1::uuid[])', [mids]))
    .map((m) => [m.id, m.updated_at]));
  return rows('select match_id,version,quote_price,buyer_note from public.publish_rfq_quotes($1::uuid,$2::uuid[],$3::jsonb)',
    [rid, mids, JSON.stringify(revisions)]);
};
const first = await publish(ids.sourcing, [ids.sourcingOne, ids.sourcingTwo, ids.directMatch]);
assert.equal(first.length, 2, 'Publication cannot include a foreign RFQ match');
assert.ok(first.every((r) => r.version === 1));
assert.equal((await rows('select status,first_response_at from public.rfqs where id=$1', [ids.sourcing]))[0].status, 'quoted');
assert.equal((await rows('select count(*)::int as n from public.rfq_portal_alerts where version_id is not null'))[0].n, 2);
assert.equal((await publish(ids.sourcing, [ids.sourcingOne, ids.sourcingTwo])).length, 0, 'Submitting twice is idempotent');
const staleAt = (await rows('select updated_at::text from public.rfq_matches where id=$1', [ids.sourcingOne]))[0].updated_at;
await db.query("update public.rfq_matches set quote_price=6.1256, quote_buyer_note='New packaging', status='quoted' where id=$1", [ids.sourcingOne]);
assert.equal((await rows('select quote_price from public.rfq_quote_versions where match_id=$1 and version=1', [ids.sourcingOne]))[0].quote_price, '6.2500', 'Draft price cannot mutate published version');
assert.equal((await publish(ids.sourcing, [ids.sourcingOne], { [ids.sourcingOne]: staleAt })).length, 0,
  'Staff cannot publish a different revision than the one they reviewed');
const second = await publish(ids.sourcing, [ids.sourcingOne]);
assert.equal(second.length, 1); assert.equal(second[0].version, 2);
assert.equal(second[0].quote_price, '6.1256'); assert.equal(second[0].buyer_note, 'New packaging');
assert.equal((await rows('select count(*)::int as n from public.rfq_portal_alerts where version_id is not null'))[0].n, 3);
await assert.rejects(publish(ids.question, [ids.questionMatch]), /not open/);
await db.query("update public.rfqs set status='lost' where id=$1", [ids.sourcing]);
await db.query("update public.rfq_matches set status='quoted' where id=$1", [ids.sourcingOne]);
await assert.rejects(publish(ids.sourcing, [ids.sourcingOne]), /not open/);

const send = (mid, sender, body = 'Can you confirm the MOQ?') => rows(
  'insert into public.rfq_thread_messages(match_id,sender,sender_email,body) values ($1,$2,$3,$4) returning id,created_at',
  [mid, sender, `${sender}@example.com`, body]);
await assert.rejects(send(ids.badMatch, 'buyer'), /consent/);
await assert.rejects(send(ids.questionMatch, 'buyer'), /not available/);
await assert.rejects(send(ids.otherDirect, 'buyer'), /not named/);
await assert.rejects(send(ids.sourcingOne, 'buyer'), /not available/, 'Closed RFQ cannot be contacted');
await assert.rejects(send(ids.directMatch, 'unknown'), /sender/);
await assert.rejects(send(ids.directMatch, 'buyer', ' '), /body/);
const buyerMessage = await send(ids.directMatch, 'buyer');
const supplierMessage = await send(ids.directMatch, 'supplier', 'MOQ 10 MT.');
assert.equal((await rows('select count(*)::int as n from public.rfq_thread_messages'))[0].n, 2);
let direct = (await rows('select last_thread_sender,last_buyer_message_at,last_supplier_message_at from public.rfq_matches where id=$1', [ids.directMatch]))[0];
assert.equal(direct.last_thread_sender, 'supplier');
assert.ok(direct.last_buyer_message_at && direct.last_supplier_message_at);
assert.equal((await rows('select count(*)::int as n from public.rfq_portal_alerts where message_id is not null'))[0].n, 2);
for (let i = 0; i < 11; i++) await send(ids.directMatch, 'buyer', `Follow-up ${i}`);
await assert.rejects(send(ids.directMatch, 'buyer'), /rate limited/, 'The database lock enforces the 12-message burst cap');
assert.equal((await rows("select count(*)::int as n from public.rfq_thread_messages where match_id=$1 and sender='buyer'", [ids.directMatch]))[0].n, 12);
const pending = (await rows('select recipient,event_at,not_before from public.rfq_portal_alerts where message_id=$1', [buyerMessage[0].id]))[0];
assert.equal(pending.recipient, 'supplier');
assert.equal(new Date(pending.not_before).getTime() - new Date(pending.event_at).getTime(), 10 * 60_000);
await db.query('select public.mark_rfq_thread_read($1,$2,$3::timestamptz)', [ids.directMatch, 'supplier', supplierMessage[0].created_at]);
await db.query('select public.mark_rfq_thread_read($1,$2,$3::timestamptz)', [ids.directMatch, 'supplier', buyerMessage[0].created_at]);
const readAt = (await rows('select supplier_last_read_at from public.rfq_matches where id=$1', [ids.directMatch]))[0].supplier_last_read_at;
assert.ok(new Date(readAt).getTime() >= new Date(supplierMessage[0].created_at).getTime(), 'Read markers never regress');
await assert.rejects(db.query('select public.mark_rfq_thread_read($1,$2,now())', [ids.directMatch, 'staff']), /Invalid read marker/);
console.log('✅ RFQ portal migration: real SQL backfill, atomic versions/outbox, consented threads, monotone reads, RLS/grants (PGlite).');
await db.close();
