// node scripts/check-blog-vi.mjs
// Mục blog tiếng Việt "Kiến thức xuất khẩu" (27/11/2026): bài cho doanh nghiệp Việt, tách khỏi News
// tiếng Anh, không vào thư người mua, có lang="vi", sitemap và đếm lượt xem riêng.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.join(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const cache = new Map();
/** Nạp module TS thật, tự giải "@/..." trong repo (không cần build). */
function load(rel) {
  const file = ['', '.ts', '.tsx', '/index.ts'].map((ext) => path.join(root, rel + ext)).find((f) => existsSync(f) && !f.endsWith('/'));
  assert.ok(file, `missing ${rel}`);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, { module: mod, exports: mod.exports, console, URL, Buffer, Math, Date, JSON,
    require: (id) => {
      if (id === 'server-only') return {};
      if (id.startsWith('@/')) return load(id.slice(2));
      if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), id)));
      throw new Error(`unexpected import ${id} in ${rel}`);
    } }, { filename: file });
  return mod.exports;
}

const video = load('lib/guides/video');

const cats = load('lib/blog/blog-categories');
const vi = cats.getBlogCategory('xuat-khau');
assert.ok(vi, 'Vietnamese category exists');
assert.equal(vi.lang, 'vi');
assert.equal(vi.basePath, '/blog/xuat-khau');
assert.equal(vi.inBuyerDigest, false, 'Vietnamese posts never go to buyer emails');
assert.equal(cats.getBlogCategory('tin-tuc').basePath, '/blog');
assert.equal(cats.blogPostPath({ slug: 'xuat-khau-hat-dieu-sang-my', category: 'xuat-khau' }), '/blog/xuat-khau/xuat-khau-hat-dieu-sang-my');
assert.equal(cats.blogPostPath({ slug: 'cashew-market-2026', category: 'tin-tuc' }), '/blog/cashew-market-2026');
assert.equal(cats.BUYER_DIGEST_BLOG_CATEGORIES.join(), 'tin-tuc');

const site = load('lib/traffic/site-path');
assert.equal(site.publicSitePageKey('/blog/xuat-khau'), 'blog');
assert.equal(site.publicSitePageKey('/blog/xuat-khau/thu-tuc-fda'), 'article:thu-tuc-fda');
assert.equal(site.publicSitePageKey('/blog/cashew-market'), 'article:cashew-market');

const config = load('lib/i18n/config');
assert.ok(config.LEGACY_VIETNAMESE_PATH_RE.test('/blog/xuat-khau'), 'Vietnamese listing gets html lang vi');
assert.ok(config.LEGACY_VIETNAMESE_PATH_RE.test('/blog/xuat-khau/thu-tuc-fda'));
assert.ok(!config.LEGACY_VIETNAMESE_PATH_RE.test('/blog/cashew-market'), 'English news stays lang en');

const queries = read('lib/blog/queries.ts');
assert.match(queries, /export async function listPublishedNews\(\): Promise<Post\[\]> \{\n  return listPublishedPosts\(DEFAULT_BLOG_CATEGORY\);/, 'English listing, home page and sitemap news stay News-only');
assert.match(queries, /if \(!post \|\| post\.category !== category\) return null;/, 'A slug only opens under its own section');
assert.match(read('lib/buyer/digest-server.ts'), /\.in\("category", BUYER_DIGEST_BLOG_CATEGORIES\)/, 'Buyer digest reads buyer-facing posts only');
const sitemap = read('app/sitemap.ts');
assert.ok(sitemap.includes('listPublishedViExport') && sitemap.includes('${viBase}/${post.slug}'), 'Vietnamese posts are in the sitemap');
const page = read('app/blog/xuat-khau/[slug]/page.tsx');
assert.ok(page.includes('getPublishedPostBySlug(VI_EXPORT_BLOG_CATEGORY, slug)') && page.includes('inLanguage: "vi"') && page.includes('locale: "vi_VN"') && page.includes('<SupplierCta'), 'Vietnamese article: own section, vi metadata, supplier CTA');
assert.ok(!/languages:/.test(page) && !/languages:/.test(read('app/blog/xuat-khau/page.tsx')), 'Separate articles, not translations: no hreflang pairing');
assert.match(read('components/blog/supplier-cta.tsx'), /href="\/supplier\/register\?type=supplier"/);
const actions = read('app/blog-actions.ts');
assert.ok(actions.includes('revalidatePath("/blog/xuat-khau")') && actions.includes('revalidatePath(blogPostPath(post))') && !actions.includes('`/blog/${'), 'Cache refresh and IndexNow follow each section path');
const editor = read('components/blog/post-editor.tsx');
assert.ok(editor.includes('ref.category === category') && editor.includes('inBuyerDigest !== false'), 'Editor compares topics within a section and hides buyer-email categories for Vietnamese posts');

console.log('✅ Vietnamese blog: separate section with lang vi, sitemap, own traffic key, supplier CTA, never in buyer emails.');
