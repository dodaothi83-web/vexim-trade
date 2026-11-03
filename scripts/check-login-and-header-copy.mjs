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
import { loadAuthDictionary } from "./lib/auth-dictionary.mjs";

// Chuỗi hiển thị của khu vực tài khoản nay nằm trong từ điển (lib/i18n/auth.ts), không
// còn viết cứng trong component. Kiểm văn phong đọc đúng bản tiếng Việt của từ điển để
// không phải sửa test mỗi lần đổi câu chữ ở một ngôn ngữ.
const authMessages = loadAuthDictionary();
const vi = authMessages.vi;

// 1. Khung trang tài khoản: hai cột, liên kết pháp lý tiếng Việt
//    (layout chỉ còn là khung nền, nên kiểm văn phong ở khung dùng chung)
const authShell = read("components/auth-split-shell.tsx");
assert.equal(vi.shell.privacy, "Chính sách bảo mật");
assert.equal(vi.shell.terms, "Điều khoản sử dụng");
assert.match(authShell, /href="\/chinh-sach-bao-mat"/);
assert.match(authShell, /href="\/dieu-khoan-su-dung"/);
assert.doesNotMatch(authShell, /href="\/privacy-policy"/);
assert.doesNotMatch(authShell, /href="\/terms-of-service"/);
assert.doesNotMatch(authShell, /Cổng nhân viên/);
// Công tắc ngôn ngữ nằm trong khung để mọi trang tài khoản đổi được ngôn ngữ.
assert.match(authShell, /LocaleSwitch/);
// Layout không được bọc thêm thẻ thứ hai quanh khung đã có
const authLayout = read("app/(auth)/layout.tsx");
assert.doesNotMatch(authLayout, /className="card/, "Layout không bọc thẻ lồng thẻ");
assert.doesNotMatch(authLayout, /bg-gradient-to-br/, "Nền tối đã chuyển vào ảnh của khung hai cột");

// 2. Login page copy, Google OAuth not_allowed error, and bottom registration CTA
const loginPage = read("app/(auth)/login/page.tsx");
assert.match(vi.login.subtitle, /Quản lý hồ sơ doanh nghiệp, sản phẩm và yêu cầu báo giá/);
assert.doesNotMatch(loginPage, /Supabase Auth/);
assert.doesNotMatch(loginPage, /Vexim phải duyệt trước khi mở các chức năng/);
assert.match(vi.login.noSupplierAccount, /Email này chưa có tài khoản nhà cung cấp\./);
assert.match(loginPage, /href="\/register"[^>]*>\s*\{m\.login\.registerHere\}\s*<\/Link>/, "Lối đăng ký đi qua màn chọn loại tài khoản");
assert.match(loginPage, /href="\/register"[^>]*>\s*\{m\.login\.registerFree\}\s*<\/Link>/);
assert.doesNotMatch(loginPage, /\/supplier\/register/, "Trang đăng nhập không còn lối tắt vào form bán hàng");
assert.doesNotMatch(loginPage, /Tạo tài khoản nhà cung cấp/);

// 3. Approval note moved to supplier registration & post-login portal overview
const registerPage = read("app/(auth)/supplier/register/page.tsx");
assert.match(vi.supplierRegister.note, /cần Vexim duyệt/);
assert.match(registerPage, /note=\{copy\.note\}/, "Ghi chú duyệt hồ sơ hiện dưới thẻ của trang đăng ký");
const portalPage = read("app/supplier/portal/page.tsx");
assert.match(portalPage, /Vexim duyệt hồ sơ/);

// 4. Login form: email@congty.com placeholder, "Quên mật khẩu?" link, removed Google note
const loginForm = read("components/login-form.tsx");
assert.equal(vi.login.emailPlaceholder, "email@congty.com");
assert.match(loginForm, /placeholder=\{m\.emailPlaceholder\}/);
assert.doesNotMatch(loginForm, /ten@veximtrade\.com/);
assert.match(loginForm, /href="\/auth\/forgot-password"/);
assert.match(vi.login.forgotPassword, /Quên mật khẩu\?/);
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
