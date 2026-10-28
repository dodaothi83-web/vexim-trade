// Legacy manual action tests replaced by the retired-flow guards and public copy checks.
import './check-sponsored-retired.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const jsx=createRequire(import.meta.url)('react/jsx-runtime');
function load(path,mocks) {
  const exports={};
  const code=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,require:(id)=>{assert.ok(id in mocks,`Unexpected ${id}`);return mocks[id];}});
  return exports;
}
const Services = load('components/service-registration-section.tsx', {
  'react/jsx-runtime': jsx, react: React, 'next/link': {default:({href,children,...rest})=>React.createElement('a',{href,...rest},children)}, 'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/components/form-challenge': { FormChallenge: () => null },
}).ServiceRegistrationSection;
for (const [lang, marker, next] of [['vi', 'DỊCH VỤ 03', 'DỊCH VỤ 04'], ['en', 'SERVICE 03', 'SERVICE 04']]) {
  const serviceHtml = renderToStaticMarkup(React.createElement(Services, { lang }));
  const featured = serviceHtml.slice(serviceHtml.indexOf(marker), serviceHtml.indexOf(next));
  assert.match(featured, /banner/i);
  assert.match(featured, lang === 'vi' ? /Tư vấn quảng cáo banner/ : /Request banner consultation/);
  assert.doesNotMatch(featured, /168 (giờ|hours)|chưa bật bộ lọc|no filters applied|supplier\/portal\/boost/i);
  assert.match(featured, lang === 'vi' ? /khác với gói đẩy sản phẩm/ : /separate service from sponsored product placement/);
}
console.log('✅ Banner advertising and product boost remain distinct.');
