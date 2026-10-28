// Render the real CRM sidebar for known/unknown request counts.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';
import * as permissions from '../lib/auth/permissions.ts';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),jsx=require('react/jsx-runtime');
const source=ts.transpileModule(readFileSync(new URL('../components/sidebar.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const module={exports:{}};
const mocks={'react/jsx-runtime':jsx,'react':React,'next/link':{default:({href,children,...rest})=>React.createElement('a',{href,...rest},children)},
 'next/navigation':{usePathname:()=>'/crm/dashboard'},'lucide-react':icons,'@/app/auth-actions':{logoutAction:async()=>{}},
 '@/lib/auth/permissions':permissions,'@/components/ui':{cx:(...x)=>x.filter(Boolean).join(' ')},'@/components/brand-logo':{Logo:()=>null}};
vm.runInNewContext(source,{module,exports:module.exports,require:(id)=>{assert.ok(id in mocks,`Unexpected ${id}`);return mocks[id];}});
const Sidebar=module.exports.Sidebar;
function render(count){const html=renderToStaticMarkup(React.createElement(Sidebar,{dataMode:'supabase',emailMode:'resend',session:{name:'Sale',email:'sale@example.com',role:'sale'},permissions:permissions.permissionsFor('sale'),pendingSponsoredRequests:count}));return html.match(/<a href="\/crm\/sponsored"[\s\S]*?<\/a>/)?.[0]??'';}
assert.match(render(null),/aria-label="Chưa tải được yêu cầu đẩy sản phẩm"[^>]*>!<\/span>/);
assert.match(render(3),/aria-label="Yêu cầu đẩy sản phẩm mới"[^>]*>3 mới<\/span>/);
assert.doesNotMatch(render(0),/mới|Chưa tải được|>!<\/span>/);
console.log('✅ CRM badge: unknown count is a warning, known count is numeric, zero is empty (SSR).');
