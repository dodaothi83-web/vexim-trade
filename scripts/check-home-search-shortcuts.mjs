import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../app/(public)/home.tsx', import.meta.url), 'utf8');
for (const text of [
  'Xem rõ từng hạng mục đã kiểm tra',
  'So sánh chi tiết từng sản phẩm',
  'Giữ kín thông tin đến khi bạn đồng ý kết nối',
  'Gửi yêu cầu báo giá miễn phí',
  'See which supplier checks are complete',
  'Compare product details',
  'Your contact details stay private until you agree to connect',
  'Send quote requests free of charge',
]) assert.ok(!home.includes(text), `Removed hero benefit: ${text}`);
const nav = home.slice(home.indexOf('{homeCategories.length > 0 && <nav'), home.indexOf('</nav>', home.indexOf('{homeCategories.length > 0 && <nav')));
assert.match(nav, /"Tìm nhiều:" : "Popular searches:"/);
assert.match(nav, /homeCategories\.slice\(0, 5\)\.map/);
assert.match(nav, /encodeURIComponent\(category\.slug\)/);
assert.match(nav, /&lang=\$\{lang\}/);
assert.match(nav, /getCategoryTitle\(category, lang\)/);
assert.match(nav, /sm:flex-wrap/, 'Desktop chips wrap');
assert.match(nav, /overflow-x-auto/, 'Mobile chips scroll sideways instead of wrapping');
assert.match(nav, /whitespace-nowrap/, 'A chip label never breaks across lines');
assert.match(nav, /text-\[13px\]/, 'Mobile chips use 13px text');
assert.match(nav, /sm:min-h-11/, 'Desktop chips keep the 44px target');
assert.match(nav, /rounded-full/);
assert.match(home, /activeCategories\.filter\(\(c\) => c\.public_page_ready\)/);
assert.ok(home.indexOf('</form>') < home.indexOf('{homeCategories.length > 0 && <nav'));
console.log('✅ Homepage search shortcuts: old benefits removed, localized published-category chips, safe search links and a compact sideways-scrolling mobile row.');
