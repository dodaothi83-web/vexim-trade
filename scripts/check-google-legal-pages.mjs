#!/usr/bin/env node
// node scripts/check-google-legal-pages.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const privacy = read('app/(legal)/privacy-policy/page.tsx');
const terms = read('app/(legal)/terms-of-service/page.tsx');
const legalLayout = read('app/(legal)/layout.tsx');
const oauth = read('app/api/auth/google/start/route.ts');
const middleware = read('middleware.ts');
const sitemap = read('app/sitemap.ts');
const robots = read('app/robots.ts');
assert.match(oauth, /scopes: "email profile"/);
assert.match(privacy, /email<\/strong> and <strong>basic profile/);
assert.match(privacy, /Supabase Auth/);
assert.match(privacy, /We do not request Gmail, Google Drive/);
assert.match(privacy, /deletion of your Vexim account/);
assert.match(terms, /sending an RFQ/i);
for (const page of [privacy, terms]) {
  assert.match(page, /title: \{ absolute: "/, 'Avoid duplicate site-name suffix in legal titles');
  assert.match(page, /alternates: \{ canonical: `\$\{SITE_URL\}\//);
  assert.match(page, /mailto:contact@veximglobal\.com/);
  assert.match(page, /robots: \{ index: true, follow: true \}/);
}
assert.doesNotMatch(legalLayout, /getStore|requireSession|listCategories/, 'Legal pages must not depend on auth or the database');
assert.match(middleware, /LEGAL_PATHS = new Set\(\["\/privacy-policy", "\/cookie-policy", "\/terms-of-service", "\/thong-tin-chu-quan", "\/quy-che-hoat-dong", "\/dieu-khoan-su-dung", "\/chinh-sach-bao-mat", "\/khieu-nai"\]\)/);
assert.match(robots, /allow: \["\/\$", "\/privacy-policy", "\/cookie-policy", "\/terms-of-service", "\/thong-tin-chu-quan", "\/quy-che-hoat-dong", "\/dieu-khoan-su-dung", "\/chinh-sach-bao-mat", "\/khieu-nai"\]/);
assert.match(sitemap, /url: `\$\{SITE_URL\}\/privacy-policy`/);
assert.match(sitemap, /url: `\$\{SITE_URL\}\/terms-of-service`/);
for (const route of ["thong-tin-chu-quan", "quy-che-hoat-dong", "dieu-khoan-su-dung", "chinh-sach-bao-mat", "khieu-nai"]) {
  assert.match(sitemap, new RegExp(`url: \`\\$\\{SITE_URL\\}\\/${route}\``), `Sitemap includes ${route}`);
  assert.match(read(`app/(legal)/${route}/page.tsx`), /robots: \{ index: true, follow: true \}/, `${route} is indexable`);
}
for (const file of [
  'app/(public)/home.tsx', 'app/(public)/simple-footer.tsx', 'components/site-footer.tsx',
  'app/(auth)/layout.tsx', 'app/(auth)/supplier/register/supplier-account-form.tsx',
  'app/(public)/rfq/page.tsx', 'app/(public)/rfq/rfq-form.tsx',
]) {
  assert.match(read(file), /href="\/privacy-policy"/, `${file} links to privacy`);
  assert.match(read(file), /href="\/terms-of-service"/, `${file} links to terms`);
}
console.log('✅ Public legal pages, OAuth data disclosure, discoverability and crawlability.');
