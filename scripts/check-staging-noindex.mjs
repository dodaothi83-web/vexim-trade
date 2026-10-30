// node scripts/check-staging-noindex.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, env, mocks = {}) {
  const exports = {}, code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, process: { env }, Headers, Date,
    require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import: ${key}`); return mocks[key]; } });
  return exports;
}
const middlewareMocks = { 'next/server': { NextResponse: { next: () => ({ headers: new Headers() }) } } };
const robotsMocks = { '@/lib/site': { SITE_URL: 'https://example.invalid' } };
const sitemapMocks = { ...robotsMocks, '@/lib/blog/queries': {}, '@/lib/db': {}, '@/lib/public/catalog': {},
  '@/lib/public/product-catalog': {}, '@/lib/public/supplier-seo': {} };
const request = (path) => ({ nextUrl: { pathname: path }, headers: new Headers() });
for (const env of [
  { PUBLIC_SITE_INDEXABLE: 'true', VERCEL_ENV: 'preview' },
  { PUBLIC_SITE_INDEXABLE: 'true', VERCEL_ENV: 'development' },
  { PUBLIC_SITE_INDEXABLE: 'true', VERCEL_ENV: 'production', VEXIM_DEPLOY_ENV: 'staging' },
]) {
  const middleware = load('../middleware.ts', env, middlewareMocks).middleware;
  for (const path of ['/', '/products/cashew-kernels', '/privacy-policy'])
    assert.equal(middleware(request(path)).headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const robots = load('../app/robots.ts', env, robotsMocks).default();
  assert.equal(robots.rules[0].disallow, '/'); assert.equal(robots.sitemap, undefined);
  assert.equal((await load('../app/sitemap.ts', env, sitemapMocks).default()).length, 0);
}
const prod = { PUBLIC_SITE_INDEXABLE: 'true', VERCEL_ENV: 'production' };
const middleware = load('../middleware.ts', prod, middlewareMocks).middleware;
assert.equal(middleware(request('/')).headers.get('X-Robots-Tag'), null, 'Production indexing stays unchanged');
assert.equal(middleware(request('/crm')).headers.get('X-Robots-Tag'), 'noindex, nofollow');
const robots = load('../app/robots.ts', prod, robotsMocks).default();
assert.equal(robots.sitemap, 'https://example.invalid/sitemap.xml');
console.log('Staging noindex: headers, robots and empty sitemap remain safe even with a copied indexable flag');
