#!/usr/bin/env node
// node scripts/check-product-static.mjs
//
// The product detail page is served from the CDN as a prebuilt (ISR) page. This check locks:
//   1. The static page never reads cookies/session (that would force dynamic rendering again).
//      People with a session cookie are rewritten by the Edge middleware, with the URL unchanged,
//      to the dynamic /staff-product-view route: staff preview of unpublished categories, and no
//      counting of their own views. Typing /staff-product-view/... redirects to the public URL.
//   2. View counting on the cached page: the browser sends only slug + product id, and
//      /api/public/traffic re-checks everything server-side (the supplier comes from the public card).
//   3. Product images: the CDN keeps them for 1 hour (the owner accepted this revocation window).
//      The hero image loads with high priority at the frame width (srcset), and thumbnails use
//      64/128px versions.
import { mediaMocks } from './lib/media-mocks.mjs';
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

function load(file, { env = {}, mocks = {}, globals = {}, strict = true } = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, process: { env, cwd: () => "/nonexistent" }, console: { warn() {}, error() {}, log() {} },
    Buffer, Date, URL, Headers, Request, Response, TextEncoder, TextDecoder, Uint8Array, Array, String, JSON, Promise, Error,
    require: (key) => {
      if (key === "server-only") return {};
      if (strict) assert.ok(key in mocks || key in mediaMocks, `Unexpected import ${key} in ${file}`);
      return key in mocks ? mocks[key] : mediaMocks[key];
    },
    ...globals,
  }, { filename: file });
  return mod.exports;
}

const PID = "a42cff22-5c62-44e9-bcd7-bb72df961570";
const SUPPLIER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// ---- 1. Route helpers --------------------------------------------------------------------
const productRoute = load("lib/public/product-route.ts");
assert.equal(productRoute.staffProductViewPath(`/products/dried-fruits/${PID}`), `/staff-product-view/dried-fruits/${PID}`);
assert.equal(productRoute.staffProductViewPath(`/products/dried-fruits/${PID}/`), `/staff-product-view/dried-fruits/${PID}`);
for (const p of ["/products", "/products/dried-fruits", `/products/dried-fruits/${PID}/extra`, "/suppliers/abc/def"]) {
  assert.equal(productRoute.staffProductViewPath(p), null, `${p} is not a product detail page`);
}
assert.equal(productRoute.publicProductUrlFor(`/staff-product-view/dried-fruits/${PID}`), `/products/dried-fruits/${PID}`);
assert.equal(productRoute.publicProductUrlFor("/staff-product-view"), "/products");
assert.equal(productRoute.publicProductUrlFor("/staff-product-view/odd"), "/products");
assert.equal(productRoute.publicProductUrlFor("/staff-product-viewer"), null, "Only the exact internal prefix");
assert.equal(productRoute.publicProductUrlFor(`/products/dried-fruits/${PID}`), null);

const categoryRoute = load("lib/public/category-route.ts");
const homeRoute = load("lib/public/home-route.ts", { mocks: { "@/lib/public/product-route": productRoute, "@/lib/public/category-route": categoryRoute } });
assert.equal(homeRoute.toPublicPathname(`/staff-product-view/dried-fruits/${PID}`), `/products/dried-fruits/${PID}`,
  "Client components see the public product URL in the staff render too");
assert.equal(homeRoute.toPublicPathname("/homepage/en"), "/");

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
const productUrl = `/products/dried-fruits/${PID}`;
const staffToken = nodeSession.createSessionToken({ uid: "u-1", email: "staff@example.invalid", name: "Staff", role: "admin", via: "local" });

let res = await middleware(request(productUrl));
assert.equal(res.kind, "next", "Visitors get the prebuilt page (no rewrite, no cookie check)");
res = await middleware(request(productUrl, { cookie: staffToken }));
assert.deepEqual([res.kind, pathOf(res)], ["rewrite", `/staff-product-view/dried-fruits/${PID}`], "Signed-in staff/suppliers get the dynamic render");
res = await middleware(request(`${productUrl}?utm_source=zalo`, { cookie: staffToken }));
assert.equal(pathOf(res), `/staff-product-view/dried-fruits/${PID}?utm_source=zalo`, "The query string is kept");
res = await middleware(request(productUrl, { cookie: "forged.cookie" }));
assert.equal(res.kind, "next", "A bad cookie is just a visitor");
res = await middleware(request(productUrl, { method: "POST", cookie: staffToken }));
assert.equal(res.kind, "next", "Server Actions are never rewritten");
res = await middleware(request("/products/dried-fruits", { cookie: staffToken }));
assert.equal(res.kind, "next", "Only product detail pages are rewritten");
res = await middleware(request(`/staff-product-view/dried-fruits/${PID}`));
assert.deepEqual([res.kind, pathOf(res), res.status], ["redirect", productUrl, 308], "The internal route is not a second public URL");
res = await middleware(request("/staff-product-view", { cookie: staffToken }));
assert.deepEqual([res.kind, pathOf(res)], ["redirect", "/products"]);

