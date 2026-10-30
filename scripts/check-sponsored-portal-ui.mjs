// Test the actual server page and stale action while the feature is closed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const jsx=createRequire(import.meta.url)('react/jsx-runtime');
function load(path,mocks){
 const js=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(js,{module,exports:module.exports,console,Date,Intl,FormData,Set,Map,Promise,require(id){assert.ok(id in mocks,`Unexpected ${id}`);return mocks[id];}});
 return module.exports;
}
let access={supplier:{id:'s1'}},approved=true, reads=0;
const forbiddenRead=()=>{reads++;throw Error('Locked page must not read or write package data');};
const store=new Proxy({mode:'supabase'},{get(target,key){return key in target?target[key]:forbiddenRead;}});
const page=load('app/supplier/portal/boost/page.tsx',{
 'react/jsx-runtime':jsx,'next/link':{default:({children})=>React.createElement('span',null,children)},
 'next/navigation':{redirect:(url)=>{throw Error(`redirect:${url}`)}},
 'lucide-react':new Proxy({},{get:()=>()=>null}),
 '@/components/page-header':{PageHeader:({title})=>React.createElement('h1',null,title)},
 '@/lib/supplier-portal/access':{supplierPortalAccess:async()=>access},
 '@/lib/supplier-portal/onboarding':{portalApproved:()=>approved},
 '@/lib/sponsored/admin':{},'@/lib/sponsored/requests':{sponsoredRequestStore:()=>store,eligibleSupplierPushProducts:forbiddenRead},
 '@/lib/sponsored/supplier-view':{},'@/lib/public/display-name':{},'@/lib/public/product-selection':{},
 '@/lib/sponsored/offer-settings':{readOfferSettings:forbiddenRead},'./request-form':{RequestForm:()=>{throw Error('Form must not render');}},
});
const html=renderToStaticMarkup(await page.default());
assert.match(html,/chưa mở/i);assert.match(html,/chưa thể đăng ký hoặc mua gói/);
assert.doesNotMatch(html,/<form|<button|Gửi yêu cầu|Chọn sản phẩm|Giá chưa được cấu hình/);
assert.equal(reads,0,'No offer, products, historical package or request read while locked');
access=null;await assert.rejects(page.default(),/redirect:\/login/);
access={supplier:{id:'s1'}};approved=false;await assert.rejects(page.default(),/redirect:\/supplier\/portal/);
let session=null;
const action=load('app/supplier/portal/boost/actions.ts',{'@/lib/auth/session':{getSession:async()=>session}});
const form=new FormData();form.set('product','forged');
for(const role of [null,'admin','supplier']){
 session=role?{role}:null;
 const result=await action.submitSponsoredRequestAction({ok:false,message:''},form);
 assert.equal(result.ok,false,`Stale submission must be rejected: ${role}`);
}
assert.equal(reads,0);
const sidebar=readFileSync(new URL('../components/supplier-sidebar.tsx',import.meta.url),'utf8');
assert.doesNotMatch(sidebar,/href:\s*["']\/supplier\/portal\/boost["']/);
console.log('✅ Supplier boost setup lock: hidden menu, direct URL closed, stale submission rejected (SSR/action mocks).');
