// Regression: upload UIs must show useful errors even when Vercel returns empty/HTML.
// Run: node --experimental-strip-types --no-warnings scripts/check-cms-upload.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readUploadResponse } from '../lib/media/upload-response.ts';

assert.deepEqual(await readUploadResponse(new Response(JSON.stringify({ ok: true, path: 'suppliers/1/profile.jpg' }), { status: 200 })),
  { ok: true, path: 'suppliers/1/profile.jpg' });
assert.deepEqual(await readUploadResponse(new Response(JSON.stringify({ ok: false, message: 'Column missing' }), { status: 500 })),
  { ok: false, message: 'Column missing' });
await assert.rejects(readUploadResponse(new Response('', { status: 413 })), /HTTP 413/);
await assert.rejects(readUploadResponse(new Response('<html>error</html>', { status: 500 })), /HTTP 500/);
await assert.rejects(readUploadResponse(new Response('', { status: 403 })), /HTTP 403/);
await assert.rejects(readUploadResponse(new Response('', { status: 200 })), /không trả về dữ liệu upload hợp lệ/);

const sql = readFileSync(new URL('../supabase/migrations/20261017_cms_supplier_images.sql', import.meta.url), 'utf8');
for (const column of [
  'active_on_homepage', 'hero_image', 'hero_alt_i18n', 'homepage_kicker_i18n',
  'h1_i18n', 'body_i18n', 'spec_columns', 'spec_rows', 'buying_facts',
  'filters', 'status', 'seo_indexable', 'previous_slugs', 'created_by', 'updated_by',
  'profile_image', 'cover_image',
]) assert.ok(sql.includes(`add column if not exists ${column}`), `Migration missing ${column}`);
assert.ok(sql.includes("notify pgrst, 'reload schema'"));
assert.ok(!sql.includes('add column if not exists public_page_ready'), 'public_page_ready must stay computed');
console.log('✅ CMS upload responses and Supabase migration fields covered.');
