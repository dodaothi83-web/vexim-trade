// PGlite and mocked actions: no production data. Does not prove real concurrency/RLS.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const [admin, reviewer, inactive, live, paused, draft, ended]=Array.from({length:7},(_,i)=>id(i+1));
const db=new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.app_users(id uuid primary key, role text, is_active boolean);
    create table public.sponsored_pushes(id uuid primary key, status text, ends_at timestamptz);`);
  await db.query("insert into app_users values ($1,'admin',true),($2,'reviewer',true),($3,'admin',false)",[admin,reviewer,inactive]);
  await db.query("insert into sponsored_pushes values ($1,'approved',now()+interval '1 day'),($2,'paused',now()+interval '1 day'),($3,'draft',now()+interval '1 day'),($4,'approved',now()-interval '1 day')",[live,paused,draft,ended]);
  const initial=(await db.query('select * from sponsored_pushes order by id')).rows;
  const sql=readFileSync(new URL('../supabase/migrations/20261048_sponsored_retire_manual.sql',import.meta.url),'utf8');
  await db.exec(sql); await db.exec(sql);
  assert.deepEqual((await db.query('select * from sponsored_pushes order by id')).rows,initial,'migration never changes legacy rows');
  await assert.rejects(db.query("insert into sponsored_pushes values ($1,'draft',now())",[id(10)]),/creation is disabled/);
  for(const push of [draft,paused]) await assert.rejects(db.query("update sponsored_pushes set status='approved' where id=$1",[push]),/activation is disabled/);
  for(const actor of [reviewer,inactive]) await assert.rejects(db.query('select stop_sponsored_for_violation($1,$2,$3)',[live,actor,'vi phạm']),/Active admin required/);
  await assert.rejects(db.query('select stop_sponsored_for_violation($1,$2,$3)',[live,admin,'no']),/violation reason/);
  assert.equal((await db.query('select stop_sponsored_for_violation($1,$2,$3) stopped',[ended,admin,'vi phạm'])).rows[0].stopped,false);
  assert.equal((await db.query('select stop_sponsored_for_violation($1,$2,$3) stopped',[live,admin,'  vi phạm  '])).rows[0].stopped,true);
  assert.equal((await db.query('select stop_sponsored_for_violation($1,$2,$3) stopped',[live,admin,'vi phạm'])).rows[0].stopped,false);
  assert.equal((await db.query('select count(*) n from sponsored_violation_stops')).rows[0].n,1);
  assert.equal((await db.query('select reason from sponsored_violation_stops')).rows[0].reason,'vi phạm');
  const priv=(await db.query(`select has_function_privilege('anon','public.stop_sponsored_for_violation(uuid,uuid,text)','execute') a,
    has_function_privilege('service_role','public.stop_sponsored_for_violation(uuid,uuid,text)','execute') b,
    has_table_privilege('authenticated','public.sponsored_violation_stops','select') c`)).rows[0];
  assert.deepEqual(priv,{a:false,b:true,c:false});
} finally {await db.close();}
function load(path,mocks) {
  const code=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,console,FormData,require(id){assert.ok(id in mocks,`Unexpected ${id}`);return mocks[id];}});
  return module.exports;
}
let role='admin',isActive=true,errors=false,success=true,calls=0;
const session=()=>role?{uid:admin,role,email:'admin@example.com'}:null;
const redirect=url=>{const error=new Error(url);error.digest=`NEXT_REDIRECT;${url}`;throw error;};
const action=load('app/crm/sponsored/actions.ts',{
  'next/cache':{revalidatePath(){}},'next/navigation':{redirect},'@/lib/auth/session':{getSession:async()=>session()},
  '@/lib/db/supabase':{getSupabaseClient:()=>({rpc:async()=>{calls++;if(errors)return {error:{message:'offline'}};return {data:success,error:null};}}),supabaseStore:{getUser:async()=>({id:admin,role:'admin',email:'admin@example.com',is_active:isActive})}},
});
assert.deepEqual(Object.keys(action),['pausePushAction'],'manual actions are not exported');
const run=async(reason='reason',push=live)=>{const fd=new FormData();fd.set('id',push);fd.set('reason',reason);try{await action.pausePushAction(fd);assert.fail('expected redirect');}catch(e){if(!e.digest)throw e;return e.message;}};
role='reviewer';assert.match(await run(),/err=forbidden/);assert.equal(calls,0);
role='admin';isActive=false;assert.match(await run(),/err=forbidden/);assert.equal(calls,0);
isActive=true;assert.match(await run('bad'),/err=stop-invalid/);assert.equal(calls,0);
assert.match(await run(),/ok=paused/);assert.equal(calls,1);
success=false;assert.match(await run(),/err=changed/);
const jsx=createRequire(import.meta.url)('react/jsx-runtime');
const board=load('app/crm/sponsored/sponsored-board.tsx',{
 'react/jsx-runtime':jsx,react:React,'lucide-react':new Proxy({},{get:()=>()=>null}),
 '@/components/ui':{EmptyState:()=>null,group:String},'@/lib/sponsored/chart-geometry':{buildChartGeometry:()=>({})},'./actions':{pausePushAction:()=>{}},
}).SponsoredBoard;
const row={id:live,productName:'P',supplierName:'S',categoryName:'C',surface:'category',status:'approved',state:'live',startsLabel:'',endsLabel:'',hoursLeft:1,impressions:0,clicks:0,rate:0,priceLabel:'—',note:null};
const props={rows:[row],pools:[],summary:{live:1,pending:0,impressions7d:0,clicks7d:0,expiring:0},canManage:true,flash:null,series:{},metricsAvailable:true,packagesAvailable:true};
const html=renderToStaticMarkup(React.createElement(board,props));
assert.match(html,/Dừng do vi phạm/);assert.match(html,/name="reason"/);assert.doesNotMatch(html,/>Tạo gói<|>Duyệt<|>Chạy lại</);
assert.doesNotMatch(renderToStaticMarkup(React.createElement(board,{...props,canManage:false})),/Dừng do vi phạm/);
console.log('✅ Retired manual flow: legacy rows retained, manual activation blocked, admin-only audited violation stop (PGlite/mocks).');
