// Run: node --experimental-strip-types --no-warnings scripts/check-category-slug-rename.mjs
// Đổi slug danh mục trong CRM không được làm sản phẩm biến mất, mất link cũ hay mất tên tiếng Việt
// (sự cố 2026-11-22: ready-to-drink-coffee-tea → ready-to-drink-coffee).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  keepCategoryTranslations,
  previousSlugsAfterRename,
  slugReservedByOtherCategory,
} from '../lib/categories/slug-rename.ts';

// 1. Bản dịch tiếng Việt giữ nguyên khi form chỉ gửi tiếng Anh không đổi.
const existing = {
  name_i18n: { en: 'Ready-to-drink coffee', vi: 'Cà phê pha sẵn' },
  intro_i18n: { en: 'Intro', vi: 'Giới thiệu' },
  h1_i18n: { en: 'H1' },
  body_i18n: null,
  seo_title_i18n: { en: 'Old title', vi: 'Tiêu đề cũ' },
  seo_desc_i18n: { en: 'Desc', vi: '' },
  homepage_kicker_i18n: null,
  hero_alt_i18n: null,
};
const kept = keepCategoryTranslations(existing, {
  name_i18n: { en: ' Ready-to-drink coffee ' },
  intro_i18n: { en: 'Intro' },
  h1_i18n: { en: 'H1' },
  seo_title_i18n: { en: 'New title' },
  seo_desc_i18n: { en: 'Desc' },
});
assert.deepEqual(kept.name_i18n, { vi: 'Cà phê pha sẵn', en: ' Ready-to-drink coffee ' });
assert.deepEqual(kept.intro_i18n, { vi: 'Giới thiệu', en: 'Intro' });
assert.equal('seo_title_i18n' in kept, false, 'tiếng Anh đổi → bản dịch cũ lỗi thời, không giữ');
assert.equal('h1_i18n' in kept, false, 'không có bản dịch → không cần ghi đè');
assert.equal('seo_desc_i18n' in kept, false, 'bản dịch rỗng không giữ');
assert.deepEqual(keepCategoryTranslations(existing, {}), {}, 'trường không gửi lên → không đụng');

// 2. Slug cũ được giữ để 301, không trùng lặp, bỏ slug đang quay về.
assert.deepEqual(previousSlugsAfterRename({ slug: 'a', previous_slugs: null }, 'b'), ['a']);
assert.deepEqual(previousSlugsAfterRename({ slug: 'b', previous_slugs: ['a'] }, 'c'), ['a', 'b']);
assert.deepEqual(previousSlugsAfterRename({ slug: 'b', previous_slugs: ['a', 'b'] }, 'a'), ['b']);

// 3. Không lấy slug là đường dẫn cũ (đang chuyển tiếp) của danh mục khác.
const cats = [
  { id: '1', slug: 'coffee', previous_slugs: ['coffee-beans'], name_i18n: { en: 'Coffee' } },
  { id: '2', slug: 'tea', previous_slugs: [], name_i18n: { en: 'Tea' } },
];
assert.equal(slugReservedByOtherCategory(cats, '2', 'coffee-beans')?.id, '1');
assert.equal(slugReservedByOtherCategory(cats, '1', 'coffee-beans'), null, 'danh mục được quay về slug cũ của chính nó');
assert.equal(slugReservedByOtherCategory(cats, '2', 'green-tea'), null);

// 4. Action CRM nối đủ các bước.
const actions = readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
const start = actions.indexOf('export async function updateCategoryAction');
const action = actions.slice(start, actions.indexOf('\nexport async function', start + 10));
assert.match(action, /slugReservedByOtherCategory\(/);
assert.match(action, /keepCategoryTranslations\(existing/);
assert.match(action, /previous_slugs: previousSlugsAfterRename\(existing, input\.slug\)/);
assert.match(action, /store\.followCategorySlug\(existing\.slug, updated\.slug\)/);
assert.match(action, /category\.slug_followed/);
assert.match(action, /updateCategory\(id, \{ slug: existing\.slug/, 'không chuyển được sản phẩm → trả lại slug cũ');

// 5. Store: Supabase gọi hàm SQL, hàm SQL không đặt lại ngày cập nhật và chỉ service_role được gọi.
const supabase = readFileSync(new URL('../lib/db/supabase.ts', import.meta.url), 'utf8');
assert.match(supabase, /rpc\("follow_category_slug", \{ p_old: oldSlug, p_new: newSlug \}\)/);
const local = readFileSync(new URL('../lib/db/local.ts', import.meta.url), 'utf8');
assert.match(local, /async followCategorySlug\(oldSlug, newSlug\)/);
const migration = readFileSync(new URL('../supabase/migrations/20261225_follow_category_slug.sql', import.meta.url), 'utf8');
for (const col of ['category', 'reviewed_category_slug', 'supplier_category_proposal']) {
  assert.match(migration, new RegExp(`${col} = case when ${col} = p_old then p_new`));
}
assert.match(migration, /disable trigger supplier_products_touch/);
assert.match(migration, /enable trigger supplier_products_touch/);
assert.match(migration, /revoke all on function public\.follow_category_slug\(text, text\) from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.follow_category_slug\(text, text\) to service_role/);
assert.match(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'), /function public\.follow_category_slug/);

console.log('✅ Đổi slug danh mục: giữ link cũ, giữ tên tiếng Việt, sản phẩm đi theo slug mới.');
