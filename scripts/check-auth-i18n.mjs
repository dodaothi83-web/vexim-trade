// node --experimental-strip-types scripts/check-auth-i18n.mjs
//
// Giai đoạn 1 của i18n: khu vực tài khoản chạy bằng từ điển (lib/i18n/auth.ts).
//
// Vì sao cần check riêng: `check:copy` và `check-ui-copy.mjs` chỉ quét chuỗi TIẾNG VIỆT,
// nên câu tiếng Anh viết cứng trong component sẽ lọt hoàn toàn. Check này bắt đúng lớp lỗi
// đó, cộng thêm ba lỗi hay gặp khi tách chuỗi ra từ điển:
//  - bản dịch thiếu/thừa khoá so với bản gốc (TypeScript bắt được, nhưng chỉ khi build);
//  - tiếng Việt còn sót trong file đã "chuyển sang tiếng Anh";
//  - ngôn ngữ của thẻ <html lang> lệch với ngôn ngữ người dùng đã chọn.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

import { loadAuthDictionary } from "./lib/auth-dictionary.mjs";

const root = path.join(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const authMessages = loadAuthDictionary();
const { en, vi } = authMessages;

/* 1. Bản dịch phải phủ đúng bộ khoá của bản gốc, cùng kiểu dữ liệu. */
function shape(value, trail) {
  if (typeof value === "string") return [[trail, "string"]];
  if (Array.isArray(value)) {
    assert.ok(value.length > 0, `${trail}: mảng rỗng`);
    return value.flatMap((item, index) => shape(item, `${trail}[${index}]`));
  }
  return Object.entries(value).flatMap(([key, item]) => shape(item, trail ? `${trail}.${key}` : key));
}
assert.deepEqual(shape(vi, ""), shape(en, ""), "Bản tiếng Việt phải có đúng bộ khoá của bản tiếng Anh");

/** Liệt kê [đường dẫn, chuỗi] để kiểm từng câu, kể cả câu nằm trong mảng. */
function leaves(value, trail) {
  if (typeof value === "string") return [[trail, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => leaves(item, `${trail}[${index}]`));
  return Object.entries(value).flatMap(([key, item]) => leaves(item, trail ? `${trail}.${key}` : key));
}

/* 2. Tiếng Anh không được chứa dấu tiếng Việt (lỗi copy-paste khi tách chuỗi). */
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậđêềếểễệôồốổỗộơờớởỡợưừứửữựỳýỷỹỵ]/i;
for (const [key, text] of leaves(en, "")) {
  assert.doesNotMatch(text, VIETNAMESE, `Chuỗi tiếng Anh ${key} còn dấu tiếng Việt`);
  assert.ok(text.trim().length > 0, `Chuỗi tiếng Anh ${key} rỗng`);
  assert.doesNotMatch(text, /[—–]/, `${key} dùng gạch ngang dài`);
}
for (const [key, text] of leaves(vi, "")) {
  assert.ok(text.trim().length > 0, `Chuỗi tiếng Việt ${key} rỗng`);
  assert.doesNotMatch(text, /[—–]/, `${key} dùng gạch ngang dài`);
}

/* 3. Không còn chuỗi UI viết cứng trong các file đã chuyển sang từ điển. */
const STRIPPED = [
  "app/(auth)/login/page.tsx",
  "app/(auth)/register/page.tsx",
  "app/(auth)/register/account-type-chooser.tsx",
  "app/(auth)/supplier/register/page.tsx",
  "app/(auth)/supplier/register/supplier-account-form.tsx",
  "app/(auth)/auth/forgot-password/page.tsx",
  "app/(auth)/auth/forgot-password/forgot-password-form.tsx",
  "app/(auth)/auth/reset-password/page.tsx",
  "app/(auth)/auth/reset-password/reset-password-form.tsx",
  "components/login-form.tsx",
  "components/auth-split-shell.tsx",
  "components/locale-switch.tsx",
];
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join("\n");
}
for (const file of STRIPPED) {
  assert.doesNotMatch(
    withoutComments(read(file)),
    VIETNAMESE,
    `${file}: còn chuỗi tiếng Việt ngoài comment — chuỗi hiển thị phải nằm trong từ điển`,
  );
}

