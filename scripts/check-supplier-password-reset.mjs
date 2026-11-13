// node --experimental-strip-types --no-warnings scripts/check-supplier-password-reset.mjs
// Nhân viên gửi link đặt lại mật khẩu cho nhà cung cấp: token 24 giờ, dùng một lần, mở
// bằng đúng trang /auth/reset-password; nhân viên không đặt mật khẩu thay doanh nghiệp.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mocks) {
  const out = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, Buffer, Date, URL, encodeURIComponent, console: { ...console, error() {} }, process,
    require: (id) => { if (id === 'node:crypto') return { ...crypto, default: crypto }; assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id]; } });
  return module.exports;
}

const reset = load('lib/auth/password-reset.ts', { '@/lib/auth/secret': { getAuthSecret: () => 'test-secret-for-reset-links-0123456789' } });
const sent = [];
let fail = false;
const staff = load('lib/auth/staff-password-reset.ts', {
  'server-only': {}, '@/lib/auth/password-reset': reset,
  '@/lib/email/send': { transport: async (mail) => { sent.push(mail); return fail ? { ok: false, error: 'smtp down' } : { ok: true }; } },
  '@/lib/email/templates': { escapeHtml: (v) => String(v).replaceAll('<', '&lt;'), wrapPlainEmail: ({ body }) => body },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
});

const now = Date.parse('2026-11-13T02:00:00Z');
const supplier = { id: 'u-sup', email: 'Supply1@gmail.com', name: 'Supply1', password_hash: null };
const result = await staff.sendStaffPasswordReset(supplier, now);
assert.equal(result.emailed, true);
assert.deepEqual([...sent[0].to], ['Supply1@gmail.com'], 'Thư gửi tới email đăng nhập của tài khoản');
assert.match(result.url, /^https:\/\/www\.veximtrade\.com\/auth\/reset-password\?token=/, 'Dùng đúng trang đặt lại mật khẩu');
assert.ok(sent[0].html.includes(result.url.replaceAll('&', '&amp;')) || sent[0].html.includes(result.url));
assert.match(sent[0].html, /24 giờ/);
assert.equal(result.expiresAt, new Date(now + 24 * 3600_000).toISOString());

const token = decodeURIComponent(result.url.split('token=')[1]);
assert.equal(reset.decodePasswordResetToken(token, now + 23 * 3600_000).ok, true, 'Còn hiệu lực trong 24 giờ');
assert.equal(reset.decodePasswordResetToken(token, now + 24 * 3600_000 + 1000).ok, false, 'Hết hạn sau 24 giờ');
assert.equal(reset.verifyPasswordResetTokenForUser(token, { id: 'u-sup', email: 'supply1@gmail.com', password_hash: null, is_active: true, role: 'supplier' }, now).ok, true);
assert.equal(reset.verifyPasswordResetTokenForUser(token, { id: 'u-sup', email: 'supply1@gmail.com', password_hash: 'new-hash', is_active: true, role: 'supplier' }, now).ok, false,
  'Đặt mật khẩu xong thì link cũ không dùng lại được');

fail = true;
const failed = await staff.sendStaffPasswordReset(supplier, now);
assert.equal(failed.emailed, false, 'Email lỗi vẫn trả link để nhắn qua Zalo');
assert.match(failed.url, /token=/);

process.env.SUPPLIER_SIGNUP_REDIRECT_URL = 'https://portal.example.com/supplier/register';
assert.equal(staff.passwordResetOrigin(), 'https://portal.example.com');
process.env.SUPPLIER_SIGNUP_REDIRECT_URL = 'http://insecure.example.com';
assert.equal(staff.passwordResetOrigin(), 'https://www.veximtrade.com', 'Không dùng origin không phải https');
delete process.env.SUPPLIER_SIGNUP_REDIRECT_URL;

const actions = fs.readFileSync(new URL('../app/auth-actions.ts', import.meta.url), 'utf8');
const action = actions.slice(actions.indexOf('export async function sendSupplierPasswordResetAction'), actions.indexOf('async function updateSupabasePasswordSilent'));
assert.match(action, /guard\("users\.manage"\)/, 'Chỉ người có quyền quản lý người dùng');
assert.match(action, /target\.role !== "supplier"/, 'Chỉ cho tài khoản nhà cung cấp');
assert.match(action, /!target\.is_active/, 'Tài khoản bị khoá không gửi link');
assert.match(action, /user\.password_reset_link_sent/, 'Ghi nhật ký');
assert.doesNotMatch(action, /hashPassword|updateSupabasePassword/, 'Nhân viên không đặt mật khẩu thay doanh nghiệp');
const ui = fs.readFileSync(new URL('../components/user-manager.tsx', import.meta.url), 'utf8');
assert.match(ui, /user\.role === "supplier" && <Button[\s\S]{0,200}sendResetLink/, 'Nút chỉ hiện ở tài khoản nhà cung cấp');
console.log('✅ Đặt lại mật khẩu nhà cung cấp: link 24 giờ, dùng một lần, đúng email đăng nhập, email lỗi vẫn có link, chỉ quản trị gửi được.');
