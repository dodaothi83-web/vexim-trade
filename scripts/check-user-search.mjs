// node --experimental-strip-types --no-warnings scripts/check-user-search.mjs
// Ô tìm kiếm ở Cài đặt → Người dùng & phân quyền: không phân biệt dấu/hoa thường, mọi từ phải khớp.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const out = ts.transpileModule(fs.readFileSync(new URL('../components/user-manager.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const labels = { supplier: 'Doanh nghiệp', sale: 'Kinh doanh', admin: 'Quản trị' };
const stub = new Proxy({}, { get: () => () => null });
const mocks = { 'react/jsx-runtime': stub, react: { useState: () => [] }, 'next/navigation': stub, 'lucide-react': stub,
  '@/app/auth-actions': stub, '@/lib/email/sender': stub, '@/components/ui': stub, '@/components/toast': stub,
  '@/lib/auth/permissions': { ROLES: [], roleMeta: (role) => ({ label: labels[role] ?? role, badge: '' }) } };
const exports = {};
vm.runInNewContext(out, { exports, require: (id) => { assert.ok(id in mocks, `Unexpected ${id}`); return mocks[id]; } });
const { userMatchesSearch: match } = exports;

const vilaconic = { name: 'CÔNG TY CỔ PHẦN VILACONIC', email: 'hocluong30@outlook.com', role: 'supplier' };
const charlie = { name: 'Nguyen Hai Anh (Charlie)', email: 'anhnguyen21031994@gmail.com', role: 'supplier' };
assert.equal(match(vilaconic, 'vilaconic@veximtrade.com', ''), true, 'Ô trống hiện tất cả');
assert.equal(match(vilaconic, null, 'cong ty co phan'), true, 'Không cần gõ dấu');
assert.equal(match(vilaconic, null, 'VILAconic'), true, 'Không phân biệt hoa thường');
assert.equal(match(vilaconic, null, 'outlook'), true, 'Tìm theo email đăng nhập');
assert.equal(match(charlie, 'charlie@veximtrade.com', 'charlie@vexim'), true, 'Tìm theo địa chỉ Gửi từ');
assert.equal(match(charlie, null, 'nguyễn anh'), true, 'Nhiều từ, không cần liền nhau');
assert.equal(match(charlie, null, 'nguyen vilaconic'), false, 'Mọi từ phải khớp');
assert.equal(match(charlie, null, 'doanh nghiep'), true, 'Tìm theo vai trò');
assert.equal(match({ name: null, email: 'supply10@gmail.com', role: 'supplier' }, null, 'supply10'), true, 'Tài khoản chưa có tên');
console.log('✅ Tìm tài khoản: không dấu, không phân biệt hoa thường, theo tên/email/địa chỉ gửi/vai trò, mọi từ phải khớp.');
