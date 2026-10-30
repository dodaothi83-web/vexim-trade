// node scripts/check-product-form-staging-pages.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const productId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', supplierId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
let staging=false, loadCalls=0, draftResult={ok:true,id:productId,revision:0,draft:null,images:[],availableImages:[],pending:false};
let product={id:productId,supplier_id:supplierId,name:'Legacy',supplier_review_status:'approved'};
const supplier={id:supplierId,requested_category_slugs:[]};
const store={listCategories:async()=>[],listSupplierCategories:async()=>[],listMedia:async()=>[],getProduct:async()=>product};
const access={supplier,user:{id:'user'},store};
const mocks={ 'next/link':{__esModule:true,default:({children})=>React.createElement('a',null,children)},
  'next/navigation':{redirect:()=>{throw Error('redirect');},notFound:()=>{throw Error('notFound');}},
  'lucide-react':{ChevronRight:()=>null},
  '@/lib/supplier-portal/access':{supplierPortalAccess:async()=>access},
  '@/lib/supplier-portal/onboarding':{portalApproved:()=>true},
  '@/components/page-header':{PageHeader:({title})=>React.createElement('h1',null,title)},
  '../product-editor':{SupplierProductEditor:()=>React.createElement('p',null,'OLD EDITOR')},
  '../product-form-staging-editor':{SupplierProductFormStagingEditor:(p)=>React.createElement('p',null,`NEW EDITOR ${p.productId??'new'} ${p.pending?'pending':''} ${p.readOnly?'readonly':''}`)},
  '@/lib/supplier-portal/category-proposals':{categoryProposalOptions:()=>[],allowedSupplierCategories:()=>[]},
  '@/lib/db/supabase':{getSupabaseClient:()=>({}),supabaseStore:store},
  '@/lib/products/quantity-new-config':{readNewQuantityPolicies:async()=>({})},
  '@/lib/products/quantity-editor-data':{readQuantityEditorData:async()=>null},
  '@/lib/supplier-portal/product-view':{supplierVisibleProductMedia:()=>[]},
  '@/lib/products/product-form-staging-access':{isSyntheticProductFormStaging:()=>staging},
  '@/lib/products/product-form-seed':{emptyProductFormDraft:()=>({name:''})},
  '@/app/supplier/portal/product-form-draft-actions':{loadProductFormDraftAction:async()=>{loadCalls++;return draftResult;}},
};
function load(path){const exports={};const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),
  {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,process:{env:{}},require:(key)=>{if(key==='react/jsx-runtime')return jsx;if(!(key in mocks))throw Error(key);return mocks[key];}}); return exports.default;}
const create=load('../app/supplier/portal/products/new/page.tsx'), edit=load('../app/supplier/portal/products/[id]/page.tsx');
const args={params:Promise.resolve({id:productId}),searchParams:Promise.resolve({})};
let html=renderToStaticMarkup(await create()); assert.match(html,/OLD EDITOR/); assert.doesNotMatch(html,/NEW EDITOR/);
html=renderToStaticMarkup(await edit(args)); assert.match(html,/OLD EDITOR/); assert.equal(loadCalls,0,'Production never reads private form');
staging=true; html=renderToStaticMarkup(await create()); assert.match(html,/NEW EDITOR new/); assert.doesNotMatch(html,/OLD EDITOR/);
html=renderToStaticMarkup(await edit(args)); assert.match(html,/OLD EDITOR/, 'Legacy product without a form remains on old editor');
draftResult={...draftResult,revision:2,draft:{name:'Bản nháp'},pending:true}; product={...product,supplier_review_status:'pending'};
html=renderToStaticMarkup(await edit(args)); assert.match(html,/NEW EDITOR/); assert.match(html,/pending readonly/); assert.doesNotMatch(html,/OLD EDITOR/);
product={...product,supplier_review_status:'approved'}; html=renderToStaticMarkup(await edit(args));
assert.match(html,/NEW EDITOR/); assert.doesNotMatch(html,/readonly/, 'Approved product can retain a private next draft');
draftResult={ok:false,message:'Dữ liệu không an toàn'}; html=renderToStaticMarkup(await edit(args));
assert.match(html,/Dữ liệu không an toàn/); assert.doesNotMatch(html,/OLD EDITOR/, 'Do not fall back when a private form cannot be loaded');
console.log('Supplier pages: staging-only form, private draft resume, pending locks and legacy preservation passed');
