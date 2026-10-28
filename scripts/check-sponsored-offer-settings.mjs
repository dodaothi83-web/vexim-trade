// Isolated settings migration and server-action tests, not a real Supabase/RLS client.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = '00000000-0000-0000-0000-000000000001';
const sale = '00000000-0000-0000-0000-000000000002';
const inactive = '00000000-0000-0000-0000-000000000003';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.app_users (id uuid primary key, role text not null, is_active boolean not null);`);
  await db.query("insert into app_users values ($1,'admin',true),($2,'sale',true),($3,'admin',false)", [admin, sale, inactive]);
  const sql = readFileSync(new URL('../supabase/migrations/20261047_sponsored_offer_settings.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
  const row = (await db.query('select price_vnd,hold_minutes,packages_per_slot from sponsored_offer_settings')).rows[0];
  assert.deepEqual(row, { price_vnd: null, hold_minutes: 20, packages_per_slot: 4 });
  for (const id of [sale, inactive]) await assert.rejects(db.query('update sponsored_offer_settings set updated_by=$1', [id]), /Active admin required/);
  await assert.rejects(db.query('update sponsored_offer_settings set price_vnd=0,updated_by=$1', [admin]), /check constraint/);
  await assert.rejects(db.query('update sponsored_offer_settings set hold_minutes=0,updated_by=$1', [admin]), /check constraint/);
  await assert.rejects(db.query('update sponsored_offer_settings set packages_per_slot=21,updated_by=$1', [admin]), /check constraint/);
  await db.query('update sponsored_offer_settings set price_vnd=2500000,hold_minutes=15,updated_by=$1', [admin]);
  await db.exec(sql); // rerunning the migration must not reset configured values
  assert.equal(Number((await db.query('select price_vnd from sponsored_offer_settings')).rows[0].price_vnd), 2500000);
  const privileges = (await db.query(`select has_table_privilege('anon','public.sponsored_offer_settings','select') a,
    has_table_privilege('authenticated','public.sponsored_offer_settings','update') b,
    has_table_privilege('service_role','public.sponsored_offer_settings','update') c,
    has_table_privilege('service_role','public.sponsored_offer_settings','delete') d,
    (select relrowsecurity from pg_class where oid='public.sponsored_offer_settings'::regclass) e`)).rows[0];
  assert.deepEqual(privileges, { a:false,b:false,c:true,d:false,e:true });
} finally { await db.close(); }

function load(file, mocks) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require(id) { assert.ok(id in mocks, id); return mocks[id]; }, console });
  return module.exports;
}
const makeForm = (price, hold='20', count='4') => { const f = new FormData(); f.set('price_vnd',price); f.set('hold_minutes',hold); f.set('packages_per_slot',count); return f; };
let current = { id:admin, role:'admin', is_active:true, email:'a@example.com' }, written = null, session = { uid:admin, role:'admin', email:'a@example.com' };
const fakeDb = { from(table) { assert.equal(table, 'sponsored_offer_settings'); return { update(values) { written=values; return { eq:()=>({ select:()=>({ single:async()=>({data:{id:true},error:null}) }) }) }; } }; } };
const settings = load('../lib/sponsored/offer-settings.ts', { 'server-only': {}, '@/lib/db/supabase':{getSupabaseClient:()=>fakeDb} });
assert.equal(settings.parseOfferSettings(makeForm('', '20', '4')).price_vnd, null);
for (const form of [makeForm('abc'), makeForm('0'), makeForm('1.5'), makeForm('1000000001'), makeForm('100', '0'), makeForm('100','20','21')]) assert.equal(settings.parseOfferSettings(form), null);
const actions = load('../app/crm/sponsored/offer-actions.ts', {
  '@/lib/auth/session':{getSession:async()=>session},
  '@/lib/db/supabase':{getSupabaseClient:()=>fakeDb,supabaseStore:{getUser:async()=>current}},
  '@/lib/sponsored/offer-settings':settings,
  'next/cache':{revalidatePath:()=>{}},
});
assert.equal((await actions.updateOfferSettingsAction({}, makeForm('1200000'))).ok, true);
assert.equal(written.price_vnd,1200000); assert.equal(written.updated_by,admin);
written=null; current={...current,role:'sale'};
assert.equal((await actions.updateOfferSettingsAction({}, makeForm('1200000'))).ok, false); assert.equal(written,null);
current={...current,role:'admin',is_active:false};
assert.equal((await actions.updateOfferSettingsAction({}, makeForm('1200000'))).ok, false);
current={...current,is_active:true}; session={...session,role:'sale'};
assert.equal((await actions.updateOfferSettingsAction({}, makeForm('1200000'))).ok, false);
console.log('✅ Offer configuration: defaults, validation, admin recheck and database privileges (PGlite/mocks).');
