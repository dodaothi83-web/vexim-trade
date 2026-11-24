#!/usr/bin/env node
// node scripts/check-category-static.mjs
//
// Trang danh mục /products/<slug> phục vụ từ CDN (bản dựng sẵn, ISR). Bộ kiểm này khoá:
//   1. Middleware viết lại lượt xem "trần" của khách (kể cả ?lang=vi, utm_*) sang
//      /products/category-render/<lang>/<slug>, giữ bản động cho ?cert=, ?page= > 1, người có
//      phiên hợp lệ và Server Action; route nội bộ không thành URL công khai thứ hai.
//   2. Bản dựng sẵn không đọc cookie/phiên; bản động vẫn đọc phiên (xem trước danh mục nháp).
//   3. Không còn revalidatePath("/products/<slug>") đơn lẻ (sẽ bỏ sót bản dựng sẵn).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
    Buffer, Date, URL, URLSearchParams, Headers, TextEncoder, TextDecoder, Uint8Array, Array, String, JSON, Promise, Error,
    require: (key) => {
      if (key === "server-only") return {};
      assert.ok(key in mocks, `Unexpected import ${key} in ${file}`);
      return mocks[key];
    },
    ...globals,
  }, { filename: file });
  return mod.exports;
}

// ---- 1. Route helpers --------------------------------------------------------------------
const categoryRoute = load("lib/public/category-route.ts");
const target = (url) => {
  const u = new URL(url, "https://www.veximtrade.com");
  return categoryRoute.categoryRenderTarget(u.pathname, u.searchParams);
};
assert.equal(target("/products/cashew-kernels"), "/products/category-render/en/cashew-kernels");
assert.equal(target("/products/cashew-kernels/"), "/products/category-render/en/cashew-kernels");
assert.equal(target("/products/cashew-kernels?lang=vi"), "/products/category-render/vi/cashew-kernels");
assert.equal(target("/products/cashew-kernels?lang=fr"), "/products/category-render/en/cashew-kernels", "Unknown languages are English, like the dynamic page");
assert.equal(target("/products/cashew-kernels?utm_source=zalo&gclid=1"), "/products/category-render/en/cashew-kernels", "Campaign parameters still hit the cache");
assert.equal(target("/products/cashew-kernels?page=1"), "/products/category-render/en/cashew-kernels");
for (const url of ["/products/cashew-kernels?cert=haccp", "/products/cashew-kernels?cert=", "/products/cashew-kernels?page=2",
  "/products/cashew-kernels?lang=vi&page=3", "/products/cashew-kernels?page=abc", "/products", "/products/",
  "/products/cashew-kernels/a42cff22-5c62-44e9-bcd7-bb72df961570", "/products/category-render", "/suppliers/acme"]) {
  assert.equal(target(url), null, `${url} keeps the dynamic render (or is not a category page)`);
}
assert.equal(categoryRoute.publicCategoryUrlFor("/products/category-render/en/cashew-kernels"), "/products/cashew-kernels");
assert.equal(categoryRoute.publicCategoryUrlFor("/products/category-render/vi/cashew-kernels"), "/products/cashew-kernels?lang=vi");
assert.equal(categoryRoute.publicCategoryUrlFor("/products/category-render/xx/odd"), "/");
assert.equal(categoryRoute.publicCategoryUrlFor("/products/category-render"), "/");
assert.equal(categoryRoute.publicCategoryUrlFor("/products/category-renderer"), null, "Only the exact internal prefix");
assert.equal(categoryRoute.publicCategoryUrlFor("/products/cashew-kernels"), null);
assert.equal(categoryRoute.publicCategoryPathFor("/products/category-render/vi/cashew-kernels"), "/products/cashew-kernels");

const productRoute = load("lib/public/product-route.ts");
const homeRoute = load("lib/public/home-route.ts", { mocks: { "@/lib/public/product-route": productRoute, "@/lib/public/category-route": categoryRoute } });
assert.equal(homeRoute.toPublicPathname("/products/category-render/vi/cashew-kernels"), "/products/cashew-kernels",
  "Client components see the public category URL in the prebuilt render (no hydration mismatch)");
