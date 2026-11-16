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
// Ba danh sách phải nói CÙNG một chuyện: robots cho bot đọc trang nào, middleware
// có gắn noindex cho trang đó không, và sitemap có khai trang đó không. Trước đây
// chúng lệch nhau (thiếu /cookie-policy và /platform-rules), khiến Google nhận tín
// hiệu ngược nhau cho cùng một URL.
const legalPathsOf = (source) => {
  const match = /LEGAL_PATHS = new Set\(\[([^\]]+)\]\)/.exec(source);
  assert.ok(match, 'middleware khai LEGAL_PATHS');
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
};
const robotsAllowOf = (source) => {
  const match = /allow: \[([^\]]+)\], disallow: "\/"/.exec(source);
  assert.ok(match, 'robots có allow-list trước khi chặn toàn site');
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};
const sitemapLegalOf = (source) => [...source.matchAll(/url: `\$\{SITE_URL\}\/([a-z-]+)`, changeFrequency: "yearly"/g)]
  .map((m) => `/${m[1]}`)
  .sort();
const middlewareLegal = legalPathsOf(middleware);
const robotsLegal = robotsAllowOf(robots).filter((path) => !["/$", "/favicon.ico", "/favicon.png", "/robots.txt", "/sitemap.xml", "/llms.txt"].includes(path)).sort();
const sitemapLegal = sitemapLegalOf(sitemap);
assert.deepEqual(robotsLegal, middlewareLegal, 'robots allow-list khớp middleware LEGAL_PATHS');
assert.deepEqual(sitemapLegal, middlewareLegal, 'sitemap legalRoutes khớp middleware LEGAL_PATHS');
for (const path of ["/cookie-policy", "/platform-rules"]) {
  assert.ok(middlewareLegal.includes(path), `${path} được middleware cho phép index`);
}
assert.match(sitemap, /url: `\$\{SITE_URL\}\/privacy-policy`/);
assert.match(sitemap, /url: `\$\{SITE_URL\}\/terms-of-service`/);
for (const route of ["thong-tin-chu-quan", "quy-che-hoat-dong", "dieu-khoan-su-dung", "chinh-sach-bao-mat", "khieu-nai", "platform-rules"]) {
  assert.match(sitemap, new RegExp(`url: \`\\$\\{SITE_URL\\}\\/${route}\``), `Sitemap includes ${route}`);
  assert.match(read(`app/(legal)/${route}/page.tsx`), /robots: \{ index: true, follow: true \}/, `${route} is indexable`);
}
// Biểu mẫu đăng ký NCC nằm trong khung tài khoản đa ngôn ngữ nên dùng liên kết pháp lý
// tiếng Việt như khung (xem khối kiểm ngay dưới), không dùng trang tiếng Anh.
for (const file of [
  'app/(public)/rfq/page.tsx', 'app/(public)/rfq/rfq-form.tsx',
]) {
  assert.match(read(file), /href="\/privacy-policy"/, `${file} links to privacy`);
  assert.match(read(file), /href="\/terms-of-service"/, `${file} links to terms`);
}

// Khung trang tài khoản dùng liên kết pháp lý tiếng Việt (/chinh-sach-bao-mat & /dieu-khoan-su-dung).
assert.match(read('components/auth-split-shell.tsx'), /href="\/chinh-sach-bao-mat"/, 'auth shell links to Vietnamese privacy policy');
assert.match(read('components/auth-split-shell.tsx'), /href="\/dieu-khoan-su-dung"/, 'auth shell links to Vietnamese terms of service');
assert.match(read('app/(auth)/supplier/register/supplier-account-form.tsx'), /href="\/chinh-sach-bao-mat"/, 'supplier signup links to Vietnamese privacy policy');
assert.match(read('app/(auth)/supplier/register/supplier-account-form.tsx'), /href="\/dieu-khoan-su-dung"/, 'supplier signup links to Vietnamese terms of service');
console.log('✅ Public legal pages, OAuth data disclosure, discoverability and crawlability.');

for (const file of ['app/(public)/home.tsx', 'app/(public)/simple-footer.tsx', 'components/site-footer.tsx', 'app/(legal)/layout.tsx']) {
  assert.match(read(file), /<PlatformLegalStrip variant="footer"/, `${file} delegates legal navigation to the shared footer`);
}
const footer = read('components/platform-legal-strip.tsx');
assert.match(footer, /en: "\/privacy-policy"/);
assert.match(footer, /en: "\/terms-of-service"/);
