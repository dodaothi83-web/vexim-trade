// node scripts/check-form-challenge.mjs — challenge chống bot tự chủ (thay Turnstile):
// hợp đồng client↔server, widget không gọi ra ngoài, route phát challenge, nối dây form.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { TextEncoder } from 'node:util';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';

function transpile(path, jsx = false) {
  return ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
  }).outputText;
}

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
// Object từ vm realm khác prototype với host — so sâu qua JSON thay vì deepEqual chặt.
const deepEqual = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);

/* ---------- 1. Hợp đồng client ↔ server: solver của widget giải được cái server phát ---------- */
const challengeEnv = { NODE_ENV: 'production', CHALLENGE_DIFFICULTY: '2' };
const challengeMod = { exports: {} };
vm.runInNewContext(transpile('../lib/security/challenge.ts'), {
  module: challengeMod, exports: challengeMod.exports, console, Buffer,
  process: { env: challengeEnv },
  require: (key) => {
    if (key === 'server-only') return {};
    if (key === 'node:crypto') return crypto;
    if (key === '@/lib/auth/secret') return { getAuthSecret: () => 'check-form-challenge-secret' };
    assert.fail(`Unexpected import ${key} in lib/security/challenge.ts`);
  },
}, { filename: 'lib/security/challenge.ts' });
const { issueFormChallenge, verifyFormChallenge } = challengeMod.exports;

const widget = { exports: {} };
vm.runInNewContext(transpile('../components/form-challenge.tsx', true), {
  module: widget, exports: widget.exports, console,
  crypto: crypto.webcrypto, TextEncoder, setTimeout,
  require: (key) => {
    if (key === 'react') return React;
    if (key === 'react/jsx-runtime') return jsxRuntime;
    if (key === 'lucide-react') return new Proxy({}, { get: () => () => null });
    assert.fail(`Unexpected import ${key} in components/form-challenge.tsx`);
  },
}, { filename: 'components/form-challenge.tsx' });
const { FormChallenge, solveFormChallenge, CHALLENGE_DISABLED_TOKEN } = widget.exports;
assert.equal(typeof solveFormChallenge, 'function', 'Solver được xuất riêng để kiểm thử hợp đồng');

for (const purpose of ['login', 'supplier-signup', 'admin-setup', 'service-inquiry', 'rfq']) {
  const issued = issueFormChallenge(purpose);
  const solved = await solveFormChallenge(issued);
  assert.ok(solved, `${purpose}: solver của widget phải giải được challenge của server (difficulty 2)`);
  deepEqual(verifyFormChallenge({ purpose, token: solved }), { ok: true },
    `${purpose}: server xác nhận đúng token client giải ra`);
}
// Token dùng lại lần hai bị từ chối (đã kiểm ở check-auth-security; ở đây chắn thêm cho hợp đồng).
const consumed = await solveFormChallenge(issueFormChallenge('login'));
assert.equal(verifyFormChallenge({ purpose: 'login', token: consumed }).ok, true);
deepEqual(verifyFormChallenge({ purpose: 'login', token: consumed }), { ok: false, reason: 'replayed' });
// Solver từ chối challenge sai dạng.
assert.equal(await solveFormChallenge('not-a-challenge'), null);
assert.equal(CHALLENGE_DISABLED_TOKEN, '__challenge_disabled__');

/* ---------- 2. Widget: không một request/script nào ra ngoài ---------- */
const widgetSource = read('../components/form-challenge.tsx');
assert.doesNotMatch(widgetSource, /challenges\.cloudflare\.com|turnstile\/v0|api\.js|next\/script/i,
  'Widget không tải hay gọi bất kỳ tài nguyên ngoài nào');