assert.equal(productRoute.staffProductViewPath("/products/category-render/en/cashew-kernels"), null,
  "The internal category route is never mistaken for a product page");

// ---- 2. Middleware -----------------------------------------------------------------------
const AUTH_ENV = { AUTH_SECRET: "a-very-long-auth-secret-for-tests-0123456789", PUBLIC_SITE_INDEXABLE: "true", VERCEL_ENV: "production" };
const secret = load("lib/auth/secret.ts", { env: AUTH_ENV, mocks: { "node:crypto": crypto, "node:fs": { existsSync: () => false }, "node:path": path } });
const nodeSession = load("lib/auth/session-token.ts", { env: AUTH_ENV, mocks: { "node:crypto": crypto, "@/lib/auth/secret": secret } });
const edgeSession = load("lib/auth/session-token-edge.ts", { env: AUTH_ENV, globals: { crypto: crypto.webcrypto, atob, btoa } });
const NextResponse = {
  next: () => ({ kind: "next", headers: new Headers() }),
  rewrite: (url) => ({ kind: "rewrite", url: String(url), headers: new Headers() }),
  redirect: (url, status = 307) => ({ kind: "redirect", url: String(url), status, headers: new Headers() }),
};
const { middleware } = load("middleware.ts", {
  env: AUTH_ENV,
  mocks: {
    "next/server": { NextResponse },
    "@/lib/auth/session-token-edge": edgeSession,
    "@/lib/public/home-route": homeRoute,
    "@/lib/public/product-route": productRoute,
    "@/lib/public/category-route": categoryRoute,
  },
});
function request(url, { method = "GET", cookie } = {}) {
  const nextUrl = new URL(url, "https://www.veximtrade.com");
  nextUrl.clone = () => new URL(nextUrl);
  return {
    method, url: nextUrl.toString(), nextUrl, headers: new Headers({ host: "www.veximtrade.com" }),
    cookies: { get: (name) => (name === "vxt_session" && cookie ? { value: cookie } : undefined) },
  };
}
const pathOf = (res) => { const u = new URL(res.url); return u.pathname + u.search; };
const staffToken = nodeSession.createSessionToken({ uid: "u-1", email: "staff@example.invalid", name: "Staff", role: "admin", via: "local" });

let res = await middleware(request("/products/cashew-kernels"));
assert.deepEqual([res.kind, pathOf(res)], ["rewrite", "/products/category-render/en/cashew-kernels"], "Visitors get the prebuilt page");
assert.equal(res.headers.get("X-Robots-Tag"), null, "Indexing follows the public URL, not the internal one");
res = await middleware(request("/products/cashew-kernels?lang=vi&utm_source=zalo"));
assert.deepEqual([res.kind, pathOf(res)], ["rewrite", "/products/category-render/vi/cashew-kernels"],
  "Language goes into the path and the query is dropped so every visit shares one cache entry");
for (const url of ["/products/cashew-kernels?cert=haccp", "/products/cashew-kernels?page=2"]) {
  assert.equal((await middleware(request(url))).kind, "next", `${url} keeps the dynamic page`);
}
res = await middleware(request("/products/cashew-kernels", { cookie: staffToken }));
assert.equal(res.kind, "next", "Signed-in staff keep the dynamic page (draft preview)");
res = await middleware(request("/products/cashew-kernels", { cookie: "forged.cookie" }));
assert.equal(res.kind, "rewrite", "A bad cookie is just a visitor");
res = await middleware(request("/products/cashew-kernels", { method: "POST" }));
assert.equal(res.kind, "next", "Server Actions are never rewritten");
res = await middleware(request("/products/category-render/vi/cashew-kernels"));
assert.deepEqual([res.kind, pathOf(res), res.status], ["redirect", "/products/cashew-kernels?lang=vi", 308], "The internal route is not a second public URL");
res = await middleware(request("/products/category-render/en/cashew-kernels", { cookie: staffToken }));
assert.deepEqual([res.kind, pathOf(res)], ["redirect", "/products/cashew-kernels"]);
res = await middleware(request("/products/dried-fruits/a42cff22-5c62-44e9-bcd7-bb72df961570"));
assert.equal(res.kind, "next", "Product detail pages are unchanged (already ISR)");

