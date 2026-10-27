#!/usr/bin/env node
// node scripts/check-navigation-priority.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sidebar = read('components/sidebar.tsx');
const nav = sidebar.split('const NAV:')[1]?.split('const NAV_GROUPS')[0];
assert.ok(nav, 'CRM navigation exists');
const hrefs = [...nav.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(hrefs, [
  '/crm/dashboard', '/crm/suppliers', '/crm/products', '/crm/rfqs',
  '/crm/verifications', '/crm/verifications/submissions', '/crm/categories', '/crm/sponsored', '/crm/traffic', '/crm/posts',
  '/crm/buyers', '/crm/mail', '/crm/prospects', '/crm/team', '/crm/settings',
], 'Daily marketplace work comes first; self-submission queue sits with verifications; sale and settings are secondary');
assert.match(sidebar, /href: "\/crm\/categories", label: "Danh mục sản phẩm"/, 'Category menu uses product-focused wording');
assert.match(sidebar, /perm: "rfq\.view"/, 'RFQ remains permission-gated');
assert.match(sidebar, /hasPermission\(session\.role, item\.perm\)/, 'Implied view permissions remain visible');
assert.match(sidebar, /pathname === "\/crm\/pipeline" \? "\/crm\/buyers"/, 'Pipeline highlights Buyer');
assert.match(sidebar, /pathname === "\/crm\/templates" \? "\/crm\/settings"/, 'Templates highlights Settings');

for (const [path, entry] of [
  ['app/crm/mail/compose/page.tsx', 'components/mail-threads.tsx'],
  ['app/crm/pipeline/page.tsx', 'app/crm/buyers/page.tsx'],
  ['app/crm/templates/page.tsx', 'app/crm/settings/page.tsx'],
  ['app/crm/settings/users/page.tsx', 'app/crm/settings/page.tsx'],
]) {
  assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${path} remains available`);
  assert.ok(read(entry).includes(`href="/${path.replace(/^app\//, '').replace(/\/page\.tsx$/, '')}"`) ||
    (path.includes('mail/compose') && read(entry).includes('href="/crm/mail/compose"')),
  `${entry} links to ${path}`);
}
const settings = read('app/crm/settings/page.tsx');
assert.match(settings, /hasPermission\(session\.role, "templates\.manage"\)/, 'Templates entry is hidden from unauthorized roles');
// Cổng NCC dùng chung menu trái với CRM; thêm sản phẩm vẫn là nút hành động, không phải mục menu.
const supplierNav = read('components/supplier-sidebar.tsx');
assert.doesNotMatch(supplierNav, /href="\/supplier\/portal\/products\/new"/, 'Add product is an action, not a tab');
assert.match(supplierNav, /pathname\.startsWith\(`\$\{href\}\/`\)/, 'Product section stays selected on nested pages');
assert.match(read('app/supplier/portal/products/product-storefront.tsx'), /href="\/supplier\/portal\/products\/new"/, 'Supplier can still add a product');
console.log('✅ Navigation prioritizes marketplace workflows; secondary routes remain accessible and gated.');
