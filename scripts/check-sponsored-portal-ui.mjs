// Render the real server page with mocked scoped/error stores; no production data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as admin from '../lib/sponsored/admin.ts';
import * as view from '../lib/sponsored/supplier-view.ts';
import * as display from '../lib/public/display-name.ts';
import { createRequire } from 'node:module';
const req=createRequire(import.meta.url), jsx=req('react/jsx-runtime');
const now=Date.now(), date=h=>new Date(now+h*3600000).toISOString();
const candidate={productId:'p',supplierId:'s1',name:'Our item',categorySlug:'cat',categoryName:'Danh mục',supplierName:'Our Supplier',imagePath:null};
const request={id:'r',supplier_id:'s1',product_id:'p',product_name:'Our item',category_name:'Danh mục',status:'new',note:'Own message',created_at:date(-1)};
const push={id:'push1',supplier_id:'s1',product_id:'p',category_slug:'cat',surface:'category',status:'approved',starts_at:date(-1),ends_at:date(167),note:'STAFF_PRIVATE_NOTE'};
let failMetrics=false, failCandidates=false, failRequests=false, productReads=0, categoryReads=0;
const store={mode:'supabase',async listSponsoredRequestsForSupplier(id){assert.equal(id,'s1');if(failRequests)throw Error('missing table');return [request,{...request,id:'secret',supplier_id:'s2',product_name:'OTHER_SECRET'}];},
 async listSponsoredPushesForSupplier(id){assert.equal(id,'s1');return [push,{...push,id:'other-push',supplier_id:'s2',note:'OTHER_PRIVATE_NOTE'}];},
 async listProductsBySupplier(id){productReads++;assert.equal(id,'s1');return [{id:'p',supplier_id:'s1',name:'Our item'},{id:'q',supplier_id:'s2',name:'OTHER_PRODUCT'}];},
 async listCategories(){categoryReads++;return [{slug:'cat',name_i18n:{vi:'Danh mục'}}];},
 async listSponsoredPushDaily(ids){assert.deepEqual([...ids],['push1']);if(failMetrics)throw Error('metrics offline');return [{push_id:'push1',day:date(0).slice(0,10),event_type:'impression',events:3},{push_id:'other-push',day:date(0).slice(0,10),event_type:'impression',events:99999}];},
};
const source=ts.transpileModule(readFileSync(new URL('../app/supplier/portal/boost/page.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const module={exports:{}},icon=()=>null;
const mocks={'react/jsx-runtime':jsx,'next/link':{default:({href,children,...rest})=>React.createElement('a',{href,...rest},children)},'next/navigation':{redirect:(url)=>{throw Error(url)}},
 'lucide-react':new Proxy({}, {get:()=>icon}), '@/components/page-header':{PageHeader:({title})=>React.createElement('h1',null,title)},
 '@/lib/supplier-portal/access':{supplierPortalAccess:async(s)=>({store:s,user:{id:'u'},supplier:{id:'s1'}})},'@/lib/supplier-portal/onboarding':{portalApproved:()=>true},
 '@/lib/sponsored/admin':admin,'@/lib/sponsored/requests':{sponsoredRequestStore:()=>store,eligibleSupplierPushProducts:async()=>{if(failCandidates)throw Error('catalog down');return [candidate,{...candidate,productId:'foreign',supplierId:'s2',name:'OTHER_CANDIDATE'}];}},
 '@/lib/sponsored/supplier-view':view,'@/lib/public/display-name':display,'@/lib/public/product-selection':{withoutDirectContacts:x=>x},
 './request-form':{RequestForm:({candidates,requestStorageAvailable})=>React.createElement('div',{'data-storage':String(requestStorageAvailable)},candidates.map(c=>c.name).join(','))}};
vm.runInNewContext(source,{module,exports:module.exports,console:{error(){}},Date,Intl,Set,Map,Promise,require:(id)=>{assert.ok(id in mocks,`Unexpected ${id}`);return mocks[id];}},{filename:'boost/page.tsx'});
const render=async()=>renderToStaticMarkup(await module.exports.default());
let html=await render();
assert.equal(productReads,1,'One scoped product read');assert.equal(categoryReads,1,'One category read');
for(const text of ['Our item','Own message','Đang chạy','lượt hiển thị'])assert.ok(html.includes(text),text);
for(const text of ['OTHER_SECRET','OTHER_PRODUCT','OTHER_CANDIDATE','OTHER_PRIVATE_NOTE','STAFF_PRIVATE_NOTE','99999'])assert.ok(!html.includes(text),`private ${text}`);
assert.match(html,/data-storage="true"/);
failMetrics=true; html=await render();assert.match(html,/Chưa tải được số liệu/);assert.match(html,/>—<\/strong> lượt hiển thị/);assert.doesNotMatch(html,/>0<\/strong> lượt hiển thị/);
failMetrics=false;failCandidates=true;html=await render();assert.match(html,/Chưa xác định/);assert.doesNotMatch(html,/Đang chạy/);
failCandidates=false;failRequests=true;html=await render();assert.match(html,/Chưa tải được yêu cầu/);assert.match(html,/data-storage="false"/,'Cannot submit when request list is unavailable');
console.log('✅ Supplier page: scoped data, private notes hidden, unknown metrics/eligibility and inbox outage fail closed (SSR mocks).');
