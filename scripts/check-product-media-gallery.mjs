// node scripts/check-product-media-gallery.mjs — staff cover authority, public video gate and in-page gallery.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isExpired } from '../lib/media/readiness.ts';

const require = createRequire(import.meta.url);
function load(file, mocks) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, Date, URL, process,
    require: (key) => { assert.ok(key in mocks, `${file}: unexpected ${key}`); return mocks[key]; },
  }, { filename: file });
  return mod.exports;
}
const media = load('../lib/public/product-video.ts', {
  '@/lib/media/readiness': { isExpired },
  '@/lib/public/product-selection': { withoutDirectContacts: (s) => s.replace(/owner@example.com/g, '[contact via Vexim]') },
});
const embed = media.safeProductVideoEmbed;
assert.equal(embed('https://youtu.be/dQw4w9WgXcQ?t=12'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
assert.equal(embed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
assert.equal(embed('https://drive.google.com/file/d/0123456789AbCdEfGhIJ/view?usp=share'), 'https://drive.google.com/file/d/0123456789AbCdEfGhIJ/preview');
for (const url of ['https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)',
  'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=<script>', 'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ'])
  assert.equal(embed(url), null, `Do not embed untrusted URL: ${url}`);
const pid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const supplierId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const goodId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const product = { id: pid, supplier_id: supplierId, ready_for_buyer: false, featured_media_id: null };
let photo = { id: goodId, owner_type: 'product', product_id: pid, supplier_id: supplierId,
  kind: 'image', audience: 'buyer', status: 'unverified', expires_on: null, storage_path: 'products/abc/photo.jpg' };
const audit = [];
let denied = true;
const store = {
  getProduct: async () => product,
  getMedia: async () => photo,
  updateProduct: async (_id, patch) => Object.assign(product, patch),
  addAuditLog: async (entry) => audit.push(entry),
};
const action = load('../app/crm/products/[slug]/edit/featured-image-action.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/auth/session': { guard: async () => denied ? { message: 'No permission' } : null,
    getSession: async () => ({ uid: 'staff', email: 'staff@example.com' }) },
  '@/lib/db': { getStore: () => store },
  '@/lib/media/readiness': { isExpired },
});
assert.equal((await action.setFeaturedProductImageAction(pid, goodId)).ok, false, 'Supplier cannot set public cover');
denied = false;
for (const patch of [{ audience: 'internal' }, { kind: 'catalogue' }, { product_id: 'other' },
  { status: 'expired' }, { storage_path: null }, { supplier_id: 'other' }]) {
  photo = { ...photo, ...patch };
  assert.equal((await action.setFeaturedProductImageAction(pid, goodId)).ok, false, 'Only a shareable product-owned photo is eligible');
  photo = { id: goodId, owner_type: 'product', product_id: pid, supplier_id: supplierId,
    kind: 'image', audience: 'buyer', status: 'unverified', expires_on: null, storage_path: 'products/abc/photo.jpg' };
}
assert.equal(product.featured_media_id, null);
assert.equal((await action.setFeaturedProductImageAction(pid, goodId)).ok, true);
assert.equal(product.featured_media_id, goodId);
assert.equal(product.ready_for_buyer, false, 'Selecting a cover never publishes a product');
assert.equal(audit.at(-1).action, 'product.featured_image_changed');
assert.equal((await action.setFeaturedProductImageAction(pid, null)).ok, true);
assert.equal(product.featured_media_id, null, 'Staff can return to first-eligible-image fallback');
const videoBase = { id: 'video-1', owner_type: 'product', product_id: pid, kind: 'video', audience: 'buyer',
  status: 'checked', expires_on: null, sort_order: 0, created_at: '2026-01-01',
  external_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', caption: 'owner@example.com tour' };
const chosen = media.shareableProductVideo([
  { ...videoBase, id: 'private', audience: 'internal', sort_order: -3 },
  { ...videoBase, id: 'wrong-product', product_id: 'other', sort_order: -2 },
  { ...videoBase, id: 'expired', status: 'expired', sort_order: -1 },
  videoBase,
], pid);
assert.equal(chosen.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
assert.equal(chosen.title, '[contact via Vexim] tour');
assert.equal(media.shareableProductVideo([{ ...videoBase, audience: 'internal' }], pid), null);
assert.equal(media.shareableProductVideo([{ ...videoBase, external_url: 'https://evil.example/video' }], pid), null);
const { ProductMediaGallery, productGallerySwipeStep } = load('../components/product-media-gallery.tsx', {
  react: require('react'), 'react-dom': require('react-dom'),
  'react/jsx-runtime': require('react/jsx-runtime'), 'lucide-react': require('lucide-react'),
});
assert.equal(productGallerySwipeStep(100, 100, 40, 105), 1, 'A clear left swipe advances to the next photo');
assert.equal(productGallerySwipeStep(100, 100, 160, 105), -1, 'A clear right swipe returns to the previous photo');
assert.equal(productGallerySwipeStep(100, 100, 130, 100), 0, 'A small horizontal movement is not a swipe');
assert.equal(productGallerySwipeStep(100, 100, 40, 180), 0, 'Mostly vertical movement remains page scrolling');
const html = renderToStaticMarkup(React.createElement(ProductMediaGallery, {
  name: 'Cashew W320', images: ['products/abc/cover.jpg', 'products/abc/detail.jpg'],
  thumbnails: ['products/abc/cover-thumb.webp', 'products/abc/detail-thumb.webp'], video: chosen,
}));
assert.match(html, /Product video/); assert.match(html, /Product photos/);
assert.match(html, /products\/abc\/cover\.jpg/, 'Full image is available for zoom');
assert.match(html, /products\/abc\/cover-thumb\.webp/, 'Small gallery tiles load derivatives');
assert.match(html, /products\/abc\/detail-thumb\.webp/);
assert.match(html, /aria-pressed="true"/);
assert.match(html, /Enlarge photo of Cashew W320 on this page/);
assert.doesNotMatch(html, /<iframe|target="_blank"/, 'Gallery must not embed before play or open images in a new tab');
const noVideoHtml = renderToStaticMarkup(React.createElement(ProductMediaGallery, {
  name: 'Cashew W320', images: ['products/abc/cover.jpg', 'products/abc/detail.jpg'],
  thumbnails: ['products/abc/cover-thumb.webp', 'products/abc/detail-thumb.webp'], video: null,
}));
assert.doesNotMatch(noVideoHtml, /Product video|No buyer-shareable video/, 'An absent video leaves no dead panel');
assert.ok(noVideoHtml.includes('grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[4rem_minmax(0,1fr)]'),
  'Mobile uses one full-width image column and the two-column rail returns from sm');
assert.match(noVideoHtml, /relative aspect-square[^\"]*sm:order-2/, 'The main image is first on mobile and moves right on larger screens');
assert.match(noVideoHtml, /relative min-w-0 sm:order-1/, 'The thumbnail rail moves left only from sm');
assert.match(noVideoHtml, /w-full min-w-0 overflow-x-auto pb-1 sm:absolute sm:inset-0 sm:overflow-x-hidden sm:overflow-y-auto/,
  'Mobile thumbnails scroll horizontally and the desktop rail remains bounded with vertical scrolling');
assert.match(noVideoHtml, /flex w-max gap-2 sm:w-full sm:flex-col/, 'The mobile thumbnail track has a scrollable intrinsic width and stacks vertically from sm');
assert.match(noVideoHtml, /aspect-square w-16[^\"]*sm:w-full/, 'Mobile thumbnails have a fixed touch-friendly width');
assert.ok(noVideoHtml.indexOf('aria-label="Enlarge photo of Cashew W320 on this page"') < noVideoHtml.indexOf('aria-label="Choose a product photo"'),
  'The main image precedes thumbnails in mobile reading order');
assert.doesNotMatch(noVideoHtml, /grid-cols-\[3\.25rem_minmax\(0,1fr\)\]/, 'The old mobile left rail does not return');
assert.doesNotMatch(noVideoHtml, /grid grid-cols-4/, 'The old bottom thumbnail grid is removed');
const manyImagesHtml = renderToStaticMarkup(React.createElement(ProductMediaGallery, {
  name: 'Cashew W320', images: Array.from({ length: 12 }, (_, index) => `products/abc/photo-${index}.jpg`), video: null,
}));
assert.equal((manyImagesHtml.match(/aria-label="Show photo /g) ?? []).length, 12, 'Every photo remains available inside the bounded rail');
assert.match(manyImagesHtml, /sm:absolute sm:inset-0 sm:overflow-x-hidden sm:overflow-y-auto/, 'A large photo set never extends the desktop rail beyond the main image');
const singleImageHtml = renderToStaticMarkup(React.createElement(ProductMediaGallery, {
  name: 'Cashew W320', images: ['products/abc/cover.jpg'], video: null,
}));
assert.doesNotMatch(singleImageHtml, /Choose a product photo/, 'A single image does not leave an empty thumbnail rail');
const gallerySource = readFileSync(new URL('../components/product-media-gallery.tsx', import.meta.url), 'utf8');
assert.match(gallerySource, /createPortal\(/);
assert.match(gallerySource, /event\.key === "Escape"/);
assert.match(gallerySource, /event\.key === "ArrowRight"/);
assert.match(gallerySource, /setZoomPoint/);
assert.match(gallerySource, /onTouchStart=\{onTouchStart\}/, 'The main image listens for touch gestures');
assert.match(gallerySource, /onTouchEnd=\{onTouchEnd\}/, 'The main image completes touch gestures');
assert.match(gallerySource, /touch-pan-y/, 'Vertical touch gestures still scroll the page');
assert.match(gallerySource, /suppressClick\.current/, 'A completed swipe does not accidentally open the lightbox');
const managerSource = readFileSync(new URL('../components/media-manager.tsx', import.meta.url), 'utf8');
assert.match(managerSource, /function MediaImageLightbox/, 'Staff images have an inline preview dialog');
assert.match(managerSource, /fileUrl && \(canPreview \? \(/, 'Image actions open the inline preview instead of forcing a new tab');
assert.match(managerSource, /aria-label=\{`Xem \$\{previewName\} ngay trên trang`\}/, 'The thumbnail itself is an accessible preview trigger');
assert.match(managerSource, /createPortal\(/);
assert.match(managerSource, /event\.key === "Escape"/, 'Escape closes the staff image preview');
assert.match(managerSource, /previousFocus\?\.focus\(\)/, 'Closing the preview restores keyboard focus');
const migration = readFileSync(new URL('../supabase/migrations/20261017_product_featured_image.sql', import.meta.url), 'utf8');
assert.match(migration, /featured_media_id uuid/);
console.log('✅ Product media: staff-only cover, safe public image/video projection, inline zoom/lightbox and gallery slots.');
