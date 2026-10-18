// node --experimental-strip-types --no-warnings scripts/check-supplier-image-processing.mjs
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { prepareSupplierProductImage } from '../lib/media/prepare-supplier-product-image.ts';

const original = await sharp({ create: { width: 2400, height: 1800, channels: 4,
  background: { r: 40, g: 120, b: 180, alpha: 0.6 } } }).png().toBuffer();
const result = await prepareSupplierProductImage(original);
const large = await sharp(result.main).metadata();
const thumb = await sharp(result.thumb).metadata();
assert.equal(large.format, 'webp'); assert.equal(thumb.format, 'webp');
assert.equal(large.width, 1600); assert.equal(large.height, 1200);
assert.equal(thumb.width, 640); assert.equal(thumb.height, 480);
assert.equal(result.width, large.width); assert.equal(result.height, large.height);
assert.equal(large.exif, undefined, 'Do not store source EXIF/GPS metadata');
assert.equal(large.hasAlpha, true, 'Keep transparency in product packshots');
assert.ok(result.main.length < original.length, 'Large source image becomes a smaller web-ready asset');
assert.ok(result.thumb.length < result.main.length, 'Cards use the smaller derivative');
const tiny = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#fff' } }).jpeg().toBuffer();
const tinyResult = await prepareSupplierProductImage(tiny);
assert.equal((await sharp(tinyResult.main).metadata()).width, 80, 'Never upscale small photos');
await assert.rejects(() => prepareSupplierProductImage(new Uint8Array([255, 216, 255, 224, 1])),
  'Corrupt image data must not be stored');
console.log('✅ Supplier product photos: server-side resize, WebP thumbnail, EXIF stripping and corrupt-file rejection.');