// ---- 3. Page sources ---------------------------------------------------------------------
const page = read("app/(public)/products/[slug]/[productId]/page.tsx");
assert.doesNotMatch(page, /export const dynamic\b/, "The public product page is not force-dynamic");
assert.match(page, /export const revalidate = \d+;/, "The prebuilt page refreshes on a timer");
// Dựng sẵn lúc build 50 sản phẩm được xem nhiều nhất (chủ dự án duyệt 24/11/2026); trang khác dựng ở lượt xem đầu.
assert.match(page, /const PREBUILT_PRODUCT_PAGES = 50;/, "Only the 50 most-viewed products are prebuilt");
assert.match(page, /export async function generateStaticParams\(\)[\s\S]*?publicProductRouteParams\(await readTopViewedProductIds\(PREBUILT_PRODUCT_PAGES\)\)[\s\S]*?catch[\s\S]*?return \[\];/, "Prebuild reads the top viewed products and never fails the build");
assert.doesNotMatch(page, /export const dynamicParams = false/, "Other product pages are still built on first visit");
assert.doesNotMatch(page, /getLocale|from "next\/headers"|cookies\(\)|headers\(\)|createTrafficToken/,
  "The static page reads no cookie/header and embeds no expiring token");
const sessionReads = page.match(/getSession\(\)/g) ?? [];
assert.equal(sessionReads.length, 1, "Only one session read in the page");
assert.match(page, /isStaffProductView\(\) \? await getSession\(\)/, "The session read is gated by the staff render");
assert.match(page, /countView = !preview && !card\.isDemo && !isStaffProductView\(\)/, "Staff/supplier views are not counted");
assert.match(page, /<SupplierTrafficBeacon pageKey=\{`product:\$\{p\.id\}`\} product=\{\{ slug, productId: p\.id \}\} \/>/);

const staffPage = read("app/(public)/staff-product-view/[slug]/[productId]/page.tsx");
assert.match(staffPage, /export const dynamic = "force-dynamic"/, "The staff render stays dynamic");
assert.equal((staffPage.match(/enableStaffProductView\(\);/g) ?? []).length, 2, "Both metadata and page enable the staff render");
assert.match(staffPage, /from "\.\.\/\.\.\/\.\.\/products\/\[slug\]\/\[productId\]\/page"/, "The staff render reuses the public page");

// Per-request flag: React cache() gives one object per request.
let requestScope = new Map();
const fakeCache = (fn) => () => { if (!requestScope.has(fn)) requestScope.set(fn, fn()); return requestScope.get(fn); };
const staffView = load("lib/public/product-staff-view.ts", { mocks: { react: { cache: fakeCache } } });
assert.equal(staffView.isStaffProductView(), false, "Default render is the public one");
staffView.enableStaffProductView();
assert.equal(staffView.isStaffProductView(), true);
requestScope = new Map();
assert.equal(staffView.isStaffProductView(), false, "The flag does not leak into the next request");

// ---- 4. Traffic: product reference re-checked on the server ------------------------------
const recorded = [];
let session = null;
let category = { slug: "dried-fruits", status: "published", is_published: true };
let cards = [{ id: PID, supplierId: SUPPLIER, isDemo: false }];
let supplier = { id: SUPPLIER, status: "published" };
const route = load("app/api/public/traffic/route.ts", {
  mocks: {
    "next/server": { NextResponse: class extends Response {} },
    "@/lib/auth/session": { getSession: async () => session },
    "@/lib/public/supplier-seo": { isSyntheticSupplier: (s) => !!s.synthetic },
    "@/lib/public/product-catalog": { listPublicCategoryFamilyProducts: async () => cards },
    "@/lib/db": { getStore: () => ({ getCategoryBySlug: async (slug) => (slug === category.slug ? category : null), getSupplier: async () => supplier }) },
    "@/lib/traffic/server": {
      recordPageView: async (pageView) => { recorded.push(pageView); },
      recordCountryView: async () => {},
      verifyTrafficToken: (token) => (token === "valid-profile" ? { kind: "profile", supplierId: SUPPLIER, resourceId: SUPPLIER, slug: "acme", exp: Date.now() + 1000 } : null),
    },
  },
});
const post = (body) => route.POST(new Request("https://www.veximtrade.com/api/public/traffic", {
  method: "POST", body: JSON.stringify(body),
  headers: { origin: "https://www.veximtrade.com", host: "www.veximtrade.com", "content-type": "application/json", "user-agent": "Mozilla/5.0" },
}));
res = await post({ product: { slug: "dried-fruits", productId: PID } });
assert.equal(res.status, 204);
assert.equal(recorded.length, 1, "A real buyer view of a listed product is counted");
assert.deepEqual({ ...recorded[0], exp: 0 }, { kind: "product", supplierId: SUPPLIER, resourceId: PID, slug: "dried-fruits", exp: 0 },
  "The supplier comes from the public card, never from the browser");
