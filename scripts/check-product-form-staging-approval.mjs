// node scripts/check-product-form-staging-approval.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const env={};
function load(path,mocks) {
  const exports={},code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,process:{env},URL,FormData,console:{error(){}},require:(key)=>{
    if (!(key in mocks)) throw Error(`Unexpected ${key}`); return mocks[key]; }}); return exports;
}
const staging=load('../lib/products/product-form-staging-access.ts',{'server-only':{}}).isSyntheticProductFormStaging;
assert.equal(staging(),false); env.VEXIM_DEPLOY_ENV='staging'; env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
env.SUPABASE_URL='https://axvphurlpczysvzabgkm.supabase.co'; assert.equal(staging(),false,'Production database cannot use staging action');
env.SUPABASE_URL='https://vqyekpritfobxkrlisan.supabase.co'; assert.equal(staging(),true);
env.SUPABASE_URL='https://vqyekpritfobxkrlisan.supabase.co.evil.invalid'; assert.equal(staging(),false);
env.SUPABASE_URL='https://vqyekpritfobxkrlisan.supabase.co/path'; assert.equal(staging(),false);
env.SUPABASE_URL='https://vqyekpritfobxkrlisan.supabase.co'; env.VEXIM_DEPLOY_ENV='production'; assert.equal(staging(),false);
env.VEXIM_DEPLOY_ENV='staging'; delete env.SUPABASE_SERVICE_ROLE_KEY; assert.equal(staging(),false);
env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
let session={uid:'cccccccc-cccc-cccc-cccc-cccccccccccc',role:'reviewer',email:'reviewer@example.invalid'},
 actor={id:session.uid,role:'reviewer',email:session.email,is_active:true}, calls=[], rpcResult={ok:true,message:'Đã duyệt sản phẩm.'};
const db={};
const action=load('../app/crm/products/product-form-approval-action.ts',{
  'next/cache':{revalidatePath:(...args)=>calls.push(['invalidate',...args])},
  '@/lib/auth/session':{getSession:async()=>session},
  '@/lib/db/supabase':{getSupabaseClient:()=>db,supabaseStore:{getUser:async()=>actor}},
  '@/lib/products/product-form-staging-access':{isSyntheticProductFormStaging:staging},
  '@/lib/products/product-form-atomic-approval':{approveProductFormAtomically:async (args)=>{calls.push(['approve',args]);return rpcResult;}},
}).approveProductFormAction;
const f=new FormData();f.set('product_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); f.set('submission_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); f.set('english_name','Cashew kernels');
assert.equal((await action(f)).ok,false); assert.equal(calls.length,0,'No approval without buyer cutover');
env.VEXIM_QUANTITY_BUYER_PREVIEW='true'; session={...session,role:'supplier'}; assert.equal((await action(f)).ok,false);
session={...session,role:'reviewer'}; actor={...actor,is_active:false}; assert.equal((await action(f)).ok,false);
actor={...actor,is_active:true}; let result=await action(f); assert.equal(result.ok,true);
assert.equal(calls[0][0],'approve'); assert.equal(calls[0][1].actorId,actor.id); assert.ok(calls.some((x)=>x[0]==='invalidate'&&x[1]==='/products'));
calls=[]; env.SUPABASE_URL='https://axvphurlpczysvzabgkm.supabase.co'; result=await action(f); assert.equal(result.ok,false); assert.equal(calls.length,0);
console.log('Staging approval: explicit project, buyer preview, reviewer authorization and cache invalidation passed');
