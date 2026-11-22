#!/usr/bin/env node
// node scripts/check-home-static.mjs
//
// Trang chủ phục vụ từ CDN (bản dựng sẵn) + middleware chạy trên Edge. Bộ kiểm này khoá:
//   1. Web Crypto (lib/auth/session-token-edge.ts) xác minh cookie phiên y hệt bản node:crypto
//      (lib/auth/session-token.ts + lib/auth/secret.ts), cả khi khoá đến từ AUTH_SECRET lẫn khi
//      suy từ khoá Supabase — lệch nhau thì nhân viên mất chuyển hướng "/" → CRM.
//   2. Middleware viết lại "/" và "/?lang=vi" sang /homepage/en|vi, giữ bản động cho ?q=/?cat=,
//      chặn URL nội bộ, và vẫn chuyển hướng nhân viên / host nội bộ như trước.
//   3. Không còn revalidatePath("/") đơn lẻ (sẽ bỏ sót bản dựng sẵn).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import ts from "typescript";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

function load(file, { env = {}, mocks = {}, globals = {} } = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, process: { env, cwd: () => "/nonexistent" }, console: { warn() {}, error() {}, log() {} },
    Buffer, Date, URL, Headers, TextEncoder, TextDecoder, Uint8Array, Array, String, JSON, Promise, Error,
    require: (key) => {
      if (key === "server-only") return {};
      assert.ok(key in mocks, `Unexpected import ${key} in ${file}`);
      return mocks[key];
    },
    ...globals,
  }, { filename: file });
  return mod.exports;
}

// Giống Vercel: không có data/auth-secret và không ghi được ổ đĩa.
const readOnlyFs = {
  existsSync: () => false,
  readFileSync: () => { throw new Error("no file"); },
  mkdirSync: () => { throw new Error("read-only"); },
  writeFileSync: () => { throw new Error("read-only"); },
};

function nodeSession(env) {
  const secret = load("lib/auth/secret.ts", { env, mocks: { "node:crypto": crypto, "node:fs": readOnlyFs, "node:path": path } });
  return load("lib/auth/session-token.ts", { env, mocks: { "node:crypto": crypto, "@/lib/auth/secret": secret } });
}

function edgeSession(env) {
  return load("lib/auth/session-token-edge.ts", { env, globals: { crypto: crypto.webcrypto, atob, btoa } });
}

const user = { uid: "u-1", email: "staff@example.invalid", name: "Nhân viên Thử", role: "admin", via: "local" };

for (const env of [
  { AUTH_SECRET: "a-very-long-auth-secret-for-tests-0123456789" },
  { SUPABASE_SERVICE_ROLE_KEY: "service-role-key-material-for-hkdf-0123456789" },
  { SUPABASE_JWT_SECRET: "jwt-secret-material-for-hkdf-0123456789" },
]) {
  const label = Object.keys(env)[0];
  const node = nodeSession(env);
  const edge = edgeSession(env);
  const token = node.createSessionToken(user);
  assert.ok(node.verifySessionToken(token), `${label}: node accepts its own token`);
  const claims = await edge.verifySessionTokenEdge(token);
  assert.equal(claims?.uid, "u-1", `${label}: edge accepts the same token as node`);
  assert.equal(claims?.role, "admin");

  const [body, mac] = token.split(".");
  const flipped = mac.slice(0, -1) + (mac.at(-1) === "A" ? "B" : "A");
  assert.equal(await edge.verifySessionTokenEdge(`${body}.${flipped}`), null, `${label}: forged MAC is rejected`);
  const otherBody = Buffer.from(JSON.stringify({ ...user, role: "superadmin", exp: Date.now() + 1e6 })).toString("base64url");
  assert.equal(await edge.verifySessionTokenEdge(`${otherBody}.${mac}`), null, `${label}: edited payload is rejected`);
  const expired = node.signPayload({ ...user, exp: Date.now() - 1000 });
  assert.equal(node.verifySessionToken(expired), null);
  assert.equal(await edge.verifySessionTokenEdge(expired), null, `${label}: expired token is rejected`);
  for (const junk of [undefined, null, "", "abc", "a.b", "....", "%%%.%%%"]) {
    assert.equal(await edge.verifySessionTokenEdge(junk), null, `${label}: junk ${String(junk)} is rejected`);
  }
  const foreign = nodeSession({ AUTH_SECRET: "some-other-deployment-secret-xyz-987" }).createSessionToken(user);
  assert.equal(await edge.verifySessionTokenEdge(foreign), null, `${label}: token from another key is rejected`);
}
// Không có khoá nào dùng được (kể cả chỉ có anon key công khai) → không bao giờ tin cookie.
assert.equal(
  await edgeSession({ SUPABASE_ANON_KEY: "public-anon-key-0123456789" }).verifySessionTokenEdge("x.y"), null,
  "Without a server secret the edge verifier never trusts a cookie",
);

