// node scripts/check-crm-product-list.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CRM_PRODUCTS_PAGE_SIZE,
  orderCrmProducts,
  paginateCrmProducts,
} from '../lib/crm/product-list.ts';

const rows = [
  { id: 'approved-high', name: 'Alpha', supplier_review_status: 'approved' },
  { id: 'pending-low', name: 'Zulu', supplier_review_status: 'pending' },
  { id: 'changes', name: 'Bravo', supplier_review_status: 'changes_requested' },
  { id: 'pending-high', name: 'Yankee', supplier_review_status: 'pending' },
  { id: 'approved-low', name: 'Charlie', supplier_review_status: 'approved' },
];
const originalOrder = rows.map((row) => row.id);
const scores = { 'approved-high': 100, 'pending-low': 1, changes: 60, 'pending-high': 90, 'approved-low': 80 };
const ordered = orderCrmProducts(rows, (row) => scores[row.id] ?? 0);
assert.deepEqual(rows.map((row) => row.id), originalOrder, 'Sorting does not mutate the source list');
assert.deepEqual(ordered.map((row) => row.id), ['pending-high', 'pending-low', 'approved-high', 'approved-low', 'changes'],
  'Pending review outranks relevance; relevance still orders products within each review group');
assert.deepEqual(orderCrmProducts(rows).slice(0, 2).map((row) => row.id), ['pending-high', 'pending-low'],
  'Pending products use their names as a deterministic order when there is no RFQ relevance');

const many = Array.from({ length: 32 }, (_, index) => ({ id: `p-${index}`, name: `Product ${index}` }));
const first = paginateCrmProducts(many, 1);
assert.equal(CRM_PRODUCTS_PAGE_SIZE, 15);
assert.equal(first.visibleRows.length, 15);
assert.equal(first.pageCount, 3);
assert.equal(first.firstRow, 1);
assert.equal(first.lastRow, 15);
assert.equal(first.visibleRows[0].id, 'p-0');
const second = paginateCrmProducts(many, 2);
assert.equal(second.visibleRows.length, 15);
assert.equal(second.firstRow, 16);
assert.equal(second.visibleRows[0].id, 'p-15');
const last = paginateCrmProducts(many, 99);
assert.equal(last.currentPage, 3, 'An out-of-range page clamps to the last available page');
assert.equal(last.visibleRows.length, 2);
assert.equal(last.firstRow, 31);
assert.equal(last.lastRow, 32);
assert.equal(paginateCrmProducts(many, Number.NaN).currentPage, 1);
assert.equal(paginateCrmProducts(many, 0).currentPage, 1);
const empty = paginateCrmProducts([], 4);
assert.equal(empty.currentPage, 1);
assert.equal(empty.pageCount, 1);
assert.equal(empty.firstRow, 0);
assert.equal(empty.lastRow, 0);
assert.deepEqual(empty.visibleRows, []);

const page = readFileSync(new URL('../app/crm/products/page.tsx', import.meta.url), 'utf8');
assert.ok(page.indexOf('rows = orderCrmProducts') < page.indexOf('paginateCrmProducts(rows, requestedPage)'),
  'Global review priority is applied before slicing the requested page');
assert.ok(page.includes('{visibleRows.map((r) => {'), 'Only the current page is rendered');
assert.ok(page.includes('productsHref(view, currentPage - 1)') && page.includes('productsHref(view, currentPage + 1)'),
  'Previous and next links preserve the active filters and view');
assert.ok(!page.includes('name="page"'), 'Submitting a filter starts again at page one');
assert.ok(page.includes('Mỗi trang tối đa {CRM_PRODUCTS_PAGE_SIZE} sản phẩm'),
  'The page size is visible to staff');

console.log('✅ CRM products: pending review first, deterministic ordering and 15-product pages with filter-safe navigation.');
