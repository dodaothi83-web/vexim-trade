// Huy hiệu menu Giấy tờ & chứng nhận: render thật Sidebar bằng SSR để chắc con số hiện đúng.
// Run: node --experimental-strip-types scripts/check-certificate-crm-badge.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import * as permissions from "../lib/auth/permissions.ts";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const source = ts.transpileModule(readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} };
const mocks = {
  "react/jsx-runtime": jsx,
  react: React,
  "next/link": { default: ({ href, children, ...rest }) => React.createElement("a", { href, ...rest }, children) },
  "next/navigation": { usePathname: () => "/crm/dashboard" },
  "lucide-react": icons,
  "@/app/auth-actions": { logoutAction: async () => {} },
  "@/lib/auth/permissions": permissions,
  "@/components/ui": { cx: (...parts) => parts.filter(Boolean).join(" ") },
  "@/components/brand-logo": { Logo: () => null },
};
vm.runInNewContext(source, {
  module,
  exports: module.exports,
  require: (id) => {
    assert.ok(id in mocks, `Unexpected import ${id}`);
    return mocks[id];
  },
});
const Sidebar = module.exports.Sidebar;

/** Chỉ lấy đúng thẻ <a> của menu chứng nhận, để không bắt nhầm huy hiệu menu khác. */
function render(count, role = "reviewer") {
  const html = renderToStaticMarkup(React.createElement(Sidebar, {
    dataMode: "supabase",
    emailMode: "resend",
    session: { name: "Reviewer", email: "reviewer@example.com", role },
    permissions: permissions.permissionsFor(role),
    pendingCertificates: count,
  }));
  return html.match(/<a href="\/crm\/certificates"[\s\S]*?<\/a>/)?.[0] ?? "";
}

// Người không có quyền xác minh thì không thấy mục này, nên cũng không thấy huy hiệu.
assert.equal(render(3, "sale"), "", "menu chứng nhận chỉ hiện với người có quyền xem xác minh");
assert.match(render(3), /aria-label="Giấy chứng nhận chờ duyệt"[^>]*>3 chờ<\/span>/, "có giấy chờ thì hiện số");
assert.match(render(1), />1 chờ</, "đếm đúng từng giấy");
assert.doesNotMatch(render(0), /chờ<\/span>|aria-label="Giấy chứng nhận chờ duyệt"/, "không có giấy chờ thì không hiện huy hiệu");

console.log("✅ Huy hiệu CRM: menu Giấy tờ & chứng nhận hiện đúng số giấy chờ duyệt, 0 thì ẩn, sai quyền thì không có mục.");