// ---- Middleware --------------------------------------------------------------------------
const middlewareSource = read("middleware.ts");
const nodeTokenSource = read("lib/auth/session-token.ts");
const cookieName = /SESSION_COOKIE = "([^"]+)"/;
assert.equal(middlewareSource.match(cookieName)?.[1], nodeTokenSource.match(cookieName)?.[1], "Middleware reads the real session cookie name");
assert.doesNotMatch(middlewareSource, /export const runtime\s*=\s*["']nodejs["']/, "Middleware stays on the Edge runtime (close to visitors)");
assert.doesNotMatch(middlewareSource, /from "@\/lib\/auth\/session-token"/, "Middleware does not pull node:crypto into the Edge bundle");

const AUTH_ENV = { AUTH_SECRET: "a-very-long-auth-secret-for-tests-0123456789", PUBLIC_SITE_INDEXABLE: "true", VERCEL_ENV: "production" };
const productRoute = load("lib/public/product-route.ts");
const homeRoute = load("lib/public/home-route.ts", { mocks: { "@/lib/public/product-route": productRoute } });
const NextResponse = {
  next: () => ({ kind: "next", headers: new Headers() }),
  rewrite: (url) => ({ kind: "rewrite", url: String(url), headers: new Headers() }),
  redirect: (url, status = 307) => ({ kind: "redirect", url: String(url), status, headers: new Headers() }),
};
const { middleware } = load("middleware.ts", {
  env: AUTH_ENV,
  mocks: {
    "next/server": { NextResponse },
    "@/lib/auth/session-token-edge": edgeSession(AUTH_ENV),
    "@/lib/public/home-route": homeRoute,
    "@/lib/public/product-route": productRoute,
  },
});
function request(url, { method = "GET", host = "www.veximtrade.com", cookie } = {}) {
  const nextUrl = new URL(url, `https://${host}`);
  nextUrl.clone = () => new URL(nextUrl);
  return {
    method, url: nextUrl.toString(), nextUrl, headers: new Headers({ host }),
    cookies: { get: (name) => (name === "vxt_session" && cookie ? { value: cookie } : undefined) },
  };
}
const pathOf = (res) => { const u = new URL(res.url); return u.pathname + u.search; };

let res = await middleware(request("/"));
assert.equal(res.kind, "rewrite"); assert.equal(pathOf(res), "/homepage/en", "Visitors get the prebuilt English home");
res = await middleware(request("/?lang=vi"));
assert.equal(res.kind, "rewrite"); assert.equal(pathOf(res), "/homepage/vi?lang=vi", "?lang=vi gets the prebuilt Vietnamese home");
res = await middleware(request("/?utm_source=zalo&fbclid=1"));
assert.equal(new URL(res.url).pathname, "/homepage/en", "Campaign parameters still hit the cache");
res = await middleware(request("/?lang=fr"));
assert.equal(new URL(res.url).pathname, "/homepage/en", "Unknown languages fall back to English like before");
for (const url of ["/?q=cashew", "/?cat=coffee", "/?lang=vi&q=pepper"]) {
  assert.equal((await middleware(request(url))).kind, "next", `${url} keeps the dynamic filtered home`);
}
res = await middleware(request("/?q=%20%20"));
assert.equal(res.kind, "rewrite", "A blank search is the plain home");
assert.equal((await middleware(request("/", { method: "POST" }))).kind, "next", "Server Actions are never rewritten");

res = await middleware(request("/homepage/en"));
assert.deepEqual([res.kind, pathOf(res), res.status], ["redirect", "/", 308], "The internal route is not a second public URL");
res = await middleware(request("/homepage/vi/"));
assert.deepEqual([res.kind, pathOf(res)], ["redirect", "/?lang=vi"]);
assert.equal((await middleware(request("/homepage-guide"))).kind, "next", "Only the exact internal prefix is redirected");

const staffToken = nodeSession(AUTH_ENV).createSessionToken(user);
res = await middleware(request("/", { cookie: staffToken }));
assert.deepEqual([res.kind, pathOf(res)], ["redirect", "/crm/dashboard"], "Signed-in staff still go straight to the CRM");
res = await middleware(request("/", { cookie: "forged.cookie" }));
assert.equal(res.kind, "rewrite", "A bad cookie is just a visitor");
res = await middleware(request("/", { host: "crm.veximtrade.com" }));
assert.deepEqual([res.kind, pathOf(res)], ["redirect", "/login"], "Internal hosts still go to the login page");
res = await middleware(request("/", { host: "vexim-trade.vercel.app", cookie: staffToken }));
assert.deepEqual([res.kind, pathOf(res)], ["redirect", "/crm/dashboard"], "Staff on an internal host still reach the CRM");
assert.equal((await middleware(request("/crm/dashboard"))).headers.get("X-Robots-Tag"), "noindex, nofollow");

// Ẩn đường dẫn nội bộ khỏi component đọc pathname (khớp HTML dựng sẵn với trình duyệt).
assert.equal(homeRoute.toPublicPathname("/homepage/en"), "/");
assert.equal(homeRoute.toPublicPathname("/homepage/vi"), "/");
assert.equal(homeRoute.toPublicPathname("/products/cashew"), "/products/cashew");
assert.equal(homeRoute.toPublicPathname("/homepage-guide"), "/homepage-guide");

// ---- Static route + revalidation --------------------------------------------------------
const staticPage = read("app/(public)/homepage/[lang]/page.tsx");
assert.match(staticPage, /export const revalidate = \d+/, "The prebuilt home refreshes on a timer");
assert.match(staticPage, /export const dynamicParams = false/, "Only en/vi are prebuilt");
assert.doesNotMatch(staticPage, /searchParams\s*}/, "The prebuilt home never reads the real query string");

const loneRevalidate = execFileSync("grep", ["-rln", "--include=*.ts", "--include=*.tsx", 'revalidatePath("/")', "app", "lib", "components"], {
  cwd: new URL("..", import.meta.url), encoding: "utf8",
}).split("\n").filter((file) => file && file !== "lib/public/revalidate-home.ts");
assert.deepEqual(loneRevalidate, [], 'Use revalidateHomePage() instead of revalidatePath("/") so the prebuilt home refreshes too');

for (const file of ["app/(public)/simple-footer.tsx", "components/public-header-controls.tsx", "components/platform-legal-strip.tsx"]) {
  assert.doesNotMatch(read(file), /\busePathname\(\)/, `${file} uses usePublicPathname() so prebuilt HTML matches the browser`);
}

console.log("Home static: edge cookie check matches node, rewrites serve the prebuilt home, filters stay dynamic");
