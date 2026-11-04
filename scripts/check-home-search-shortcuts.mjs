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
assert.match(nav, /flex-wrap/);
assert.match(nav, /min-h-11/);
assert.match(nav, /rounded-full/);
assert.match(home, /activeCategories\.filter\(\(c\) => c\.public_page_ready\)/);
assert.ok(home.indexOf('</form>') < home.indexOf('{homeCategories.length > 0 && <nav'));
console.log('✅ Homepage search shortcuts: old benefits removed, localized published-category chips, safe search links and mobile wrapping.');
