// node --experimental-strip-types scripts/check-register-chooser.mjs
//
// Trang /register là cửa vào tài khoản duy nhất và phải tách rõ hai loại người dùng.
// Kiểm này chặn đúng những lỗi đã có thật:
//  - người mua bị dẫn vào biểu mẫu đăng ký bán hàng (header chỉ có "Supplier sign in");
//  - hứa hẹn một biểu mẫu tài khoản người mua chưa tồn tại;
//  - biến việc gửi yêu cầu báo giá thành phải đăng nhập.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';

const root = new URL('..', import.meta.url);
const file = 'app/(public)/register/page.tsx';
const source = readFileSync(new URL(file, root), 'utf8');

const Link = ({ href, children, prefetch: _prefetch, ...props }) => React.createElement('a', { href, ...props }, children);
const icons = new Proxy({}, { get: () => (props) => React.createElement('svg', props) });
const mod = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  {
    module: mod,
    exports: mod.exports,
    require: (id) => {
      const mocks = {
        react: React,
        'react/jsx-runtime': jsx,
        'next/link': { default: Link },
        'lucide-react': icons,
        '@/components/ui': { Breadcrumbs: () => React.createElement('nav', { 'data-breadcrumbs': true }) },
      };
      assert.ok(id in mocks, `${file}: unexpected import ${id}`);
      return mocks[id];
    },
    console,
  },
  { filename: file },
);

const Page = mod.exports.default;
assert.equal(typeof Page, 'function', 'Thiếu component trang /register');
const html = renderToStaticMarkup(React.createElement(Page));

/* 1. Hai lựa chọn, mỗi lựa chọn là một mục có tiêu đề riêng */
assert.match(html, /<h1[^>]*>Create an account<\/h1>/, 'Tiêu đề trang là "Create an account"');
const sections = [...html.matchAll(/<section\b[^>]*aria-labelledby="register-(buyer|supplier)"[\s\S]*?<\/section>/g)];
assert.equal(sections.length, 2, 'Phải có đúng hai thẻ lựa chọn: Buyer và Supplier');
const buyerHtml = sections.find((m) => m[1] === 'buyer')[0];
const supplierHtml = sections.find((m) => m[1] === 'supplier')[0];
assert.match(buyerHtml, /<h2 id="register-buyer"[^>]*>Buyer<\/h2>/);
assert.match(supplierHtml, /<h2 id="register-supplier"[^>]*>Supplier<\/h2>/);

/* 2. Mỗi thẻ dẫn tới đúng việc, không dẫn chéo */
assert.match(supplierHtml, /href="\/supplier\/register"/, 'Thẻ Supplier dẫn tới biểu mẫu đăng ký nhà cung cấp hiện có');
assert.doesNotMatch(supplierHtml, /href="\/rfq"/, 'Thẻ Supplier không dẫn vào phễu báo giá');
assert.match(buyerHtml, /href="\/rfq"/, 'Thẻ Buyer dẫn tới yêu cầu báo giá, không cần tài khoản');
assert.doesNotMatch(buyerHtml, /href="\/supplier\/register"/, 'Người mua không bị dẫn vào biểu mẫu bán hàng');
assert.match(html, /href="\/login"/, 'Có lối đăng nhập cho người đã có tài khoản');

/* 3. Không hứa hẹn biểu mẫu chưa tồn tại */
for (const missing of ['/register/buyer', '/buyer/register', '/api/buyer-signup', '/signup']) {
  assert.ok(!html.includes(`href="${missing}"`), `Không được trỏ tới ${missing} khi route đó chưa có`);
}
assert.ok(!existsSync(new URL('app/(public)/register/buyer', root)), 'Chưa có trang đăng ký tài khoản người mua');
assert.ok(!existsSync(new URL('app/(auth)/register', root)), 'Chỉ có một trang /register duy nhất');
assert.match(html, /Buyer accounts are still being built/, 'Phải nói thật là tài khoản người mua chưa mở');
assert.doesNotMatch(html, /Create buyer account|Create your buyer account/i, 'Không được mời tạo tài khoản người mua khi chưa có');

/* 4. Không chặn phễu báo giá: thẻ buyer phải nói rõ không cần đăng nhập */
assert.match(buyerHtml, /no account needed to start/, 'Nói rõ gửi yêu cầu không cần tài khoản');

/* 5. Văn phong: tiếng Anh, không gạch ngang dài, không số liệu marketing */
assert.doesNotMatch(html, /—|–/, 'Không dùng gạch ngang dài trong copy hiển thị');
assert.doesNotMatch(html, /200K|40 million|trusted suppliers/i, 'Không bịa số liệu marketing như trang mẫu');

/* 6. Không lập chỉ mục trang chưa mở xong */
assert.match(source, /robots: \{ index: false, follow: true \}/, 'Trang chọn tài khoản không được lập chỉ mục');

/* 7. Đi tới được từ trang đăng nhập (nếu không thì trang vô hình) */
const loginPage = readFileSync(new URL('app/(auth)/login/page.tsx', root), 'utf8');
assert.match(loginPage, /href="\/register"/, 'Trang đăng nhập phải có lối tới /register');
assert.match(loginPage, /href="\/rfq"/, 'Trang đăng nhập phải nói người mua gửi yêu cầu báo giá không cần đăng nhập');

/* 8. Trang công khai khác vẫn giữ lối đăng ký nhà cung cấp */
const forSuppliers = readFileSync(new URL('app/(public)/for-suppliers/page.tsx', root), 'utf8');
assert.match(forSuppliers, /href="\/supplier\/register"/);

console.log('✅ Register chooser: hai loại tài khoản, đúng đích dẫn, không hứa biểu mẫu chưa có, không chặn phễu báo giá.');
