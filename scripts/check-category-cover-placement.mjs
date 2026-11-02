import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/(public)/products/[slug]/page.tsx', import.meta.url), 'utf8');
const catalog = source.slice(source.indexOf('function StateA'), source.indexOf('function CategoryContentSections'));
const empty = source.slice(source.indexOf('function StateB'));
assert.ok(catalog.includes('<CategoryProductGrid'), 'Product catalog remains available');
assert.ok(!catalog.includes('<Image src={cat.hero_image}'), 'No duplicate cover banner below product catalog');
assert.ok(!catalog.includes('Category overview image'), 'No decorative cover caption in catalog');
assert.ok(empty.includes('<Image src={cat.hero_image}'), 'Empty category retains its introductory image');
assert.ok(source.includes('const heroImage = cat.hero_image ||'), 'Category cover still supplies social metadata');
console.log('OK: catalog banner removed; cover retained for empty category and social metadata.');
