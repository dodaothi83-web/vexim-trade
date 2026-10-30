// Staff actions, fresh identity and local durability against isolated mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { hasPermission } from '../lib/auth/permissions.ts';
function load(file,mocks,extra={}) {
 const js=ts.transpileModule(fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}}; vm.runInNewContext(js,{module,exports:module.exports,FormData,console,Date,structuredClone,...extra,require:(id)=>{assert.ok(id in mocks,`Unexpected ${id}`);return mocks[id];}},{filename:file});return module.exports;
}
let session={uid:'s',role:'sale',email:'s@example.com'}, user={id:'s',role:'sale',email:'s@example.com',is_active:true};
let row={id:'r',status:'new'}, fail=false, writes=0, revalidated=[];
const store={async getUser(){if(fail)throw Error('connection');return user;},async updateSponsoredRequestIfStatus(id,expected,status,userId){if(fail)throw Error('connection');if(row.id!==id||row.status!==expected)return null;row={...row,status,updated_by:userId};writes++;return row;}};
const redirect=(url)=>{const e=new Error(url);e.digest=`NEXT_REDIRECT;${url}`;throw e;};
const action=load('app/crm/sponsored/request-actions.ts',{
 'next/cache':{revalidatePath:(p)=>revalidated.push(p)},'next/navigation':{redirect},
 '@/lib/auth/session':{getSession:async()=>session},'@/lib/auth/permissions':{hasPermission},
 '@/lib/sponsored/requests':{sponsoredRequestStore:()=>store},
}).updateSponsoredRequestAction;
const run=async(fields)=>{const fd=new FormData();Object.entries(fields).forEach(([k,v])=>fd.set(k,v));try{await action(fd);return 'no-redirect';}catch(e){if(e.digest?.startsWith('NEXT_REDIRECT'))return e.message;throw e;}};
const form={id:'r',expected:'new',status:'contacted'};
assert.match(await run(form),/ok=request-contacted/); assert.equal(row.status,'contacted'); assert.equal(writes,1);
assert.ok(revalidated.includes('/supplier/portal/boost'));
assert.match(await run(form),/err=request-changed/); assert.equal(writes,1);
assert.match(await run({id:'r',expected:'contacted',status:'closed'}),/ok=request-closed/);
assert.match(await run({id:'r',expected:'closed',status:'new'}),/err=request-invalid/);
session={...session,role:'supplier'};assert.match(await run(form),/err=request-forbidden/);
session={...session,role:'sale'};user={...user,is_active:false};assert.match(await run(form),/err=request-forbidden/);
user={...user,is_active:true,role:'viewer'};assert.match(await run(form),/err=request-forbidden/);
user={...user,role:'sale',email:'changed@example.com'};assert.match(await run(form),/err=request-forbidden/);
user={...user,email:'s@example.com'};fail=true;assert.match(await run(form),/err=request-error/);assert.equal(writes,2);

// The real supplier access helper always re-checks the active account, email and supplier link.
let sess={uid:'u',role:'supplier',email:'u@example.com'};
let supplierUser={id:'u',role:'supplier',is_active:true,email:'u@example.com',supplier_id:'s1'};
const strict={getUser:async()=>supplierUser,getSupplier:async(id)=>id==='s1'?{id:'s1'}:null,listVerifications:async()=>[]};
const access=load('lib/supplier-portal/access.ts',{
 'server-only':{},'@/lib/db':{getStore:()=>{throw Error('wrong store');}},'@/lib/auth/session':{getSession:async()=>sess},'./policy':{ownsDocumentReview:()=>true},
}).supplierPortalAccess;
assert.equal((await access(strict)).supplier.id,'s1');
supplierUser={...supplierUser,is_active:false};assert.equal(await access(strict),null);
supplierUser={...supplierUser,is_active:true,email:'other@example.com'};assert.equal(await access(strict),null);
supplierUser={...supplierUser,email:'u@example.com',supplier_id:null};assert.equal(await access(strict),null);
sess={...sess,role:'sale'};assert.equal(await access(strict),null);

const state={users:[{id:'u',role:'supplier',is_active:true,supplier_id:'s1'},{id:'staff',role:'sale',is_active:true}],buyers:[],suppliers:[],products:[{id:'p',supplier_id:'s1'}],media:[],rfqs:[],sponsored_pushes:[],sponsored_requests:[],certificates:[],supplier_submission_items:[],audit_log:[],categories:[{slug:"nuts-kernels",status:"published",is_published:true}]};
const config={intro:'',seo_desc:'',spec_columns:[],spec_rows:[],buying_facts:[],faqs:[],filters:[],product_fields:[]};
let diskFails=true;
const local=load('lib/db/local.ts',{
 'node:crypto':crypto,'node:fs':{existsSync:()=>false,mkdirSync(){},writeFileSync(){if(diskFails)throw Error('disk denied');},renameSync(){},unlinkSync(){}},'node:path':path,
 '@/lib/db/seed':{SEED_BUYERS:[],SEED_PRODUCTS:[],SEED_SUPPLIERS:[]},'@/lib/db/preview-seed':{PREVIEW_PEPPER_HARVEST:null,previewCategories:()=>[],previewSeedRows:()=>({suppliers:[],products:[]})},
 '@/lib/db/demo-suppliers':{DEMO_SUPPLIERS:[]},'@/lib/l2-scope':{},'@/lib/types':{L2_FACTORY_PHOTO_ITEMS:[],L3_EXPORT_ITEMS:[]},'@/lib/verification-submission':{},
 '@/lib/public/product-selection':{},'@/lib/media/readiness':{},'./category-seed':{CASHEW_CATEGORY_CONFIG:config,DEFAULT_CATEGORY_CONFIG:config,PEPPER_CATEGORY_CONFIG:config},
},{__veximLocal:state,process:{cwd:()=>'/virtual',env:{}}}).localStore;
const input={supplier_id:'s1',product_id:'p',requested_by:'u',supplier_name:'S',product_name:'P',category_slug:'x',category_name:'X',requester_email:'u@example.com',note:null};
await assert.rejects(local.createSponsoredRequest(input),/disk denied/);
assert.equal((await local.listSponsoredRequestsForSupplier('s1')).length,0,'Failed disk write rolls back in-memory mutation');
diskFails=false; const saved=await local.createSponsoredRequest(input);assert.equal(saved.status,'new');
await assert.rejects(local.createSponsoredRequest(input),/ALREADY_OPEN/);
await assert.rejects(local.updateSponsoredRequestIfStatus(saved.id,'new','contacted','u'),/TRANSITION/);
assert.equal((await local.updateSponsoredRequestIfStatus(saved.id,'new','contacted','staff')).status,'contacted');
assert.equal(await local.updateSponsoredRequestIfStatus(saved.id,'new','closed','staff'),null);
assert.equal((await local.updateSponsoredRequestIfStatus(saved.id,'contacted','closed','staff')).status,'closed');
assert.ok(await local.createSponsoredRequest(input),'Can send again after closing');
assert.equal((await local.listSponsoredRequestsForSupplier('other')).length,0);
console.log('✅ Requests: staff CAS and permission checks, fresh supplier identity, local failed-write rollback.');
