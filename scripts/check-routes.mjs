#!/usr/bin/env node
/**
 * Smoke-test runtime permission matrix:
 *  - Anonymous: public routes 200, CRM routes 307→/login, /login 200.
 *  - (Các role có đăng nhập cần trình duyệt / cookie thủ công — phần này chỉ kiểm
 *    tra anonymous + gating server-side tĩnh đã được bao phủ bởi check-permissions.mjs.)
 *
 * Chạy sau khi `npm run dev` đã chạy ở :3000.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";

const publicRoutes = [
  "/", "/how-it-works", "/how-we-verify", "/for-suppliers", "/rfq", "/products/cashew",
  "/blog", "/suppliers/demo-cashew-mill-demo-2",
];
const anonForbidden = [
  "/crm", "/crm/dashboard", "/crm/rfqs", "/crm/suppliers",
  "/crm/buyers", "/crm/mail", "/crm/settings",
  "/crm/verifications", "/crm/categories",
];

const authRoute = "/login";

async function check(method, path, { expect, redirectTo } = {}) {
  const res = await fetch(BASE + path, { method, redirect: "manual" });
  const ok = expect ? res.status === expect : (res.status >= 200 && res.status < 400);
  const loc = res.headers.get("location") ?? "";
  const rdOk = redirectTo ? loc.includes(redirectTo) : true;
  const pass = ok && rdOk;
  const mark = pass ? "✅" : "❌";
  const extra = redirectTo ? ` → ${loc}` : "";
  console.log(`${mark} ${method.padEnd(4)} ${path}  ${res.status}${extra}`);
  return pass;
}

let failed = 0;
console.log("\n—— Public (anonymous) ——\n");
for (const p of publicRoutes) {
  if (!(await check("GET", p, { expect: 200 }))) failed++;
}

console.log("\n—— CRM anonymous must redirect to /login ——\n");
for (const p of anonForbidden) {
  if (!(await check("GET", p, { expect: 307, redirectTo: "/login" }))) failed++;
}

console.log("\n—— /login accessible ——\n");
if (!(await check("GET", authRoute, { expect: 200 }))) failed++;

console.log(failed ? `\n❌ ${failed} lỗi.` : "\n✅ Tất cả route anonymous/public đúng trạng thái.");
process.exit(failed ? 1 : 0);