assert.match(widgetSource, /\/api\/challenge\?purpose=\$\{encodeURIComponent\(purpose\)\}/, 'Challenge lấy từ chính site');
assert.match(widgetSource, /cache: "no-store"/, 'Không bao giờ nhận challenge từ cache');
assert.match(widgetSource, /globalThis\.crypto\.subtle\.digest\("SHA-256"/, 'Proof-of-work dùng WebCrypto chuẩn');
assert.match(widgetSource, /YIELD_EVERY_BATCHES/, 'Nhả luồng UI giữa các lô băm');
assert.match(widgetSource, /cancelled = true/, 'Unmount hủy solver, không setState sau khi tháo');
assert.match(widgetSource, /payload\.disabled/, 'Widget tôn trọng công tắc CHALLENGE_DISABLED');
assert.match(widgetSource, /Try again/);
assert.doesNotMatch(widgetSource, /Troubleshoot/, 'Không render link lỗi mặc định của bên thứ ba');

// SSR: luồng bình thường HOÀN TOÀN ẨN — chỉ còn dòng sr-only cho trình đọc màn hình,
// không còn khung kỹ thuật "Security check complete" chiếm chỗ.
const html = renderToStaticMarkup(React.createElement(FormChallenge, { purpose: 'login', onChange: () => {} }));
assert.match(html, /data-form-challenge-status="loading"/);
assert.match(html, /Loading security check/);
assert.match(html, /sr-only/, 'Trạng thái bình thường chỉ còn cho trình đọc màn hình');
assert.doesNotMatch(html, /min-h-\[65px\]|rounded-xl border/, 'Không còn khung viền lộ giao diện kỹ thuật');
assert.doesNotMatch(html, /Troubleshoot/);
assert.doesNotMatch(widgetSource, /min-h-\[65px\]/, 'Widget không còn khung 65px');
assert.match(widgetSource, /role="alert"/, 'Lỗi thật vẫn có dòng nhỏ báo + thử lại, không khóa nút submit vô lý');

/* ---------- 3. Route phát challenge ---------- */
const routeSource = read('../app/api/challenge/route.ts');
assert.match(routeSource, /export const dynamic = "force-dynamic"/, 'Route phát challenge không được cache');
assert.match(routeSource, /"cache-control": "no-store"/);
assert.match(routeSource, /CHALLENGE_PURPOSES\.includes/, 'Purpose phải nằm trong danh cho phép');
assert.match(routeSource, /rateLimit\(/, 'Endpoint có giới hạn theo IP');
assert.match(routeSource, /issueFormChallenge\(purpose/);

/* ---------- 4. Nối dây form: mọi form dùng challenge, không còn Turnstile ---------- */
const loginForm = read('../components/login-form.tsx');
const setupForm = read('../components/setup-form.tsx');
const signupForm = read('../app/(auth)/supplier/register/supplier-account-form.tsx');
const rfqForm = read('../app/(public)/rfq/rfq-form.tsx');
const serviceForm = read('../components/service-registration-section.tsx');
assert.match(loginForm, /<FormChallenge key=\{challengeVersion\} purpose="login"/);
assert.match(setupForm, /<FormChallenge key=\{challengeVersion\} purpose="admin-setup"/);
assert.match(signupForm, /<FormChallenge key=\{challengeVersion\} purpose="supplier-signup"/);
assert.match(rfqForm, /<FormChallenge purpose="rfq"/);
assert.match(serviceForm, /<FormChallenge key=\{challengeVersion\} purpose="service-inquiry"/);
for (const [name, source] of [['login', loginForm], ['supplier signup', signupForm], ['admin setup', setupForm], ['service registration', serviceForm]]) {
  assert.match(source, /resetChallenge\(\)/, `${name} remounts the challenge after a failed submission`);
  assert.match(source, /disabled=\{busy \|\| [^\n]*!challengeToken\}/, `${name} keeps the button locked until the challenge is solved`);
}
assert.match(loginForm, /loginAction\(email, password, challengeToken\)/);
assert.match(setupForm, /setupAdminAction\(email, name, password, password2, challengeToken\)/);
assert.match(signupForm, /form\.set\("challenge_token", challengeToken\)/);
assert.match(serviceForm, /formData\.set\("challenge_token", challengeToken\)/);
assert.match(rfqForm, /challenge_token: challengeToken/);
assert.match(signupForm, /name="website_hp"/, 'Signup giữ honeypot');
assert.match(serviceForm, /name="website_hp"/, 'Service form giữ honeypot');
assert.match(rfqForm, /honeypot: data\.websiteHp/, 'RFQ giữ honeypot');

// Không còn vết Turnstile nào trong code chạy (chỉ cho phép 2 file mới nhắc tên để ghi bối cảnh thay thế).
const allowed = new Set(['lib/security/challenge.ts', 'components/form-challenge.tsx']);
const leftovers = [];
for (const dir of ['app', 'lib', 'components']) {
  const walk = (folder) => {
    for (const entry of fs.readdirSync(new URL(`../${folder}`, import.meta.url), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const rel = `${folder}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(entry.name) && !allowed.has(rel)) {
        if (/turnstile/i.test(fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'))) leftovers.push(rel);
      }
    }
  };
  walk(dir);
}
deepEqual(leftovers, [], 'Không còn tham chiếu Turnstile trong code');

// Trang server không còn truyền site key cho form.
for (const page of ['app/(auth)/login/page.tsx', 'app/(auth)/setup/page.tsx', 'app/(auth)/supplier/register/page.tsx', 'app/(public)/rfq/page.tsx', 'app/(public)/home.tsx']) {
  assert.doesNotMatch(read(`../${page}`), /turnstileSiteKey|TURNSTILE/, `${page} không còn nối site key`);
}

console.log('✅ Form challenge (PoW tự chủ): hợp đồng client↔server, widget không gọi ra ngoài, route + 5 form + honeypot + dọn sạch Turnstile passed.');
