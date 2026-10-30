// Exercise the actual Supabase adapter with capped/paged fake PostgREST responses.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as productExtras from '../lib/products/product-extras.ts';
const uid=n=>`00000000-0000-0000-0000-${n.toString(16).padStart(12,'0')}`;
const rows=Array.from({length:1251},(_,i)=>({id:uid(i+1),supplier_id:i%3===0?'other':'mine',status:i%4===0?'closed':'new',created_at:new Date(1_700_000_000_000+i*1000).toISOString()}));
let failPage=0, reads=0, queryLog=[], nextError=null, updatedRow={id:uid(9000),status:'new'};
const client={from(table){let filters=[],limit=500,kind='select',patch,head=false;
 const query={select(_cols,opts){head=!!opts?.head;return this;},eq(k,v){filters.push(['eq',k,v]);return this;},gt(k,v){filters.push(['gt',k,v]);return this;},order(){return this;},limit(n){limit=n;return this;},insert(input){kind='insert';patch=input;return this;},update(input){kind='update';patch=input;return this;},
  async single(){if(nextError){const e=nextError;nextError=null;return {data:null,error:e};}return {data:{...patch,id:uid(9999),status:'new'},error:null};},
  async maybeSingle(){queryLog.push({kind,table,filters});if(nextError){const e=nextError;nextError=null;return {data:null,error:e};}if(!filters.every(([,k,v])=>updatedRow[k]===v))return {data:null,error:null};Object.assign(updatedRow,patch);return {data:{...updatedRow},error:null};},
  then(resolve,reject){reads++;queryLog.push({kind,table,filters});let result;
   if(failPage&&reads===failPage)result={data:null,error:{message:'connection lost'}};
   else {const match=rows.filter(r=>filters.every(([op,k,v])=>op==='eq'?r[k]===v:r[k]>v));
     result=head?{data:null,error:null,count:match.length}:{data:match.sort((a,b)=>a.id.localeCompare(b.id)).slice(0,Math.min(limit,37)),error:null};}
   return Promise.resolve(result).then(resolve,reject);
  }};return query;}};
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/db/supabase.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const module={exports:{}};
vm.runInNewContext(code,{module,exports:module.exports,console,process:{env:{SUPABASE_URL:'https://mock.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake'}},require:(id)=>{if(id==='@supabase/supabase-js')return {createClient:()=>client};if(id==='@/lib/public/product-selection')return {};if(id==='@/lib/products/product-extras')return productExtras;throw Error(id);}});
const store=module.exports.supabaseStore;
let found=await store.listSponsoredRequestsForSupplier('mine');assert.equal(found.length,834);assert.ok(found.every(r=>r.supplier_id==='mine'));assert.ok(reads>20,'capped short pages continue until empty');
assert.ok(queryLog.every(q=>q.filters.some(([op,k,v])=>op==='eq'&&k==='supplier_id'&&v==='mine')),'every page scoped');
reads=0;queryLog=[];found=await store.listSponsoredPushesForSupplier('mine');assert.equal(found.length,834);assert.ok(queryLog.every(q=>q.filters.some(([op,k,v])=>op==='eq'&&k==='supplier_id'&&v==='mine')));
reads=0;failPage=3;await assert.rejects(store.listSponsoredRequestsForSupplier('mine'),/connection lost/,'mid-page failure is not a partial success');failPage=0;reads=0;
const all=await store.listSponsoredRequests();assert.equal(all.length,1251);
const count=await store.countNewSponsoredRequests();assert.equal(count,rows.filter(r=>r.status==='new').length);
nextError={code:'23505',message:'duplicate'};await assert.rejects(store.createSponsoredRequest({}),/SPONSORED_REQUEST_ALREADY_OPEN/);
nextError={message:'network failure'};await assert.rejects(store.createSponsoredRequest({}),/network failure/);
const created=await store.createSponsoredRequest({supplier_id:'mine'});assert.equal(created.supplier_id,'mine');
assert.equal((await store.updateSponsoredRequestIfStatus(uid(9000),'new','contacted','staff')).status,'contacted');
assert.equal(await store.updateSponsoredRequestIfStatus(uid(9000),'new','closed','staff'),null);
const updates=queryLog.filter(q=>q.kind==='update');assert.ok(updates.every(q=>q.filters.some(([,k])=>k==='id')&&q.filters.some(([,k])=>k==='status')),'updates use CAS');
console.log('✅ Request Supabase adapter: 1,251 capped rows, scoped reads, mid-page failure, duplicate and conditional update (fake PostgREST).');
