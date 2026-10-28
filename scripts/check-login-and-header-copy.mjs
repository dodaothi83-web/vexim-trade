import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function loadTs(rel, mocks = {}) {
  const filename = path.join(root, rel);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    process,
    Buffer,
    console,
    Date,
    require(id) {
      if (id in mocks) return mocks[id];
      if (id === "node:crypto" || id === "crypto") return importCryptoSync;
      throw new Error(`Unmocked import ${id}`);
    },
  }, { filename });
  return module.exports;
}

import importCryptoSync from "node:crypto";

// 1. Auth layout subtitle & Vietnamese legal links
const authLayout = read("app/(auth)/layout.tsx");
assert.match(authLayout, /Cổng nhà cung cấp/);
assert.doesNotMatch(authLayout, /Cổng nhân viên/);
assert.match(authLayout, /href="\/chinh-sach-bao-mat"[^>]*>Chính sách bảo mật/);
assert.match(authLayout, /href="\/dieu-khoan-su-dung"[^>]*>Điều khoản sử dụng/);
assert.doesNotMatch(authLayout, /href="\/privacy-policy"/);
assert.doesNotMatch(authLayout, /href="\/terms-of-service"/);

// 2. Login page copy, Google OAuth not_allowed error, and bottom registration CTA
const loginPage = read("app/(auth)/login/page.tsx");
assert.match(
  loginPage,
  /Quản lý hồ sơ doanh nghiệp, sản phẩm và yêu cầu báo giá từ buyer\./,
);
assert.doesNotMatch(loginPage, /Supabase Auth/);
assert.doesNotMatch(loginPage, /Vexim phải duyệt trước khi mở các chức năng/);
assert.match(loginPage, /Email này chưa có tài khoản nhà cung cấp\./);
assert.match(loginPage, /href="\/supplier\/register"[^>]*>\s*Đăng ký tại đây\.\s*<\/Link>/);
assert.match(loginPage, /href="\/supplier\/register"[^>]*>\s*Đăng ký miễn phí\s*<\/Link>/);
assert.doesNotMatch(loginPage, /Tạo tài khoản nhà cung cấp/);

// 3. Approval note moved to supplier registration & post-login portal overview
const registerPage = read("app/(auth)/supplier/register/page.tsx");
assert.match(registerPage, /cần Vexim duyệt/);
const portalPage = read("app/supplier/portal/page.tsx");
assert.match(portalPage, /cần Vexim duyệt/);

// 4. Login form: email@congty.com placeholder, "Quên mật khẩu?" link, removed Google note
const loginForm = read("components/login-form.tsx");
assert.match(loginForm, /placeholder="email@congty\.com"/);
assert.doesNotMatch(loginForm, /ten@veximtrade\.com/);
assert.match(loginForm, /href="\/auth\/forgot-password"/);
assert.match(loginForm, /Quên mật khẩu\?/);
assert.doesNotMatch(loginForm, /Google chỉ xác thực email/);

// 5. Buyer header button says "Supplier sign in"
const publicSignIn = read("components/public-sign-in-link.tsx");
assert.match(publicSignIn, /"Supplier sign in"/);
assert.doesNotMatch(publicSignIn, /:\s*"Sign in"/);

// 6. Password-reset HMAC token single-use & expiry guarantees
const resetLib = loadTs("lib/auth/password-reset.ts", {
  "@/lib/auth/secret": { getAuthSecret: () => "unit-test-secret-32-chars-minimum!!" },
});
const baseUser = {
  id: "u-1",
  email: "supplier@congty.com",
  password_hash: "scrypt$oldhash",
  is_active: true,
  role: "supplier",
};
const now = 1_700_000_000_000;
const token = resetLib.createPasswordResetToken({
  uid: baseUser.id,
  email: baseUser.email,
  passwordHash: baseUser.password_hash,
  nowMs: now,
});

assert.equal(resetLib.verifyPasswordResetTokenForUser(token, baseUser, now + 60_000).ok, true);
assert.equal(
  resetLib.verifyPasswordResetTokenForUser(token, baseUser, now + 31 * 60_000).ok,
  false,
  "Expired after 30 minutes",
);
assert.equal(
  resetLib.verifyPasswordResetTokenForUser(
    token,
    { ...baseUser, password_hash: "scrypt$newhash" },
    now + 60_000,
  ).ok,
  false,
  "Immediately invalidated once password_hash changes",
);
assert.equal(
  resetLib.verifyPasswordResetTokenForUser(token + "tamper", baseUser, now + 60_000).ok,
  false,
  "Tampered signature rejected",
);

console.log("Login & buyer header copy + password reset checks passed.");
