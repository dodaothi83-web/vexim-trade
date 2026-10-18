// node scripts/check-home-news.mjs — homepage shows only real, published news from /blog.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function load(path, mocks) {
  const exports = {};
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(js, { exports, Date, Set, console, require: (name) => {
    if (name === 'server-only') return {};
    assert.ok(name in mocks, `Unexpected import ${name} in ${path}`);
    return mocks[name];
  } }, { filename: path });
  return exports;
}
const post = (slug, publishedAt, extra = {}) => ({
  id: slug, slug, title: `Guide to ${slug}`, excerpt: `Read about ${slug}.`,
  featured_image: null, featured_image_alt: null,
  category: 'tin-tuc', status: 'published', published_at: publishedAt, ...extra,
});
let rows = [
  post('oldest', '2026-09-01T00:00:00Z'),
  post('newest', '2026-10-18T00:00:00Z', { featured_image: '/blog-media/newest.jpg', featured_image_alt: 'New article cover' }),
  post('third', '2026-10-01T00:00:00Z'),
  post('second', '2026-10-11T00:00:00Z'),
  post('unpublished', '2026-10-20T00:00:00Z', { status: 'draft' }),
  post('unrelated', '2026-10-21T00:00:00Z', { category: 'other' }),
];
const store = {
  listPosts: async () => rows,
  listCategories: async () => [],
  listSuppliers: async () => [],
};
const news = load('../lib/blog/queries.ts', {
  '@/lib/db': { getStore: () => store },
  '@/lib/blog/blog-categories': { DEFAULT_BLOG_CATEGORY: 'tin-tuc' },
  '@/lib/blog/seo-check': { titleSimilarity: () => 0 },
});
assert.equal(typeof news.listPublishedNews, 'function');
const valid = await news.listPublishedNews();
assert.equal(valid.length, 4);
assert.equal(valid[0].slug, 'newest');
const Home = load('../app/(public)/home.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/image': { default: ({ src, alt, ...props }) => React.createElement('img', { src, alt, className: props.className }) },
  'next/link': { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
  'lucide-react': require('lucide-react'),
  '@/lib/db': { getStore: () => store },
  '@/lib/blog/queries': news,
  '@/lib/public/product-catalog': { listPublicCategoryProducts: async () => [] },
  '@/lib/public/supplier-product-order': { arrangeSupplierProducts: () => ({ shown: [] }) },
  '@/components/public-product-card': { PublicProductCard: () => null },
}).default;
const html = renderToStaticMarkup(await Home());
const section = html.match(/<section aria-labelledby="home-news-title"[\s\S]*?<\/section>/)?.[0];
assert.ok(section, 'Homepage has a real news section');
assert.match(section, /Latest articles|View all articles/);
assert.match(section, /href="\/blog\/newest"/);
assert.match(section, /src="\/blog-media\/newest.jpg"/);
assert.match(section, /New article cover/);
assert.ok(section.indexOf('/blog/newest') < section.indexOf('/blog/second'));
assert.ok(section.indexOf('/blog/second') < section.indexOf('/blog/third'));
assert.doesNotMatch(section, /\/blog\/(?:oldest|unpublished|unrelated)/, 'Only three newest published News posts appear');
assert.match(section, /sm:grid-cols-2 lg:grid-cols-3/, 'Desktop news grid has three columns');
assert.doesNotMatch(html, /We visit before we list|Our team visits every factory first|factories visited|walked the floor/, 'Old unsupported factory claims must not remain on the homepage');
rows = rows.filter((p) => ['newest', 'second'].includes(p.slug));
const twoPosts = renderToStaticMarkup(await Home());
const twoPostSection = twoPosts.match(/<section aria-labelledby="home-news-title"[\s\S]*?<\/section>/)?.[0] ?? '';
assert.match(twoPostSection, /sm:grid-cols-2 lg:grid-cols-3/, 'Keep three desktop columns even before a third article is published');
assert.equal((twoPostSection.match(/<article\b/g) ?? []).length, 2, 'Never invent a third article');
rows = [];
const empty = renderToStaticMarkup(await Home());
assert.match(empty, /No articles published yet/);
assert.doesNotMatch(empty, /href="\/blog\/newest"|Cashew kernel grading line/);
assert.match(empty, /Visit our news page/);
console.log('✅ Home news: live blog source, latest published posts, real links/media and honest empty state.');
