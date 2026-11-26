// node scripts/check-crm-product-list.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CRM_PRODUCTS_PAGE_SIZE,
  crmPriceSummary,
  orderCrmProducts,
  safeCrmProductsBack,
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
const revisionPending = { id: 'pending-revision', name: 'Zulu', supplier_review_status: 'approved', pendingReview: true };
assert.equal(orderCrmProducts([{ id: 'approved', name: 'Alpha', supplier_review_status: 'approved' }, revisionPending])[0].id,
  'pending-revision', 'An approved product with a pending new form or old revision is prioritized before ordinary products');

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

// Tóm tắt giá trong danh sách: số đầy đủ, khoảng giá, điều kiện giao, MOQ, hạn giá.
const base = { ref_price: null, ref_price_max: null, currency: 'USD', unit: 'MT', incoterm: null, incoterm_place: null,
  export_port: null, moq: null, moq_qty: null, moq_unit: null, price_valid_until: null };
const full = crmPriceSummary({ ...base, ref_price: 1450, ref_price_max: 1600, incoterm: 'fob', incoterm_place: 'Cát Lái',
  moq_qty: 1, moq_unit: 'MT', price_valid_until: '2026-12-31' }, '2026-11-26');
assert.equal(full.price, '$1,450 – 1,600 / MT', 'Full figures, never abbreviated as 1.5K');
assert.equal(full.terms, 'FOB Cát Lái · MOQ 1 MT');
assert.equal(full.validUntil, 'Đến 31/12/2026');
assert.equal(full.expired, false);
assert.equal(full.missingValidity, false);
const expired = crmPriceSummary({ ...base, ref_price: 1500, incoterm: 'CIF', export_port: 'Hải Phòng', moq: '1 container',
  price_valid_until: '2026-11-01' }, '2026-11-26');
assert.equal(expired.price, '$1,500 / MT');
assert.equal(expired.terms, 'CIF Hải Phòng · MOQ 1 container', 'Shows the one incoterm the supplier declared, port as fallback place');
assert.equal(expired.expired, true);
assert.equal(crmPriceSummary({ ...base, ref_price: 2.75, unit: 'kg' }, '2026-11-26').missingValidity, true);
assert.equal(crmPriceSummary({ ...base, ref_price: 60000, currency: 'VND', unit: 'kg' }, '2026-11-26').price, '60,000 VND / kg');
assert.equal(crmPriceSummary({ ...base, ref_price: 1500, ref_price_max: 1500 }, '2026-11-26').price, '$1,500 / MT', 'Equal range is one price');
const none = crmPriceSummary(base, '2026-11-26');
assert.equal(none.price, null);
assert.equal(none.terms, null);
assert.equal(none.expired, false);
assert.equal(none.missingValidity, false);

// Đường quay lại danh sách chỉ nhận trang sản phẩm CRM.
assert.equal(safeCrmProductsBack('/crm/products?view=pending&page=2'), '/crm/products?view=pending&page=2');
assert.equal(safeCrmProductsBack('/crm/products'), '/crm/products');
for (const bad of ['https://evil.example', '//evil.example', '/crm/products/../x', '/crm/suppliers', '/crm/productsX', '', null])
  assert.equal(safeCrmProductsBack(bad), '/crm/products', `Rejects ${bad}`);

assert.ok(page.includes('crmPriceSummary(r, today)') && page.includes('productPriceBlockers(r, r.supplier)'),
  'List shows the price summary; public price visibility uses the same gate as the public pages');
assert.ok(page.includes('Giá hết hạn') && page.includes('Chưa khai hạn giá') && !page.includes('formatMoney('),
  'Expired or missing price validity is visible and prices are not abbreviated');
assert.ok(page.includes('edit?back=${encodeURIComponent(listHref)}'), 'Review links carry the current filters, tab and page');

const edit = readFileSync(new URL('../app/crm/products/[slug]/edit/page.tsx', import.meta.url), 'utf8');
assert.ok(edit.includes('safeCrmProductsBack(') && edit.includes('Kiểm tra sản phẩm tiếp theo') &&
  edit.includes('Xem trang công khai') && edit.includes('Về danh sách'), 'Published panel offers next, public page and back to list');
assert.ok(edit.includes('justPublished && productReviewApproved(product) && product.ready_for_buyer'),
  'The panel only appears for a product that is really approved and live');
assert.ok(edit.includes('orderCrmProducts(pending)') && edit.includes('supplierOwnerScope(session)'),
  'Next product follows the list priority and the staff member\'s supplier scope');
const controls = readFileSync(new URL('../app/crm/products/[slug]/edit/review-controls.tsx', import.meta.url), 'utf8');
assert.ok(controls.includes('params.set("published", "1")') && !controls.includes('router.push("/crm/products'),
  'After approval staff stay on the product page instead of being sent back to the list');

console.log('✅ CRM products: pending review first, deterministic ordering and 15-product pages with filter-safe navigation; price summary and post-publish navigation.');
