// node scripts/check-supplier-signup-mail.mjs
// Nhà cung cấp nhận thư sau khi tạo tài khoản và sau khi gửi hồ sơ doanh nghiệp (chủ dự án 27/11/2026);
// trang đăng ký không còn nhãn "Bước 1/2".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const sent = [];
const mocks = {
  'server-only': {},
  '@/lib/config': { SERVICE_FROM_ADDRESS: 'Vexim <service@example.test>' },
  '@/lib/db': { getStore: () => ({ listUsers: async () => [] }) },
  '@/lib/email/send': { transport: async (mail) => { sent.push(mail); return { ok: true, status: 'simulated' }; } },
  '@/lib/email/templates': {
    escapeHtml: (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    wrapPlainEmail: ({ title, body }) => `<title>${title}</title>${body}`,
  },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  '@/lib/certificate-supplier-copy': { formatCertificateDate: () => '' },
  '@/lib/supplier-plans': { SUPPLIER_PLAN_LABELS: {} },
  '@/lib/supplier-plan-catalog': { readPlanCatalog: async () => ({}) },
};
const code = ts.transpileModule(source('../lib/supplier-portal/notify.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, console, process, URL, Promise,
  require: (id) => { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id]; } });
const notify = mod.exports;

assert.equal(await notify.notifySupplierAccountWelcome({ email: ' New@Supplier.VN ', provider: 'email' }), 'simulated');
const welcome = sent.pop();
assert.equal(welcome.to.join(), 'new@supplier.vn', 'Welcome goes only to the new supplier');
assert.equal(welcome.subject, 'Chào mừng bạn đến với Vexim Trade');
assert.match(welcome.html, /new@supplier\.vn/);
assert.match(welcome.html, /href="https:\/\/www\.veximtrade\.com\/supplier\/portal"/);
assert.match(welcome.html, /1 ngày làm việc/);
assert.match(welcome.html, /email và mật khẩu/);
assert.match(welcome.text, /Hoàn thiện hồ sơ doanh nghiệp: https:\/\/www\.veximtrade\.com\/supplier\/portal/);
await notify.notifySupplierAccountWelcome({ email: 'g@supplier.vn', provider: 'google' });
assert.match(sent.pop().html, /đăng nhập bằng Google/);
assert.equal(await notify.notifySupplierAccountWelcome({ email: '  ', provider: 'email' }), 'failed');

assert.equal(await notify.notifySupplierProfileReceived({ email: 'new@supplier.vn', supplierName: 'Công ty <A>\nB' }), 'simulated');
const receipt = sent.pop();
assert.equal(receipt.to.join(), 'new@supplier.vn');
assert.equal(receipt.subject, 'Vexim đã nhận hồ sơ doanh nghiệp của bạn');
assert.match(receipt.html, /Công ty &lt;A&gt; B/, 'Company name is escaped and kept on one line');
assert.match(receipt.html, /Xem trạng thái hồ sơ/);
assert.doesNotMatch(receipt.html + welcome.html, /duyệt hồ sơ của bạn thành công|đã được duyệt/, 'Neither mail claims an approval');

const signup = source('../app/api/supplier-signup/route.ts');
assert.match(signup, /needsEmailConfirmation \? Promise\.resolve\("skipped" as const\) : notifySupplierAccountWelcome\(\{ email, provider: "email" \}\)/,
  'Email signup sends the welcome, except when Supabase already sends its own confirmation mail');
assert.ok(signup.lastIndexOf('notifySupplierAccountWelcome') > signup.indexOf('store.createUser'), 'Welcome is sent only after the account is saved');
assert.ok(source('../app/api/auth/google/callback/route.ts').includes('notifySupplierAccountWelcome({ email: user.email, provider: "google" })'),
  'Google signup sends the welcome too');
const profile = source('../app/api/supplier-portal/profile/route.ts');
assert.ok(profile.includes('notifySupplierProfileReceived({ email: user.email, supplierName: supplier.name })'),
  'Submitting the business profile sends the supplier a receipt');

const auth = source('../lib/i18n/auth.ts');
const page = source('../app/(auth)/supplier/register/page.tsx');
assert.doesNotMatch(auth, /Step 1 of 2|Bước 1\/2/, 'No step counter in the registration copy');
assert.ok(!page.includes('copy.step'), 'Registration page has no step label');
assert.ok(auth.includes('title: "Tạo tài khoản nhà cung cấp"') && auth.includes('title: "Create a supplier account"'));

console.log('✅ Supplier signup: welcome and profile-receipt mails to the supplier; no step counter on the form.');
