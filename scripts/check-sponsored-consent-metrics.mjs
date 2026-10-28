// Local PGlite and HTTP handler mocks; no production data or real RLS client.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';

const db = new PGlite();
const live = '00000000-0000-0000-0000-000000000001';
const paused = '00000000-0000-0000-0000-000000000002';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.sponsored_pushes(id uuid primary key, status text, starts_at timestamptz, ends_at timestamptz);
    create table public.sponsored_push_daily(push_id uuid, day date, event_type text, events bigint);`);
  await db.query("insert into sponsored_pushes values($1,'approved',now()-interval '1 hour',now()+interval '1 hour'),($2,'paused',now()-interval '1 hour',now()+interval '1 hour')",[live,paused]);
  await db.query("insert into sponsored_push_daily values($1,current_date,'impression',99)",[live]);
  const migration=readFileSync(new URL('../supabase/migrations/20261046_sponsored_consented_metrics.sql',import.meta.url),'utf8');
  await db.exec(migration); await db.exec(migration);
  assert.equal((await db.query('select count(*) n from sponsored_push_consented_daily')).rows[0].n,0,'old counters are not reclassified');
  await db.query("select record_consented_sponsored_push_event($1,'impression')",[live]);
  await db.query("select record_consented_sponsored_push_event($1,'impression')",[live]);
  await db.query("select record_consented_sponsored_push_event($1,'click')",[paused]);
  await assert.rejects(db.query("select record_consented_sponsored_push_event($1,'other')",[live]),/Invalid sponsored push event/);
  assert.equal((await db.query('select events from sponsored_push_consented_daily')).rows[0].events,2);
  assert.equal((await db.query('select events from sponsored_push_daily')).rows[0].events,99);
  const priv=(await db.query(`select has_table_privilege('anon','public.sponsored_push_consented_daily','select') a,
   has_function_privilege('authenticated','public.record_consented_sponsored_push_event(uuid,text)','execute') b,
   has_function_privilege('service_role','public.record_consented_sponsored_push_event(uuid,text)','execute') c`)).rows[0];
  assert.deepEqual(priv,{a:false,b:false,c:true});
} finally {await db.close();}

function load(path,mocks) {
  const exports={};
  const code=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,Date,JSON,URL,Number,console,require(id){assert.ok(id in mocks,`Unexpected ${id}`);return mocks[id];}});
  return exports;
}
const consent=load('lib/cookie-consent.ts',{});
let writes=0, session=null;
class NextResponse {constructor(_body,options){this.status=options.status;}}
const {POST}=load('app/api/public/sponsored-push/route.ts',{
  'next/server':{NextResponse}, '@/lib/cookie-consent':consent,
  '@/lib/auth/session':{getSession:async()=>session},
  '@/lib/sponsored/events':{isPushId:v=>v===live,recordPushEvent:async()=>{writes++;}},
});
const cookie=(choices,date=new Date())=>`vexim_cookie_consent=${encodeURIComponent(consent.serializeCookieConsent(choices,date))}`;
const request=(cookieValue, extras={})=>({headers:new Headers({host:'example.com',origin:'https://example.com','content-type':'application/json','user-agent':'Mozilla/5.0',cookie:cookieValue||'',...extras}),text:async()=>JSON.stringify({pushId:live,event:'impression'})});
for (const c of ['', 'vexim_cookie_consent=bad', cookie({marketing:false}),cookie({analytics:true,marketing:false}),cookie({marketing:true},new Date(Date.now()-366*86400000)),cookie({marketing:true},new Date(Date.now()+60000))]) {
  assert.equal((await POST(request(c))).status,204); assert.equal(writes,0,'missing, rejected, malformed, expired or future consent must not count');
}
assert.equal((await POST(request(cookie({marketing:true})))).status,204); assert.equal(writes,1);
assert.equal((await POST(request(cookie({marketing:true}),{origin:'https://evil.test'}))).status,403); assert.equal(writes,1);
session={uid:'staff'}; assert.equal((await POST(request(cookie({marketing:true})))).status,204);assert.equal(writes,1);
console.log('✅ Sponsored consent metrics: separate historical counters, permissions, live-only counting and server consent checks (PGlite/mocks).');