for (const bad of [{ slug: "dried-fruits" }, { slug: "../x", productId: PID }, { slug: "dried-fruits", productId: "not-a-uuid" }, "x", null]) {
  assert.equal((await post({ product: bad })).status, 400, `Malformed product reference ${JSON.stringify(bad)} is rejected`);
}
assert.equal((await post({ token: "expired" })).status, 400, "Invalid tokens are still rejected");
const before = recorded.length;
await post({ product: { slug: "other-category", productId: PID } });
cards = [{ id: PID, supplierId: SUPPLIER, isDemo: true }];
await post({ product: { slug: "dried-fruits", productId: PID } });
cards = [{ id: PID, supplierId: SUPPLIER, isDemo: false }];
supplier = { ...supplier, synthetic: true };
await post({ product: { slug: "dried-fruits", productId: PID } });
supplier = { id: SUPPLIER, status: "published" };
category = { ...category, is_published: false };
await post({ product: { slug: "dried-fruits", productId: PID } });
category = { ...category, is_published: true };
session = { uid: "staff" };
await post({ product: { slug: "dried-fruits", productId: PID } });
session = null;
cards = [];
await post({ product: { slug: "dried-fruits", productId: PID } });
assert.equal(recorded.length, before, "Wrong category, demo, synthetic supplier, unpublished category, staff session or unlisted product: not counted");
cards = [{ id: PID, supplierId: SUPPLIER, isDemo: false }];
supplier = { id: SUPPLIER, slug: "acme", status: "published" };
await post({ token: "valid-profile" });
assert.equal(recorded.at(-1)?.kind, "profile", "Signed profile tokens keep working");

const beacon = read("components/supplier-traffic-beacon.tsx");
assert.match(beacon, /\{ product: \{ slug: productSlug, productId \} \}/, "The beacon sends the product reference");

// ---- 5. Images ---------------------------------------------------------------------------
const media = read("app/public-media/[...path]/route.ts");
const ttl = Number(media.match(/const PRODUCT_IMAGE_CACHE_SECONDS = (\d+);/)?.[1]);
assert.equal(ttl, 3600, "Product images: CDN + browser keep them 1 hour");
assert.match(read("next.config.ts"), new RegExp(`minimumCacheTTL: ${ttl},`), "Resized copies do not outlive the original's cache window");

const exportsMedia = load("app/public-media/[...path]/route.ts", {
  strict: false,
  mocks: {
    "next/server": { NextResponse: class extends Response {} },
    "node:crypto": crypto,
    "@/lib/media/storage": { getObject: async () => ({ data: new Uint8Array([1, 2, 3]) }) },
    "@/lib/db": { getStore: () => ({
      getMediaByPath: async (rel) => (rel.startsWith("suppliers/")
        ? { owner_type: "supplier", supplier_id: "sup-1", kind: "image", audience: "buyer", status: "checked", storage_path: rel }
        : { owner_type: "product", product_id: "prod-1", kind: "image", audience: "buyer", status: "checked", storage_path: rel }),
      getProduct: async () => ({ supplier_id: "sup-1", ready_for_buyer: true, name: "Cashew" }),
      getSupplier: async () => ({ status: "published", is_demo: false }),
    }) },
    "@/lib/media/readiness": { isExpired: () => false },
    "@/lib/public/product-selection": { isTestOnlyProduct: () => false, productReviewApproved: () => true },
    "@/lib/products/aplus": { COMPANY_APLUS_ID: "company", aplusMainPath: (p) => p },
  },
});
const getMedia = (p) => exportsMedia.GET(new Request("https://test.local"), { params: Promise.resolve({ path: p.split("/") }) });
res = await getMedia("products/prod-1/photo.webp");
assert.equal(res.headers.get("cache-control"), "public, max-age=3600, s-maxage=3600", "Product photos are CDN-cached for 1 hour");
res = await getMedia("suppliers/sup-1/0123456789abcdef0123456789abcdef.jpg");
assert.equal(res.headers.get("cache-control"), "private, max-age=60, must-revalidate", "Supplier vault images (may hold certificate scans) stay private");
res = await getMedia("categories/hero.webp");
assert.equal(res.headers.get("cache-control"), "public, max-age=604800, immutable");

const gallery = read("components/product-media-gallery.tsx");
assert.match(gallery, /<img \{\.\.\.productHeroImage\(shown\)\}/, "The hero uses srcset/sizes");
assert.match(gallery, /loading="eager" fetchPriority=\{shown === images\[0\] \? "high" : undefined\}/, "The first photo (LCP) loads with high priority");
assert.match(gallery, /\{\.\.\.productThumbImage\(thumbnails\?\.\[photoIndex\] \?\? path\)\} alt="" loading="lazy" width=\{64\} height=\{64\}/,
  "Thumbnails use 64/128px versions");
assert.match(gallery, /<img src=\{publicPhotoUrl\(selected\)\}/, "The enlarged lightbox still shows the original");

console.log("Product static: guests get the prebuilt page, signed-in users the dynamic render, views re-checked server-side, product images CDN-cached 1h and sized to the frame");