/* 4. Trang đăng nhập render đúng ngôn ngữ đã chọn, không lẫn hai thứ tiếng. */
const Link = ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children);
const icons = new Proxy({}, { get: () => (props) => React.createElement("svg", props) });
const jsxRuntime = jsx;

function load(rel, mocks, locale) {
  const filename = path.join(root, rel);
  const mod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module: mod,
      exports: mod.exports,
      console,
      URL,
      require: (id) => {
        if (id === "react") return React;
        if (id === "react/jsx-runtime") return jsxRuntime;
        if (id === "next/link") return { default: Link };
        if (id === "lucide-react") return icons;
        if (id === "@/lib/i18n/server") return { getAuthMessages: async () => ({ locale, m: authMessages[locale] }) };
        assert.ok(id in mocks, `${rel}: unexpected import ${id}`);
        return mocks[id];
      },
    },
    { filename },
  );
  return mod.exports;
}

const shell = { AuthSplitShell: ({ children, caption, note }) => React.createElement("div", { "data-caption": caption ?? "", "data-note": note ?? "" }, children) };
const pageMocks = {
  "next/navigation": { redirect: () => { throw new Error("unexpected redirect"); } },
  "@/lib/db": { getStore: () => ({ countUsers: async () => 1 }) },
  "@/lib/auth/session": { getSession: async () => null },
  "@/components/login-form": { LoginForm: ({ messages, lang }) => React.createElement("form", { "data-lang": lang }, messages.submit) },
  "@/components/auth-split-shell": shell,
};
for (const locale of ["en", "vi"]) {
  const Page = load("app/(auth)/login/page.tsx", pageMocks, locale).default;
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  assert.ok(html.includes(authMessages[locale].login.title), `${locale}: thiếu tiêu đề đúng ngôn ngữ`);
  assert.ok(html.includes(`data-lang="${locale}"`), `${locale}: form phải nhận đúng locale`);
  if (locale === "en") {
    assert.doesNotMatch(html, VIETNAMESE, "en: trang đăng nhập còn tiếng Việt");
  } else {
    assert.match(html, /Đăng nhập/, "vi: trang đăng nhập phải là tiếng Việt");
  }
}

/* 5. <html lang> và phạm vi đường dẫn đa ngôn ngữ. */
const layout = read("app/layout.tsx");
assert.match(layout, /LOCALE_COOKIE/, "layout đọc cookie ngôn ngữ");
const realI18nConfig = await import("../lib/i18n/config.ts");
const { isLocalizedAuthPath } = realI18nConfig;

/**
 * RootLayout không còn tính <html lang> bằng cách GỌI isLocalizedPath(pathname) lúc render
 * server (cookies()/headers() ở layout gốc buộc toàn bộ route con render động — xem comment
 * trong app/layout.tsx). Giờ layout luôn render tĩnh lang="en", rồi nhúng một <script> chạy
 * NGAY trên trình duyệt để tự sửa lại — script đó nhúng thẳng .source của
 * LOCALIZED_AUTH_PATH_RE/LOCALIZED_PORTAL_PATH_RE/LEGACY_VIETNAMESE_PATH_RE (bản gốc duy nhất
 * ở lib/i18n/config.ts, không chép tay bản thứ hai dễ lệch).
 *
 * Kiểm tra THẬT hành vi của script đó (không chỉ match chuỗi nguồn): thực thi nó trong một
 * "document" giả cho từng tổ hợp đường dẫn + cookie, xác nhận <html lang> ra đúng kết quả mà
 * isLocalizedAuthPath/isLocalizedPortalPath/LEGACY_VIETNAMESE_PATH_RE quyết định.
 */
