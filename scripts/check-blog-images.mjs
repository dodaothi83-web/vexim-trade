// Ảnh blog: chuyển sang WebP ≤1600px khi tải lên; ảnh cũ chuyển qua route quản trị, không sửa bài.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import sharp from 'sharp';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function load(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, Uint8Array, require: (id) => {
    assert.ok(id in mocks, `Unexpected ${id} in ${path}`);
    return mocks[id];
  } });
  return exports;
}

const { optimizeBlogImage, BLOG_IMAGE_MAX_SIDE } = load('lib/media/blog-image.ts', { 'server-only': {}, sharp: { default: sharp } });
assert.equal(BLOG_IMAGE_MAX_SIDE, 1600);

// PNG lớn kiểu ảnh chụp: thành WebP nhỏ hơn nhiều, cạnh dài 1600px, giữ tỉ lệ.
const w = 2400, h = 1600;
const raw = Buffer.alloc(w * h * 3);
for (let i = 0; i < w * h; i++) {
  const x = i % w, y = (i / w) | 0, n = (i * 2654435761 >>> 0) % 40;
  raw[i * 3] = (x / w * 200 + n) | 0; raw[i * 3 + 1] = (y / h * 180 + n) | 0; raw[i * 3 + 2] = 120 + n;
}
const png = new Uint8Array(await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer());
const out = await optimizeBlogImage(png, 'image/png');
const meta = await sharp(Buffer.from(out.data)).metadata();
assert.equal(out.mime, 'image/webp');
assert.equal(out.ext, 'webp');
assert.equal(meta.format, 'webp');
assert.equal(meta.width, 1600);
assert.equal(meta.height, 1067);
assert.ok(out.data.byteLength < png.byteLength / 10, `WebP phải nhỏ hơn nhiều (${png.byteLength} -> ${out.data.byteLength})`);

// Ảnh nhỏ không bị phóng to; WebP sẵn nhỏ hơn bản chuyển thì giữ nguyên.
const small = new Uint8Array(await sharp({ create: { width: 300, height: 200, channels: 3, background: '#123456' } }).webp({ quality: 40 }).toBuffer());
const kept = await optimizeBlogImage(small, 'image/webp');
assert.equal(kept.data, small, 'giữ WebP gốc khi bản chuyển không nhỏ hơn');
const jpg = new Uint8Array(await sharp({ create: { width: 300, height: 200, channels: 3, background: '#abcdef' } }).jpeg().toBuffer());
const jpgOut = await optimizeBlogImage(jpg, 'image/jpeg');
assert.equal((await sharp(Buffer.from(jpgOut.data)).metadata()).width, 300, 'không phóng to ảnh nhỏ');
// GIF có thể là ảnh động: giữ nguyên.
const gif = new Uint8Array([71, 73, 70]);
assert.equal((await optimizeBlogImage(gif, 'image/gif')).data, gif);

// Route tải ảnh blog luôn đi qua bộ chuyển.
const upload = read('app/api/upload-image/route.ts');
assert.match(upload, /await optimizeBlogImage\(bytes, check\.mime\)/);
assert.match(upload, /const rel = `blog\/\$\{randomUUID\(\)\}\.\$\{image\.ext\}`/);
assert.match(upload, /putObject\(rel, image\.data, image\.mime\)/);

