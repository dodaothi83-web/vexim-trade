import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of ['app/(public)/home.tsx', 'app/(public)/search/page.tsx']) {
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
  assert.match(form, /h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-700/, `${file}: inset navy search button with 44px target`);
  assert.match(form, /sr-only sm:not-sr-only/, `${file}: mobile icon control keeps accessible text`);
  assert.match(form, /sm:grid/, `${file}: desktop grid retained`);
  if (file.endsWith('home.tsx')) assert.ok(form.indexOf('name="cat"') < form.indexOf('name="q"'));
  else assert.match(form, /order-first.*sm:order-none/, `${file}: category first on mobile only`);
}
console.log('✅ Mobile search controls: single rounded row, category/query/submit order, accessible icon controls, desktop layout preserved.');
