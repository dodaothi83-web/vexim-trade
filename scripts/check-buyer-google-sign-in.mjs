// node --experimental-strip-types scripts/check-buyer-google-sign-in.mjs
//
// Nút đăng ký / đăng nhập bằng Google ở form người mua.
//
// Vì sao cần check riêng:
//  - Icon Google phải là chữ G bốn màu CHÍNH THỨC (path của Google), không phải chữ "G"
//    tô màu hay ảnh tải từ nguồn ngoài. Sai icon là sai nhận diện thương hiệu Google.
//  - Nút phải dẫn vào luồng của NGƯỜI MUA (`/api/auth/google/buyer/start`), không phải
//    luồng nhà cung cấp, và phải mang theo `next` để không mất ngữ cảnh sau khi quay lại.
//  - Luồng người mua không được cấp quyền nội bộ: callback chỉ ghi `buyer_users` và cookie
//    `vxt_buyer`, tuyệt đối không tạo `app_users`, không đặt `role`.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.join(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function load(rel, mocks) {
  const mod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(read(rel), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      module: mod,
      exports: mod.exports,
      require: (id) => {
        assert.ok(id in mocks, `${rel}: unexpected import ${id}`);
        return mocks[id];
      },
      console,
      URLSearchParams,
    },
    { filename: rel },
  );
  return mod.exports;
}

const nothing = () => null;
const common = {
  react: React,
  "react/jsx-runtime": jsx,
  "next/navigation": { useRouter: () => ({ replace() {}, push() {} }) },
  "lucide-react": new Proxy({}, { get: () => nothing }),
  "@/components/form-challenge": { FormChallenge: nothing },
  "@/app/(public)/buyer/sign-in/actions": {
    requestBuyerSignInAction: async () => ({ ok: true, message: "" }),
    verifyBuyerCodeAction: async () => ({ ok: true, message: "" }),
  },
};

/* 1. Icon: chữ G bốn màu của Google, vẽ bằng SVG nội tuyến. */
const { GoogleGIcon } = load("components/google-g-icon.tsx", common);
const icon = renderToStaticMarkup(React.createElement(GoogleGIcon));
assert.match(icon, /<svg\b/, "Icon Google phải là SVG");
assert.match(icon, /viewBox="0 0 48 48"/, "Icon Google dùng đúng khung 48x48 của Google");
for (const color of ["#4285F4", "#34A853", "#FBBC05", "#EA4335"]) {
  assert.ok(icon.includes(color), `Icon Google thiếu màu ${color}`);
}
assert.match(icon, /aria-hidden="true"/, "Icon trang trí phải ẩn với trình đọc màn hình");
assert.doesNotMatch(icon, /<img|https?:\/\//, "Icon không được tải từ nguồn ngoài");

/* 2. Form: nút Google nằm trên form email, đúng đích, có nhãn chữ. */
const { BuyerSignInForm } = load("components/buyer-sign-in-form.tsx", {
  ...common,
  "@/components/google-g-icon": { GoogleGIcon },
});

let html = renderToStaticMarkup(React.createElement(BuyerSignInForm, {}));
const link = html.match(/<a\b[^>]*href="\/api\/auth\/google\/buyer\/start[^"]*"[^>]*>[\s\S]*?<\/a>/)?.[0];
assert.ok(link, "Form người mua phải có nút Continue with Google");
assert.match(link, /Continue with Google/, "Nút Google phải có nhãn chữ, không chỉ icon");
assert.match(link, /<svg\b/, "Nút Google phải kèm icon Google");
assert.match(link, /#4285F4/, "Nút Google phải dùng icon Google thật (xanh Google)");
assert.doesNotMatch(link, /text-blue-600/, 'Không dùng chữ "G" tô màu thay cho icon Google');
// Nút Google đứng trước ô email, và form email vẫn còn nguyên.
assert.ok(html.indexOf("Continue with Google") < html.indexOf("Work email"), "Nút Google đứng trên form email");
assert.match(html, /Email me a code/, "Luồng email + mã 6 số vẫn giữ nguyên");
assert.doesNotMatch(html, /\/api\/auth\/google\/start\b/, "Không trỏ nhầm vào luồng Google của nhà cung cấp");

html = renderToStaticMarkup(React.createElement(BuyerSignInForm, { next: "/my/rfqs?tab=open" }));
assert.match(
  html,
  /href="\/api\/auth\/google\/buyer\/start\?next=%2Fmy%2Frfqs%3Ftab%3Dopen"/,
  "Nút Google phải mang theo đích quay lại",
);

/* 3. Lỗi OAuth hiện lại đúng chỗ, bằng câu người dùng hiểu được. */
html = renderToStaticMarkup(React.createElement(BuyerSignInForm, { initialOauthError: "Google sign-in was cancelled." }));
assert.match(html, /role="alert"[\s\S]*Google sign-in was cancelled\./, "Lỗi Google phải hiện trong form");

/* 4. Trang đăng nhập: bảng lỗi ?oauth=... có thật. */
const page = read("app/(public)/buyer/sign-in/page.tsx");
assert.match(page, /OAUTH_ERRORS/, "Trang đăng nhập người mua phải dịch mã lỗi ?oauth=");
for (const reason of ["cancelled", "unverified", "unavailable", "rate_limited", "failed", "origin"]) {
  assert.match(page, new RegExp(`${reason}:`), `Thiếu câu cho lỗi oauth=${reason}`);
}
assert.match(page, /initialOauthError=\{oauthError\}/, "Trang phải truyền lỗi Google xuống form");

/* 5. Luồng server: chỉ dành cho người mua, không cấp quyền nội bộ. */
const start = read("app/api/auth/google/buyer/start/route.ts");
assert.match(start, /getBuyerSession/, "Luồng start phải kiểm phiên người mua");
assert.match(start, /GOOGLE_BUYER_FLOW_COOKIE/, "Luồng người mua dùng cookie phiên riêng");
assert.match(start, /safeNextPath/, "next phải được lọc trước khi ghi vào cookie");
assert.match(start, /googleOriginAllowed/, "Phải kiểm origin trước khi phát mã OAuth");
assert.match(start, /scopes: "email profile"/, "Chỉ xin scope email + profile");

const callback = read("app/api/auth/google/buyer/callback/route.ts");
assert.match(callback, /isVerifiedGoogleUser/, "Callback phải đòi email Google đã xác minh");
assert.match(callback, /createBuyerUser/, "Email chưa có tài khoản thì tạo tài khoản người mua");
assert.match(callback, /startBuyerSession/, "Callback phải cấp phiên người mua (vxt_buyer)");
assert.doesNotMatch(callback, /createUser\(|SESSION_COOKIE|role:/, "Callback người mua không được cấp phiên/quyền nội bộ");
assert.doesNotMatch(callback, /getUserByEmail/, "Callback người mua không được tra bảng app_users");

/* 6. Cookie mới phải có trong chính sách cookie. */
assert.match(read("app/(legal)/cookie-policy/page.tsx"), /vxt_google_buyer_flow/, "Chính sách cookie phải nhắc cookie phiên Google của người mua");

console.log("buyer google sign-in: ok");
