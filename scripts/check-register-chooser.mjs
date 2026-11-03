// node --experimental-strip-types scripts/check-register-chooser.mjs
//
// Trang /register là cửa vào tài khoản duy nhất và phải tách rõ hai loại người dùng.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
import { loadAuthDictionary } from './lib/auth-dictionary.mjs';

const root = new URL('..', import.meta.url);
const file = 'app/(auth)/register/page.tsx';
const chooserFile = 'app/(auth)/register/account-type-chooser.tsx';
const source = readFileSync(new URL(file, root), 'utf8');
// Trang đọc từ điển theo cookie ngôn ngữ; check chạy với bản tiếng Anh (mặc định).
const authMessages = loadAuthDictionary();
const i18nServer = { getAuthMessages: async () => ({ locale: 'en', m: authMessages.en }) };

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
        '@/lib/i18n/server': i18nServer,
        '@/components/auth-split-shell': { AuthSplitShell: ({ children }) => React.createElement('div', { 'data-split-shell': true }, children) },
        './account-type-chooser': { AccountTypeChooser: () => React.createElement('div', { 'data-chooser': true }) },
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
const html = renderToStaticMarkup(await Page());

/* 1. Trang bọc trong khung hai cột và nhúng bộ chọn loại tài khoản */
assert.match(html, /data-split-shell="true"/, 'Trang đăng ký dùng khung hai cột có ảnh bên trái');
assert.match(html, /data-chooser="true"/, 'Trang đăng ký nhúng bộ chọn loại tài khoản');

/* 2. Bộ chọn: hai lựa chọn, radio, đích dẫn riêng cho từng loại */
const chooserSource = readFileSync(new URL(chooserFile, root), 'utf8');
const chooser = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(chooserSource, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  {
    module: chooser,
    exports: chooser.exports,
    require: (id) => {
      const mocks = {
        react: React,
        'react/jsx-runtime': jsx,
        'next/link': { default: Link },
        'lucide-react': icons,
        '@/components/ui': { cx: (...parts) => parts.filter(Boolean).join(' ') },
      };
      assert.ok(id in mocks, `${chooserFile}: unexpected import ${id}`);
      return mocks[id];
    },
    console,
  },
  { filename: chooserFile },
);
const chooserHtml = renderToStaticMarkup(
  React.createElement(chooser.exports.AccountTypeChooser, { messages: authMessages.en.register, lang: 'en' }),
);
assert.match(chooserHtml, /Which account would you like to create\?/, 'Có câu hỏi chọn loại tài khoản');
assert.equal((chooserHtml.match(/type="radio"/g) ?? []).length, 2, 'Hai lựa chọn dạng radio');
assert.match(chooserHtml, /value="buyer"/);
assert.match(chooserHtml, /value="supplier"/);
assert.match(chooserHtml, />Continue</, 'Có nút Continue');
assert.match(chooserHtml, /href="\/buyer\/sign-in\?next=\/rfq"/, 'Buyer đăng nhập trước khi tới form báo giá');
assert.match(chooserSource, /\/supplier\/register\?type=supplier/, 'Supplier dẫn tới biểu mẫu');
assert.match(chooserSource, /choice === "buyer" \? "\/buyer\/sign-in\?next=\/rfq" : "\/login"/, 'Lối đăng nhập theo loại tài khoản');
assert.ok(!existsSync(new URL('app/(public)/register', root)), 'Chỉ có một trang /register duy nhất');
assert.doesNotMatch(html + chooserHtml, /Buyer accounts are still being built|No account needed/i);
for (const [locale, copy] of Object.entries(authMessages)) {
  const rendered = renderToStaticMarkup(React.createElement(chooser.exports.AccountTypeChooser, { messages: copy.register, lang: locale }));
  assert.match(rendered, /href="\/buyer\/sign-in\?next=\/rfq"/);
  assert.match(copy.register.buyerSummary, locale === 'vi' ? /miễn phí.*email.*không cần mật khẩu/i : /free.*email.*no password/i);
  assert.doesNotMatch(copy.register.buyerNoteLead + copy.register.buyerNote, /đang được xây dựng|still being built/i);
}