const layoutMocksForBootScript = {
  "@fontsource/be-vietnam-pro/400.css": {}, "@fontsource/be-vietnam-pro/400-italic.css": {},
  "@fontsource/be-vietnam-pro/500.css": {}, "@fontsource/be-vietnam-pro/600.css": {},
  "@fontsource/be-vietnam-pro/700.css": {}, "@fontsource/be-vietnam-pro/800.css": {},
  "@fontsource/be-vietnam-pro/900.css": {}, "@fontsource-variable/jetbrains-mono": {},
  "./globals.css": {},
  "@/lib/public/meta-copy": { HOME_META_DESCRIPTION: "x" },
  "@/components/toast": { ToastProvider: ({ children }) => children },
  "@/components/cookie-consent": { CookieConsentProvider: ({ children }) => children },
  "@/components/public-speed-insights": { PublicSpeedInsights: () => null },
  "@/lib/site": { SITE_URL: "https://www.veximtrade.com" },
  "@/lib/i18n/config": realI18nConfig,
};
const RootLayout = load("app/layout.tsx", layoutMocksForBootScript).default;
const rootHtml = renderToStaticMarkup(React.createElement(RootLayout, { children: "Content" }));
const bootScriptSource = rootHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(bootScriptSource, "layout phải nhúng script tính <html lang> ngay trên trình duyệt");

function runBootScript(pathname, cookie) {
  const documentStub = { documentElement: { lang: "en" }, cookie: cookie ?? "" };
  const context = vm.createContext({ location: { pathname }, document: documentStub, RegExp, JSON, decodeURIComponent });
  vm.runInContext(bootScriptSource, context);
  return documentStub.documentElement.lang;
}
// Khu vực tài khoản (giai đoạn 1): theo cookie đã chọn, mặc định tiếng Anh nếu chưa chọn.
assert.equal(runBootScript("/login", "vexim_locale=vi"), "vi");
assert.equal(runBootScript("/login", ""), "en");
assert.equal(runBootScript("/register", "vexim_locale=vi"), "vi");
// Cổng NCC (giai đoạn 2): cũng theo cookie.
assert.equal(runBootScript("/supplier/portal", "vexim_locale=vi"), "vi");
assert.equal(runBootScript("/supplier/portal/products", "vexim_locale=vi"), "vi");
// Khu vực tiếng Việt "cũ" theo tiền tố đường dẫn — LUÔN tiếng Việt, không qua cookie.
assert.equal(runBootScript("/crm/dashboard", "vexim_locale=en"), "vi", "CRM luôn tiếng Việt bất kể cookie");
// Trang công khai: luôn tiếng Anh, không đọc cookie khu vực tài khoản.
assert.equal(runBootScript("/", "vexim_locale=vi"), "en", "Trang công khai không phụ thuộc cookie khu vực tài khoản");
assert.equal(runBootScript("/rfq", "vexim_locale=vi"), "en", "Chưa chuyển ngôn ngữ ở giai đoạn 1/2 và không khớp tiền tố tiếng Việt cũ");
// /supplier/products KHÔNG thuộc giai đoạn 2 (chỉ /supplier/portal/* đã chuyển), nhưng vẫn
// khớp tiền tố "cũ" /supplier -> luôn tiếng Việt, đúng LEGACY_VIETNAMESE_PATH_RE hiện có.
assert.equal(runBootScript("/supplier/products", "vexim_locale=en"), "vi", "Cổng NCC ngoài /portal vẫn là khu vực tiếng Việt cũ");
for (const route of ["/login", "/register", "/auth/forgot-password", "/auth/reset-password", "/supplier/register"]) {
  assert.equal(isLocalizedAuthPath(route), true, `${route} thuộc khu vực đa ngôn ngữ`);
}
for (const route of ["/supplier/portal", "/supplier/products", "/rfq", "/", "/crm/dashboard"]) {
  assert.equal(isLocalizedAuthPath(route), false, `${route} chưa chuyển ngôn ngữ ở giai đoạn 1`);
}

/* 6. Không đổi URL: không có tiền tố /en hay /vi trong route. */
for (const dir of ["app/(auth)", "app/(auth)/auth"]) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    assert.ok(!["en", "vi"].includes(entry.name), `${dir}/${entry.name}: không dùng tiền tố ngôn ngữ trong URL`);
  }
}

console.log("✅ Auth i18n: đủ khoá hai ngôn ngữ, không lẫn tiếng Việt trong bản tiếng Anh, <html lang> theo cookie, không đổi URL.");
