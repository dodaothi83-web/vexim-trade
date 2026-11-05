// node --experimental-strip-types --no-warnings scripts/check-sponsored-requests.mjs
// Real functions with isolated mocked stores; no network or production writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { assignProductCategory } from '../lib/public/category-assignment.ts';
import * as readiness from '../lib/media/readiness.ts';
import * as display from '../lib/public/display-name.ts';
import * as seo from '../lib/public/supplier-seo.ts';
import * as supplierView from '../lib/sponsored/supplier-view.ts';
import * as verificationGate from '../lib/sponsored/verification-gate.ts';
import * as verificationStatus from '../lib/verification-status.ts';
import { hasPermission } from '../lib/auth/permissions.ts';
import * as priceDisplay from "../lib/products/price-display.ts";

const nodeRequire = createRequire(import.meta.url);
function load(file, mocks, globals={}) {
  const js=ts.transpileModule(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(js,{module,exports:module.exports,console,Date,FormData,process,...globals,require:(id)=>{assert.ok(id in mocks,`Unexpected ${id} in ${file}`);return mocks[id];}},{filename:file});
  return module.exports;
}
const selection=load('lib/public/product-selection.ts',{'@/lib/public/category-assignment':{assignProductCategory},'../products/price-display.ts':priceDisplay});
const supplier={id:'s1',name:'Real Supplier',slug:'real',status:'published',is_demo:false,summary_i18n:{},onboarding_status:'approved'};
const categories=[{slug:'cashew',name_i18n:{en:'Cashew',vi:'Hạt điều'},status:'published',is_published:true},
  {slug:'rice',name_i18n:{en:'Rice',vi:'Gạo'},status:'published',is_published:true},
  {slug:'archived',name_i18n:{en:'Archived'},status:'draft',is_published:false}];
const base={supplier_id:'s1',name:'Cashew W320',category:'cashew',ready_for_buyer:true,supplier_review_status:'approved',spec:null,description:null,featured_media_id:null,specs:{}};
let products=[{...base,id:'ok'},{...base,id:'catalogue'}, {...base,id:'private'}, {...base,id:'expired'}, {...base,id:'unready',ready_for_buyer:false},
  {...base,id:'pending',supplier_review_status:'submitted'}, {...base,id:'test',name:'TEST ONLY cashew'},
  {...base,id:'foreign',supplier_id:'s2'}, {...base,id:'missing-scope',supplier_originated:true},
  {...base,id:'archived',supplier_originated:true,reviewed_category_slug:'archived'},
  {...base,id:'rice',name:'Jasmine Rice',supplier_originated:true,reviewed_category_slug:'rice'}];
const media=products.map(p=>({id:`media-${p.id}`,owner_type:'product',product_id:p.id,supplier_id:p.supplier_id,kind:p.id==='catalogue'?'catalogue':'image',audience:p.id==='private'?'internal':'buyer',status:p.id==='expired'?'expired':'checked',expires_on:null,storage_path:`${p.id}.jpg`,thumb_path:null,sort_order:0,created_at:'2026-01-01T00:00:00Z'}));
let calls=[];
const store={mode:'supabase',async listProductsBySupplier(id){calls.push(['products',id]);return products;},async listCategories(){calls.push(['categories']);return categories;},
  async listMediaForProducts(ids){calls.push(['media',ids]);return media.filter(m=>ids.includes(m.product_id));},async listCertificatesForSuppliers(){return [];},
  async listVerifications(id){calls.push(['verifications',id]);return verifications.filter(v=>v.supplier_id===id);}};
let verifications=[{supplier_id:'s1',target_level:1,status:'approved'},{supplier_id:'s1',target_level:2,status:'approved'}];
const priceUnits=load('lib/public/price-units.ts',{'../products/price-display.ts':priceDisplay});
const gradePricing=load('lib/products/grade-pricing.ts',{
  '@/lib/public/price-units':priceUnits,
  '@/lib/public/grade-resolution':{gradeKey:(v)=>String(v??'').toLowerCase(),resolveGrade:()=>({value:null})},
});
const categoryCatalog=load('lib/public/product-catalog.ts',{
  'server-only':{},'@/lib/db':{getStore:()=>store},'@/lib/product-attributes':{publicProductAttributes:()=>({})},'@/lib/media/readiness':readiness,
  '@/lib/public/catalog':{},'@/lib/public/supplier-seo':seo,'@/lib/public/product-selection':selection,
  '@/lib/public/grade-resolution':{resolveGrade:()=>({value:null})},'@/lib/products/grade-pricing':gradePricing,
  '@/lib/public/ranking':{evidenceValidVerificationSteps:()=>0,rankPublicCategoryProducts:(x)=>x,SPEC_RANKING_WEIGHTS:{}},
  '@/lib/public/display-name':display,'@/lib/public/supplier-english':{supplierProvinceDisplay:()=>null},
  '@/lib/public/product-detail-display':{publicProductMoqDisplay:()=>null,publicProductPlaceDisplay:()=>null},
  // Giá số lượng đã duyệt được chiếu cho người mua; ở đây không có revision nên giữ nguyên thẻ cũ.
  '@/lib/public/quantity-catalog-legacy-preview':{projectQuantityCatalogPreview:async (records)=>records},
});
let configured=false;
const local={mode:'local'}, remote={mode:'supabase'};
const requestLib=load('lib/sponsored/requests.ts',{
  'server-only':{},'@/lib/db/local':{localStore:local},'@/lib/db/supabase':{supabaseConfigured:()=>configured,supabaseStore:remote},
  '@/lib/media/readiness':readiness,'@/lib/public/product-catalog':categoryCatalog,'@/lib/public/display-name':display,
  '@/lib/public/supplier-seo':seo,'@/lib/public/product-selection':selection,
  '@/lib/sponsored/verification-gate':verificationGate,'@/lib/verification-status':verificationStatus,
},{process:{env:{NODE_ENV:'development'}}});
assert.equal(requestLib.sponsoredRequestStore(),local); configured=true; assert.equal(requestLib.sponsoredRequestStore(),remote); configured=false;
const prodLib=load('lib/sponsored/requests.ts',{
  'server-only':{},'@/lib/db/local':{localStore:local},'@/lib/db/supabase':{supabaseConfigured:()=>false,supabaseStore:remote},
  '@/lib/media/readiness':readiness,'@/lib/public/product-catalog':categoryCatalog,'@/lib/public/display-name':display,
  '@/lib/public/supplier-seo':seo,'@/lib/public/product-selection':selection,
  '@/lib/sponsored/verification-gate':verificationGate,'@/lib/verification-status':verificationStatus,
},{process:{env:{NODE_ENV:'production'}}});
assert.equal(prodLib.sponsoredRequestStore(),null,'Missing production Supabase never accepts local requests');
const got=await requestLib.eligibleSupplierPushProducts(store,supplier);
assert.deepEqual([...got].map(x=>x.productId).sort(),['catalogue','ok','rice']);
assert.ok(calls.find(c=>c[0]==='products')[1]==='s1');
assert.ok(!calls.find(c=>c[0]==='media')[1].includes('foreign'),'Never reads another supplier media');
const publicSupplier={...supplier,approved_verification_steps:[],categories:[],main_products:[],gallery_images:[]};
const snapshot={suppliers:[publicSupplier],products:products.filter(p=>p.supplier_id==='s1'),categories,categoryByProduct:new Map(),mediaByProduct:new Map(),certificatesBySupplier:new Map()};
const live=[];
for (const cat of categories.filter(c=>c.status==='published'&&c.is_published)) live.push(...await categoryCatalog.listPublicCategoryProducts(cat,{snapshot}));
assert.deepEqual([...got].map(x=>x.productId).sort(),live.map(x=>x.id).sort(),'Supplier choices match public category gates');
assert.equal((await requestLib.eligibleSupplierPushProducts(store,{...supplier,status:'draft'})).length,0);
assert.equal((await requestLib.eligibleSupplierPushProducts(store,{...supplier,is_demo:true})).length,0);
assert.equal((await requestLib.eligibleSupplierPushProducts(store,{...supplier,slug:'test-supplier'})).length,0);
// Điều kiện xác minh: L1 + (L2 hoặc L3). Chỉ L1, hoặc L2 + L3 thiếu L1, không được chọn sản phẩm nào.
assert.equal(verificationGate.sponsoredVerificationGate([1,2]),'ok');
assert.equal(verificationGate.sponsoredVerificationGate([1,3]),'ok');
assert.equal(verificationGate.sponsoredVerificationGate([1,2,3]),'ok');
assert.equal(verificationGate.sponsoredVerificationGate([1]),'needs_l2_or_l3');
assert.equal(verificationGate.sponsoredVerificationGate([2,3]),'needs_l1','L2 + L3 mà thiếu L1 vẫn không được quảng cáo');
assert.equal(verificationGate.sponsoredVerificationGate([]),'needs_l1');
const savedVerifications=verifications;
verifications=[{supplier_id:'s1',target_level:1,status:'approved'}];
assert.equal((await requestLib.eligibleSupplierPushProducts(store,supplier)).length,0,'Chỉ có L1 thì không có sản phẩm để đẩy');
assert.equal(await requestLib.supplierSponsoredGate(store,'s1'),'needs_l2_or_l3');
verifications=[{supplier_id:'s1',target_level:1,status:'approved'},{supplier_id:'s1',target_level:3,status:'submitted'}];
assert.equal((await requestLib.eligibleSupplierPushProducts(store,supplier)).length,0,'L3 chưa duyệt không được tính');
verifications=[{supplier_id:'s1',target_level:2,status:'approved'},{supplier_id:'s1',target_level:3,status:'approved'}];
assert.equal(await requestLib.supplierSponsoredGate(store,'s1'),'needs_l1');
verifications=[{supplier_id:'s1',target_level:1,status:'approved'},{supplier_id:'s1',target_level:3,status:'approved'},{supplier_id:'s2',target_level:2,status:'approved'}];
assert.equal((await requestLib.eligibleSupplierPushProducts(store,supplier)).length,3,'L1 + L3 đủ điều kiện; xác minh của nhà cung cấp khác không được tính');
await assert.rejects(requestLib.eligibleSupplierPushProducts({...store,listVerifications:async()=>{throw Error('network');}},supplier),/network/,
  'Lỗi đọc xác minh không bao giờ thành "không đủ điều kiện"');
verifications=savedVerifications;
const failStore={...store,listMediaForProducts:async()=>{throw Error('network');}};
await assert.rejects(requestLib.eligibleSupplierPushProducts(failStore,supplier),/network/,'Read errors never become an empty catalogue');

const now=Date.now(), push={surface:'category',status:'approved',starts_at:new Date(now-1000).toISOString(),ends_at:new Date(now+1000).toISOString(),product_id:'ok',category_slug:'cashew'};
assert.equal(supplierView.supplierPushState(push,now,new Set(['ok\0cashew'])),'live');
assert.equal(supplierView.supplierPushState(push,now,new Set()),'unavailable');
assert.equal(supplierView.supplierPushState(push,now,null),'unknown');
assert.equal(supplierView.supplierPushState({...push,surface:'home'},now,new Set()),'unavailable');
assert.equal(supplierView.supplierPushState({...push,starts_at:'bad'},now,new Set()),'unknown');
assert.equal(supplierView.supplierPushState({...push,status:'paused'},now,new Set()),'paused');
assert.equal(supplierView.supplierPushState({...push,ends_at:new Date(now-100).toISOString()},now,new Set()),'ended');
for(const role of ['admin','reviewer','sale']) assert.equal(hasPermission(role,'sponsored.requests.manage'),true);
for(const role of ['supplier','viewer','sourcing']) assert.equal(hasPermission(role,'sponsored.requests.manage'),false);
assert.equal(hasPermission('sale','sponsored.manage'),false,'Request permission does not approve packages');

// Legacy consultation submission is retired, including calls from stale clients.
const actions=load('app/supplier/portal/boost/actions.ts',{'@/lib/auth/session':{getSession:async()=>({role:'supplier'})}});
for (const product of ['ok','foreign','']) {
  const form = new FormData(); form.set('product',product);
  const result = await actions.submitSponsoredRequestAction({ok:false,message:''}, form);
  assert.equal(result.ok,false); assert.match(result.message,/ngừng nhận/);
}
console.log('✅ Requests: legacy submission disabled, eligibility and scoped reads remain tested.');