// ---- 3. Page sources ---------------------------------------------------------------------
const page = read("app/(public)/products/[slug]/page.tsx");
assert.match(page, /export const dynamic = "force-dynamic";/, "The filtered/staff render stays dynamic");
assert.equal((page.match(/getSession\(\)/g) ?? []).length, 1, "Only one session read in the category page");
assert.match(page, /const session = isPrebuiltCategoryRender\(\) \? null : await getSession\(\);/, "The prebuilt render never reads the session");
assert.doesNotMatch(page, /from "next\/headers"|cookies\(\)|headers\(\)/, "The shared page reads no cookie/header directly");

const prebuilt = read("app/(public)/products/category-render/[lang]/[slug]/page.tsx");
assert.doesNotMatch(prebuilt, /export const dynamic\b/, "The prebuilt render is not force-dynamic");
assert.match(prebuilt, /export const revalidate = 3600;/, "The prebuilt page refreshes every hour (and on edit)");
assert.match(prebuilt, /export function generateStaticParams\(\)[^\n]*\{\n\s*return \[\];/, "Pages are built on first visit");
assert.equal((prebuilt.match(/enablePrebuiltCategoryRender\(\);/g) ?? []).length, 2, "Both metadata and page enable the prebuilt render");
assert.match(prebuilt, /from "\.\.\/\.\.\/\.\.\/\[slug\]\/page"/, "The prebuilt render reuses the category page");
assert.match(prebuilt, /lang === "vi" \? \{ lang: "vi" \} : \{\}/, "Language comes from the path, exactly like ?lang=vi");

// Per-request flag: React cache() gives one object per request.
let requestScope = new Map();
const fakeCache = (fn) => () => { if (!requestScope.has(fn)) requestScope.set(fn, fn()); return requestScope.get(fn); };
const mode = load("lib/public/category-render-mode.ts", { mocks: { react: { cache: fakeCache } } });
assert.equal(mode.isPrebuiltCategoryRender(), false, "Default render is the dynamic one");
mode.enablePrebuiltCategoryRender();
assert.equal(mode.isPrebuiltCategoryRender(), true);
requestScope = new Map();
assert.equal(mode.isPrebuiltCategoryRender(), false, "The flag does not leak into the next request");

// ---- 4. Revalidation ---------------------------------------------------------------------
const revalidated = [];
const revalidate = load("lib/public/revalidate-category.ts", {
  mocks: { "next/cache": { revalidatePath: (p, type) => revalidated.push(type ? `${p}|${type}` : p) }, "@/lib/public/category-route": categoryRoute, "@/lib/public/revalidate-public": { revalidatePublicCatalog: () => revalidated.push("tag:public-catalog") } },
});
revalidate.revalidateCategoryPage("cashew-kernels");
assert.deepEqual(revalidated, ["tag:public-catalog", "/products/cashew-kernels", "/products/category-render/en/cashew-kernels", "/products/category-render/vi/cashew-kernels"]);
const root = new URL("../", import.meta.url);
const sources = ["app", "lib"].flatMap((dir) => fs.readdirSync(new URL(dir, root), { recursive: true })
  .filter((file) => /\.tsx?$/.test(file)).map((file) => `${dir}/${file}`));
const lone = sources.filter((file) => file !== "lib/public/revalidate-category.ts"
  && /revalidatePath\(`\/products\/\$\{[^}]+\}`\)/.test(read(file)));
assert.deepEqual(lone, [], "Category pages are refreshed through revalidateCategoryPage() (covers the prebuilt copies)");

console.log("✅ Category static: visitors get the prebuilt page (EN/VI), filters/pages/staff stay dynamic, no session read, internal URL hidden, revalidation covers both copies.");
