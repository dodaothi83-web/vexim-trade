import assert from 'node:assert/strict';
import fs from 'node:fs';

// app/(public)/search/page.tsx used to render its own copy of this search form, duplicating
// the header search bar that now appears on every non-home page. The in-page copy was removed
// so only one search control shows on /search; this check is scoped to the home page hero
// search form, which still uses the rounded single-row layout checked below.
for (const file of ['app/(public)/home.tsx']) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('<form action="/search"');
  const form = source.slice(start, source.indexOf('</form>', start));
  assert.ok(start >= 0);
  assert.match(form, /rounded-full border/, `${file}: rounded shared search container`);
  assert.match(form, /flex items-center/, `${file}: one mobile row`);
  assert.doesNotMatch(form, /grid-cols-1/, `${file}: no mobile stacking`);
  assert.match(form, /SlidersHorizontal/, `${file}: category filter icon`);
  assert.match(form, /name="cat"/, `${file}: preserve category submission`);
  assert.match(form, /name="q"/, `${file}: preserve query submission`);
  assert.match(form, /name="lang"/, `${file}: preserve language`);
  assert.match(form, /min-w-0 flex-1|flex-1 bg-white/, `${file}: query can shrink on narrow screens`);
  assert.match(form, /h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-brand-700 px-3/, `${file}: inset navy text search button with 44px height`);
  assert.match(form, /<span>\{isVi \? "Tìm kiếm" : "Search"\}<\/span>/, `${file}: search text is visible on mobile`);
  assert.match(form, /<Search className="hidden h-4 w-4 sm:block"/, `${file}: magnifying glass is desktop-only`);
  assert.match(form, /sm:grid/, `${file}: desktop grid retained`);
  if (file.endsWith('home.tsx')) assert.ok(form.indexOf('name="cat"') < form.indexOf('name="q"'));
  else assert.match(form, /order-first.*sm:order-none/, `${file}: category first on mobile only`);
}
console.log('✅ Mobile search controls: single rounded row, category/query/submit order, accessible icon controls, desktop layout preserved.');