// Route chuyển ảnh cũ: chỉ Quản trị, có dry-run và mã xác nhận, không sửa bài và không xoá ảnh gốc.
const route = read('app/api/crm/blog-images/route.ts');
assert.match(route, /session\.role !== "admin"\) return json\(\{ error: "auth" \}, 401\)/);
assert.match(route, /if \(url\.searchParams\.get\("run"\) !== "1"\)/);
assert.match(route, /tokenMatches\(session\.uid, url\.searchParams\.get\("confirm"\)\)/);
assert.match(route, /const target = `blog\/\$\{match\[2\]\.toLowerCase\(\)\}\.webp`/, 'bản WebP cùng uuid với ảnh gốc');
assert.doesNotMatch(route, /updatePost|from\("posts"\)|deleteObject|\.remove\(/, 'không sửa bài, không xoá tệp');

const pattern = /\/blog-media\/(blog\/([a-f0-9-]{36})\.(?:png|jpe?g))/gi;
const sample = '{"url":"/blog-media/blog/71fd7e1e-41ca-4fe0-b3e6-2d6631b034c5.png"} /blog-media/blog/0379bcad-0357-4e50-a05e-82e3d7f2db2f.webp /blog-media/blog/AB000000-0000-4000-8000-000000000000.JPG';
assert.deepEqual([...sample.matchAll(pattern)].map((m) => m[1]), [
  'blog/71fd7e1e-41ca-4fe0-b3e6-2d6631b034c5.png',
  'blog/AB000000-0000-4000-8000-000000000000.JPG',
], 'chỉ lấy ảnh PNG/JPG cũ, bỏ qua WebP');
assert.ok(route.includes(pattern.source), 'route dùng đúng mẫu đã kiểm tra');

// Giới hạn tải lên dùng chung cho máy chủ và 3 chỗ tải ảnh trong trình soạn thảo.
const limits = load('lib/blog/image-limits.ts', {});
assert.equal(limits.BLOG_IMAGE_MAX_BYTES, 2 * 1024 * 1024);
assert.equal(limits.BLOG_IMAGE_ACCEPT, 'image/jpeg,image/png,image/webp');
assert.equal(limits.blogImageProblem({ type: 'image/jpeg', size: 2 * 1024 * 1024 }), null, 'đúng 2 MB vẫn nhận');
assert.equal(limits.blogImageProblem({ type: 'image/png', size: 2.4 * 1024 * 1024 }),
  'Ảnh nặng 2,4 MB, vượt giới hạn 2 MB. Hãy thu nhỏ ảnh còn rộng tối đa 1600px rồi tải lại.');
assert.equal(limits.blogImageProblem({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }).startsWith('Ảnh nặng 2,1 MB'), true, 'làm tròn lên, không báo "2,0 MB vượt 2 MB"');
for (const type of ['image/gif', 'image/avif', 'image/svg+xml', 'application/pdf', '']) {
  assert.equal(limits.blogImageProblem({ type, size: 1000 }), 'Chỉ nhận ảnh JPG, PNG hoặc WebP.', `từ chối ${type || 'không rõ loại'}`);
}
for (const message of [limits.BLOG_IMAGE_HINT, limits.blogImageTooLargeMessage(9.9 * 1024 * 1024)]) {
  assert.ok(message.length <= 120 && !message.includes('—'), `câu ngắn, không dùng gạch dài: ${message}`);
}
assert.match(upload, /if \(file\.size > BLOG_IMAGE_MAX_BYTES\)/, 'máy chủ chặn theo cùng giới hạn');
assert.match(upload, /blogImageTooLargeMessage\(file\.size\)/);
const imageBlock = read('components/block-editor/blocks/image-block.tsx');
const postEditor = read('components/blog/post-editor.tsx');
const blockEditor = read('components/block-editor/block-editor.tsx');
for (const [name, source] of [['khối ảnh', imageBlock], ['ảnh bìa', postEditor], ['dán/kéo thả', blockEditor]]) {
  assert.match(source, /blogImageProblem\(file\)/, `${name} kiểm tra giới hạn trước khi gửi`);
  assert.doesNotMatch(source, /5 \* 1024 \* 1024|5MB/, `${name} không còn giới hạn 5MB cũ`);
}
for (const source of [imageBlock, postEditor]) {
  assert.match(source, /accept=\{BLOG_IMAGE_ACCEPT\}/);
  assert.match(source, /\{BLOG_IMAGE_HINT\}/);
  assert.doesNotMatch(source, /GIF|AVIF/, 'không hứa định dạng máy chủ không nhận');
}
assert.match(blockEditor, /setPastedImageError\(problem\)/, 'ảnh dán quá nặng được báo, không bị bỏ qua im lặng');
assert.match(blockEditor, /role="alert"/);

// Ảnh bìa là ảnh lớn nhất trang bài viết: tải sớm.
assert.match(read('app/blog/[slug]/page.tsx'), /fetchPriority="high"/);

console.log('check-blog-images: OK');
