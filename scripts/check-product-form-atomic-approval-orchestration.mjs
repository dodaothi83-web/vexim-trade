// node scripts/check-product-form-atomic-approval-orchestration.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const productId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', submissionId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const supplierId='cccccccc-cccc-cccc-cccc-cccccccccccc', actorId='dddddddd-dddd-dddd-dddd-dddddddddddd';
const context={ status:'ok',product:{id:productId,supplier_id:supplierId,specs:{},name_i18n:{},monthly_capacity:null},
  submission:{id:submissionId,supplier_id:supplierId,quantity:{},image_selection:[{}],image_snapshot:[{}]} };
let calls=[], review={ok:true,context,validation:{draft:{},englishName:'Cashew',warnings:[]}},
  plan={ok:true,patch:{name:'Synthetic'}}, copies={ok:true,images:[{mediaId:'fake'}]}, bytesValid=true, rpc={data:{status:'approved'},error:null};
const mocks={ 'server-only':{},
  '@/lib/products/product-form-review-preparation':{ prepareProductFormReview: async (...args) => { calls.push(['review',...args]); return review; } },
  '@/lib/products/product-form-publication-plan':{ planProductFormPublication: (value) => { calls.push(['plan',value]); return plan; } },
  '@/lib/products/product-form-promotion-images':{ preparePublicationImages: async (value) => { calls.push(['copy',value]); return copies; } },
  '@/lib/products/product-form-publication-image-verification':{ verifyPublicationImageCopies: async (value) => { calls.push(['verify',value]); return bytesValid; } },
};
const db={ rpc:async (...args) => {calls.push(['rpc',...args]); return rpc;} };
const exports={}; const code=ts.transpileModule(readFileSync(new URL('../lib/products/product-form-atomic-approval.ts',import.meta.url),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports,console:{error(){}},require:(key)=>{if (!(key in mocks)) throw Error(key); return mocks[key];}});
const approve=()=>exports.approveProductFormAtomically({db,productId,submissionId,actorId,englishName:'Cashew'});
let result=await approve(); assert.equal(result.ok,true); assert.equal(calls.map((x)=>x[0]).join(','),'review,plan,copy,verify,rpc');
const args=calls.at(-1); assert.equal(args[1],'approve_product_form_submission'); assert.equal(args[2].p_expected_context,context);
assert.equal(args[2].p_patch,plan.patch); assert.equal(args[2].p_images,copies.images); assert.equal(args[2].p_actor_id,actorId);
calls=[]; review={ok:false,message:'Invalid'}; result=await approve(); assert.equal(result.ok,false); assert.equal(calls.length,1);
review={ok:true,context,validation:{draft:{},englishName:'Cashew',warnings:[]}}; calls=[];
plan={ok:false,reason:'legacy_capacity_unmapped'}; result=await approve(); assert.equal(result.ok,false); assert.equal(calls.length,2);
plan={ok:true,patch:{name:'Synthetic'}}; calls=[]; copies={ok:false,requiresReload:true,message:'Unknown copy'};
result=await approve(); assert.equal(result.requiresReload,true); assert.equal(calls.length,3);
copies={ok:true,images:[{mediaId:'fake'}]}; calls=[]; bytesValid=false;
result=await approve(); assert.equal(result.requiresReload,true); assert.equal(calls.length,4);
bytesValid=true; calls=[]; rpc={data:null,error:new Error('lost response')};
result=await approve(); assert.equal(result.requiresReload,true); assert.equal(calls.length,5);
rpc={data:{status:'context_changed'},error:null}; result=await approve(); assert.equal(result.requiresReload,true);
console.log('Approval orchestration: ordered checks, trusted patch, no partial replay and uncertain results passed');
