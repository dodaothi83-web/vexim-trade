#!/usr/bin/env node
// node scripts/check-supplier-static.mjs
//
// The public supplier profile /suppliers/<slug> is served from the CDN as a prebuilt (ISR) page.
// It used to be force-dynamic only because it read two session cookies. This check locks:
//   1. The page reads no cookie/session/header and embeds no expiring token.
//   2. View counting on the cached page: the browser sends supplier id + public slug, and
//      /api/public/traffic re-checks the profile server-side (published, same slug, not a test
//      profile, no staff/supplier session) — the same checks as the old signed profile token.
//   3. The factory report button learns the buyer sign-in state in the browser.
//   4. Copy fixes: the profile name keeps the H1 casing in the title; regions are "markets".
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

function load(file, mocks) {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, process: { env: {} }, console: { warn() {}, error() {}, log() {} },
    Date, URL, Headers, Request, Response, JSON, Promise, Error, Number, String, Array, Object, RegExp,
    require: (key) => {
      if (key === "server-only") return {};
      assert.ok(key in mocks, `Unexpected import ${key} in ${file}`);
      return mocks[key];
    },
  }, { filename: file });
  return mod.exports;
}

// ---- 1. Page source ----------------------------------------------------------------------
const page = read("app/(public)/suppliers/[slug]/page.tsx");
assert.doesNotMatch(page, /export const dynamic\b/, "The supplier profile is not force-dynamic");
assert.match(page, /export const revalidate = \d+;/, "The prebuilt profile refreshes on a timer");
assert.match(page, /export async function generateStaticParams\(\)[^\n]*\{\n\s*return \[\];/, "Profiles are built on first visit");
assert.doesNotMatch(page, /getSession|getBuyerSession|from "next\/headers"|cookies\(\)|headers\(\)|createTrafficToken/,
  "The static profile reads no cookie/session/header and embeds no expiring token");
assert.match(page, /const countView = !synthetic;/, "Test profiles are never counted");
assert.match(page, /<SupplierTrafficBeacon pageKey=\{`profile:\$\{s\.id\}`\} profile=\{\{ supplierId: s\.id, slug: s\.slug \|\| s\.id \}\} \/>/,
  "The beacon sends the canonical slug (or id), not the URL segment");
assert.match(page, /<DownloadFactoryReport code=\{code\} nextPath=/, "The report button decides sign-in state in the browser");
assert.doesNotMatch(page, /signedIn=\{/, "No server-side sign-in flag on the cached page");
assert.doesNotMatch(page, /safe\(s\.display_name \|\| s\.name\)/, "Title and JSON-LD use the same name casing as the H1");
assert.equal((page.match(/safe\(supplierShortName\(s\)\)/g) ?? []).length, 2, "Metadata and page body share supplierShortName");

// ---- 2. Traffic: profile reference re-checked on the server ------------------------------
const SUPPLIER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const recorded = [];
let session = null;
let supplier = { id: SUPPLIER, slug: null, status: "published" };
const route = load("app/api/public/traffic/route.ts", {
  "next/server": { NextResponse: class extends Response {} },
  "@/lib/auth/session": { getSession: async () => session },
  "@/lib/public/supplier-seo": { isSyntheticSupplier: (s) => !!s.synthetic },
  "@/lib/public/product-catalog": { listPublicCategoryProducts: async () => [] },
  "@/lib/db": { getStore: () => ({ getCategoryBySlug: async () => null, getSupplier: async (id) => (id === supplier.id ? supplier : null) }) },
  "@/lib/traffic/server": {
    recordPageView: async (pageView) => { recorded.push(pageView); },
    recordCountryView: async () => {},
    verifyTrafficToken: (token) => (token === "valid-profile" ? { kind: "profile", supplierId: SUPPLIER, resourceId: SUPPLIER, slug: SUPPLIER, exp: Date.now() + 1000 } : null),
  },
});
const post = (body) => route.POST(new Request("https://www.veximtrade.com/api/public/traffic", {
  method: "POST", body: JSON.stringify(body),
  headers: { origin: "https://www.veximtrade.com", host: "www.veximtrade.com", "content-type": "application/json", "user-agent": "Mozilla/5.0" },
}));

let res = await post({ profile: { supplierId: SUPPLIER, slug: SUPPLIER } });
assert.equal(res.status, 204);
assert.equal(recorded.length, 1, "A buyer view of a published profile without slug (id URL) is counted");
assert.deepEqual({ ...recorded[0], exp: 0 }, { kind: "profile", supplierId: SUPPLIER, resourceId: SUPPLIER, slug: SUPPLIER, exp: 0 });

supplier = { id: SUPPLIER, slug: "acme-foods", status: "published" };
await post({ profile: { supplierId: SUPPLIER, slug: "acme-foods" } });
assert.equal(recorded.length, 2, "A profile with a slug is counted under that slug");

for (const bad of [{ supplierId: SUPPLIER }, { supplierId: "not-a-uuid", slug: "acme-foods" }, { supplierId: SUPPLIER, slug: "../x" }, "x", null]) {
  assert.equal((await post({ profile: bad })).status, 400, `Malformed profile reference ${JSON.stringify(bad)} is rejected`);
}
const before = recorded.length;
await post({ profile: { supplierId: SUPPLIER, slug: SUPPLIER } }); // old id URL after a slug was added
supplier = { ...supplier, status: "draft" };
await post({ profile: { supplierId: SUPPLIER, slug: "acme-foods" } });
supplier = { id: SUPPLIER, slug: "acme-foods", status: "published", synthetic: true };
await post({ profile: { supplierId: SUPPLIER, slug: "acme-foods" } });
supplier = { id: SUPPLIER, slug: "acme-foods", status: "published" };
session = { uid: "staff" };
await post({ profile: { supplierId: SUPPLIER, slug: "acme-foods" } });
session = null;
await post({ profile: { supplierId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", slug: "acme-foods" } });
assert.equal(recorded.length, before, "Wrong slug, unpublished, test profile, staff session or unknown supplier: not counted");

supplier = { id: SUPPLIER, slug: null, status: "published" };
await post({ token: "valid-profile" });
assert.equal(recorded.at(-1)?.kind, "profile", "Signed profile tokens from older cached HTML keep working");
assert.equal((await post({ token: "expired" })).status, 400, "Invalid tokens are still rejected");

const beacon = read("components/supplier-traffic-beacon.tsx");
assert.match(beacon, /\{ profile: \{ supplierId: profileSupplierId, slug: profileSlug \} \}/, "The beacon sends the profile reference");

// ---- 3. Factory report button ------------------------------------------------------------
const report = read("components/download-factory-report.tsx");
assert.match(report, /signedIn\?: boolean;/, "signedIn is optional");
assert.match(report, /const isSignedIn = signedIn \?\? Boolean\(email\);/, "Falls back to the browser-side buyer session");
assert.match(report, /requireBuyer\(nextPath, \(\) => void download\(\)\)/, "Signing in from the profile continues the download");
assert.match(report, /href=\{`\/buyer\/sign-in\?next=\$\{encodeURIComponent\(nextPath\)\}`\}/, "Plain sign-in link still works without JS");
const reportApi = read("app/api/public/factory-report/[code]/route.ts");
assert.match(reportApi, /if \(!buyer && !staffAllowed\)/, "The report API still requires a signed-in buyer or staff");

// ---- 4. Copy -----------------------------------------------------------------------------
const premium = read("components/public/premium-storefront.tsx");
assert.match(premium, /`\$\{markets\.length\} markets`/, "Export regions are counted as markets, not countries");
assert.doesNotMatch(premium, /\$\{markets\.length\} countries/);
assert.match(premium, /return s\.annual_output\?\.trim\(\) \? supplierAnnualFigureLabel\(supplierAnnualOutputDisplay\(s\)\) : "Monthly capacity";/, "Capacity stat: annual revenue/output by value, else per month");
assert.match(premium, /fetchPriority="high"/, "The hero image loads first");
const storefront = read("components/public/supplier-storefront.tsx");
assert.doesNotMatch(storefront, /supplierHref=/, "Product cards on the profile do not link back to the same profile in a new tab");

// 5. Địa chỉ cũ theo id (/suppliers/<id>, dùng khi hồ sơ chưa có slug và đã được Google lưu)
//    chuyển hướng vĩnh viễn sang /suppliers/<slug> thay vì 404; chỉ với hồ sơ đang công khai.
assert.match(page, /async function redirectLegacySupplierUrl\(param: string\)/);
assert.match(page, /\(await publicSuppliersForRequest\(\)\)\.find\(\(s\) => s\.id === param && s\.slug && s\.slug !== param\)/,
  "Only a public profile that now has a slug is redirected");
assert.match(page, /permanentRedirect\(`\/suppliers\/\$\{encodeURIComponent\(supplier\.slug\)\}`\)/, "The old id URL redirects permanently");
const pageBody = page.slice(page.indexOf("export default async function SupplierProfile"));
assert.match(pageBody, /if \(!s\) \{\n    await redirectLegacySupplierUrl\(slug\);\n    notFound\(\);/, "Redirect before 404 on the page");
const metaBody = page.slice(page.indexOf("export async function generateMetadata"), page.indexOf("export default async function SupplierProfile"));
assert.match(metaBody, /await redirectLegacySupplierUrl\(slug\);/, "Redirect in metadata so crawlers get a real 308");

console.log("✅ Supplier profile static: ISR without cookies, server-verified view counting, browser-side report sign-in, copy fixes, old id URLs redirect to the slug.");