/* 5. Văn phong: tiếng Anh, không gạch ngang dài, không số liệu marketing */
assert.doesNotMatch(html + chooserHtml, /—|–/, 'Không dùng gạch ngang dài trong copy hiển thị');
assert.doesNotMatch(html + chooserHtml, /200K|40 million|trusted suppliers/i, 'Không bịa số liệu marketing như trang mẫu');

/* 6. Không lập chỉ mục trang chưa mở xong */
assert.match(source, /robots: \{ index: false, follow: true \}/, 'Trang chọn tài khoản không được lập chỉ mục');

/* 7. Đi tới được từ trang đăng nhập (nếu không thì trang vô hình) */
const loginPage = readFileSync(new URL('app/(auth)/login/page.tsx', root), 'utf8');
assert.match(loginPage, /href="\/register"/, 'Trang đăng nhập phải có lối tới /register');
assert.match(loginPage, /AuthSplitShell/, 'Trang đăng nhập dùng cùng khung hai cột');

/* 7b. Form đăng ký nhà cung cấp chỉ còn form: đoạn giải thích dài đã chuyển sang màn chọn */
const supplierRegister = readFileSync(new URL('app/(auth)/supplier/register/page.tsx', root), 'utf8');
assert.match(supplierRegister, /AuthSplitShell/, 'Form đăng ký nhà cung cấp dùng cùng khung hai cột');
assert.doesNotMatch(supplierRegister, /Đăng ký miễn phí bằng email hoặc Google\. Sau khi đăng nhập/, 'Đoạn văn dài đã được bỏ khỏi form');
assert.match(supplierRegister, /href="\/register"/, 'Form có lối đổi loại tài khoản');
// Bước 1 luôn là chọn loại: vào thẳng URL này mà thiếu ?type=supplier thì quay về màn chọn.
assert.match(supplierRegister, /type !== "supplier"\s*\)\s*redirect\("\/register"\)|if \(type !== "supplier"\) redirect\("\/register"\)/,
  'Trang form phải redirect về /register khi thiếu type=supplier');
const loginSource = readFileSync(new URL('app/(auth)/login/page.tsx', root), 'utf8');
assert.match(loginSource, /href="\/register"/, 'Lối đăng ký từ trang đăng nhập đi qua màn chọn loại');
assert.doesNotMatch(loginSource, /href="\/supplier\/register"/, 'Không còn lối tắt nhảy thẳng vào form bán hàng');

/* 7c. Ảnh cột trái là ảnh có thật trong kho ảnh của site, không phải ảnh ngoài */
const shell = readFileSync(new URL('components/auth-split-shell.tsx', root), 'utf8');
assert.match(shell, /src="\/images\/existing|[a-z]/.source ? /\/images\/[a-z-]+\.jpg/ : /x/, 'Khung dùng ảnh trong /public/images');
assert.match(shell, /hero-scene\.jpg/, 'Dùng ảnh hero có sẵn của site');
assert.ok(existsSync(new URL('public/images/hero-scene.jpg', root)), 'Ảnh phải tồn tại trong repo');
assert.doesNotMatch(shell, /https?:\/\//, 'Không tải ảnh từ nguồn ngoài');
assert.match(loginPage, /href="\/rfq"/, 'Trang đăng nhập phải nói người mua gửi yêu cầu báo giá không cần đăng nhập');

/* 8. Trang công khai khác vẫn giữ lối đăng ký nhà cung cấp */
const forSuppliers = readFileSync(new URL('app/(public)/for-suppliers/page.tsx', root), 'utf8');
assert.match(forSuppliers, /href="\/register"/, 'Lối đăng ký nhà cung cấp từ trang /for-suppliers đi qua màn chọn loại');

console.log('✅ Register chooser: hai loại tài khoản, đúng đích dẫn và nội dung tài khoản người mua.');
