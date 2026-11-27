// node scripts/check-supplier-guides.mjs
// Hướng dẫn nhà cung cấp, giai đoạn 1 (27/11/2026): bảng riêng, soạn trong CRM bằng trình soạn thảo
// blog (thêm khối video YouTube và hộp lưu ý), chỉ hiện trong cổng nhà cung cấp, không công khai.
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
const ID = 'dQw4w9WgXcQ';
for (const url of [`https://youtu.be/${ID}`, `https://www.youtube.com/watch?v=${ID}&t=10`, `https://youtube.com/shorts/${ID}`,
  `https://www.youtube.com/embed/${ID}`, `https://m.youtube.com/watch?v=${ID}`, ID])
  assert.equal(video.youTubeId(url), ID, url);
for (const bad of ['https://vimeo.com/123', 'javascript:alert(1)', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://youtu.be/short', '', null])
  assert.equal(video.youTubeId(bad), null, `rejects ${bad}`);
assert.match(video.youTubeEmbedUrl(ID), /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);

const payload = load('lib/guides/guide-payload');
const blocks = [
  { id: 'a', type: 'paragraph', data: { text: 'Mở mục <strong>Sản phẩm</strong><script>x</script>', align: 'left' } },
  { id: 'b', type: 'list', data: { style: 'ordered', items: ['Bước một', 'Bước hai', 'Bước ba'] } },
  { id: 'c', type: 'video', data: { url: `https://youtu.be/${ID}`, caption: '<b>Video</b> mẫu' } },
  { id: 'd', type: 'video', data: { url: 'https://evil.example/x.mp4', caption: 'lạ' } },
  { id: 'e', type: 'callout', data: { tone: 'warning', text: '<img src=x onerror=alert(1)>Ảnh qua Zalo mất dữ liệu gốc' } },
  { id: 'f', type: 'callout', data: { tone: 'bogus', text: 'Ghi chú' } },
];
const built = payload.buildGuideInput({ title: '  Cách đăng sản phẩm  ', topic: 'san-pham', summary: 'Tóm tắt', content: blocks, sort_order: '3', status: 'published', id: 'evil', created_at: 'x' });
assert.deepEqual(built.errors.length, 0);
assert.equal(built.input.title, 'Cách đăng sản phẩm');
assert.equal(built.input.slug, 'cach-dang-san-pham');
assert.equal(built.input.sort_order, 3);
assert.equal(built.input.status, 'published');
assert.ok(!('id' in built.input) && !('created_at' in built.input), 'Only whitelisted columns are written');
const saved = JSON.parse(built.input.content);
assert.deepEqual(saved.map((b) => b.type), ['paragraph', 'list', 'video', 'callout', 'callout'], 'Non-YouTube video is dropped');
assert.doesNotMatch(saved[0].data.text, /script/);
assert.equal(saved[3].data.tone, 'warning');
assert.doesNotMatch(saved[3].data.text, /<img|onerror/, 'Callout text is plain text');
assert.equal(saved[4].data.tone, 'note', 'Unknown tone falls back to note');
assert.ok(payload.buildGuideInput({ title: '', topic: 'unknown', content: [] }).errors.length >= 2, 'Title and a known topic are required');
const typed = saved;
assert.equal(payload.guideStepCount(typed), 3, 'Steps count the ordered list items');
assert.ok(payload.guideReadingMinutes(typed) >= 2, 'A video adds reading time');

// Blog keeps its original blocks: video/callout never reach a public blog post.
const post = load('lib/blog/post-payload');
const blogBlocks = post.sanitizeBlocks(blocks);
assert.ok(!blogBlocks.some((b) => b.type === 'video' || b.type === 'callout'), 'Blog sanitizer does not accept guide-only blocks');

const html = load('lib/blocks-to-html').blocksToHTML(typed);
assert.match(html, /<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?rel=0"/);
assert.match(html, /role="note"/);
assert.match(html, /Cảnh báo/);
assert.doesNotMatch(html, /onerror|<script/);

const topics = load('lib/guides/topics');
assert.equal(topics.GUIDE_TOPICS.map((t) => t.slug).join(), 'bat-dau,ho-so-xac-minh,san-pham,bao-gia,goi-dich-vu');
for (const t of topics.GUIDE_TOPICS) assert.ok(t.label.vi && t.label.en && t.description.vi && t.description.en);

// Wiring: private to suppliers, never public.
const migration = read('supabase/migrations/20261231_supplier_guides.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.supplier_guides/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.doesNotMatch(migration, /CREATE POLICY/i, 'No public policy: only the server (service role) reads guides');
const portalLib = read('lib/guides/portal.ts');
assert.match(portalLib, /session\.role !== "supplier"/, 'Only supplier accounts read guides');
assert.match(portalLib, /listSupplierGuides\(\{ status: "published" \}\)/, 'Suppliers only see published guides');
const detail = read('app/supplier/portal/huong-dan/[slug]/page.tsx');
assert.match(detail, /getSupplierGuideBySlug\(slug, \{ publishedOnly: true \}\)/, 'A draft URL is not found for suppliers');
assert.match(detail, /robots: \{ index: false, follow: false \}/);
assert.match(read('app/supplier/portal/huong-dan/page.tsx'), /robots: \{ index: false, follow: false \}/);
const sidebar = read('components/supplier-sidebar.tsx');
assert.match(sidebar, /\{ href: "\/supplier\/portal\/huong-dan", labelKey: "guides", icon: BookOpen, group: "account" \}/,
  'Guides are reachable before portal approval');
for (const f of ['app/crm/guides/page.tsx', 'app/crm/guides/new/page.tsx', 'app/crm/guides/[id]/page.tsx'])
  assert.match(read(f), /requirePagePermission\("blog\.manage"\)/, `${f} is staff-only`);
const actions = read('app/crm/guides/guide-actions.ts');
assert.equal((actions.match(/guard\("blog\.manage"\)/g) ?? []).length, 2, 'Save and delete both check permission');
assert.doesNotMatch(actions, /sitemap|indexnow|\/blog/i, 'Guides never touch the public blog, sitemap or IndexNow');
assert.match(read('components/guides/guide-editor.tsx'), /extraBlocks=\{\[\.\.\.GUIDE_EXTRA_BLOCKS\]\}/);
assert.doesNotMatch(read('components/blog/post-editor.tsx'), /extraBlocks/, 'Blog editor does not offer guide-only blocks');

const portal = load('lib/guides/search');
assert.equal(portal.matchesGuideQuery({ title: 'Cách đăng sản phẩm đầu tiên', summary: null }, 'dang san pham'), true, 'Search ignores Vietnamese accents');
assert.equal(portal.matchesGuideQuery({ title: 'Cách đăng sản phẩm', summary: 'ảnh' }, 'bao gia'), false);
const list = read('app/supplier/portal/huong-dan/page.tsx');
assert.ok(list.includes('role="search"') && list.includes('LearningPath') && list.includes('TopicMenu') && list.includes('<VeximIcon name={topic.icon}'),
  'Guide centre: search hero, numbered path, topic menu and approved brand icons');
for (const t of topics.GUIDE_TOPICS) assert.ok(t.icon, `${t.slug} has an approved brand icon`);

console.log('✅ Supplier guides: private table, CRM editor with video and callout blocks, published-only supplier pages.');
