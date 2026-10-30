// node scripts/check-crm-review-image-confirmation.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', submission = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
let approvals = 0;
let role = 'admin';
const mocks = {
  'next/cache': { revalidatePath() {} },
  '@/lib/auth/session': { getSession: async () => ({ uid: id, role, email: 'a@example.com' }) },
  '@/lib/db/supabase': { getSupabaseClient: () => ({}), supabaseStore: { getUser: async () => ({ id, is_active: true, role: 'admin', email: 'a@example.com' }) } },
  '@/lib/products/product-form-atomic-approval': { approveProductFormAtomically: async () => { approvals++; return { ok: true, message: 'Đã duyệt' }; } },
  '@/lib/products/product-form-staging-access': { isProductFormBuyerEnabled: () => true },
};
const load = (path, map) => {
  const exports = {}, code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, FormData, console, require: (key) => { if (!(key in map)) throw Error(key); return map[key]; } });
  return exports;
};
const action = load('../app/crm/products/product-form-approval-action.ts', mocks).approveProductFormAction;
const form = new FormData(); form.set('product_id', id); form.set('submission_id', submission); form.set('english_name', 'Cashew');
let result = await action(form); assert.equal(result.ok, false); assert.match(result.message, /xác nhận ảnh/); assert.equal(approvals, 0);
form.set('images_reviewed', 'yes'); role = 'supplier'; result = await action(form); assert.equal(result.ok, false); assert.equal(approvals, 0);
role = 'admin'; result = await action(form); assert.equal(result.ok, true); assert.equal(approvals, 1);
const component = load('../app/crm/products/form-review/[submissionId]/review-controls.tsx', {
  react: React, 'react/jsx-runtime': jsx, 'next/navigation': { useRouter: () => ({ push() {}, refresh() {} }) },
  '@/app/crm/products/product-form-review-actions': { requestProductFormChangesAction() {} },
  '@/app/crm/products/product-form-approval-action': { approveProductFormAction() {} },
  '@/app/crm/products/product-form-translation-actions': { suggestProductFormEnglishNameAction() {} },
}).ProductFormReviewControls;
let html = renderToStaticMarkup(React.createElement(component, { productId: id, submissionId: submission, sourceName: 'Hạt điều', updatedAt: '', allowApproval: true, imagesReady: true }));
assert.match(html, /Tôi đã kiểm tra tất cả ảnh/); assert.match(html, /<button[^>]*disabled=""[^>]*>Duyệt và công bố/);
html = renderToStaticMarkup(React.createElement(component, { productId: id, submissionId: submission, sourceName: 'Hạt điều', updatedAt: '', allowApproval: true, imagesReady: false }));
assert.match(html, /Danh sách ảnh chưa đủ điều kiện/); assert.match(html, /type="checkbox"[^>]*disabled=""/);
console.log('CRM approval requires explicit image confirmation; invalid images cannot be confirmed in the UI');
