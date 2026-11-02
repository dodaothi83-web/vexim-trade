// node --experimental-strip-types scripts/check-rfq-migration.mjs
//
// Bảo vệ hai lỗi từng xảy ra nhưng không ai thấy cho tới khi chạy migration:
//   1. File .sql bị dán vào dưới dạng chuỗi đã escape (\n, \") nên cả file thành MỘT dòng
//      và Postgres coi toàn bộ là comment — migration "chạy thành công" mà không tạo gì.
//   2. Mã RFQ sinh từ hai múi giờ khác nhau (ngày UTC cho tiền tố, ngày máy chủ cho số
//      thứ tự) nên trong khung 00:00–07:00 giờ Việt Nam số thứ tự quay lại đè mã đã dùng.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'supabase', 'migrations');

let checked = 0;
for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const raw = readFileSync(path.join(dir, name), 'utf8');
  const newlines = (raw.match(/\n/g) ?? []).length;
  assert.ok(newlines > 0, `${name}: không có dòng thật nào — file bị escape thành một dòng, Postgres chỉ thấy comment`);
  const escaped = (raw.match(/\\n/g) ?? []).length;
  assert.ok(escaped <= 5, `${name}: có ${escaped} chuỗi "\\n" literal — file bị escape, Postgres sẽ chỉ đọc được dòng comment đầu`);
  assert.ok(!raw.includes('\\"'), `${name}: còn dấu nháy bị escape ("\\"") — SQL sẽ sai cú pháp`);
  checked += 1;
}

const { generateRfqCode, rfqDayKey } = await import('../lib/rfq/index.ts');
// 17:30 UTC ngày 16/10 = 00:30 ngày 17/10 giờ Hà Nội: tiền tố và số thứ tự phải cùng ngày 17.
const hanoi = new Date('2026-10-16T17:30:00Z');
assert.equal(rfqDayKey(hanoi), '20261017', 'Khoá ngày RFQ tính theo giờ Hà Nội');
assert.equal(generateRfqCode(1, rfqDayKey(hanoi)), 'RFQ-20261017-00001');
const utcDay = new Date('2026-10-17T16:30:00Z'); // 23:30 giờ Hà Nội, vẫn ngày 17
assert.equal(rfqDayKey(utcDay), '20261017', 'Không cắt ngày theo UTC');
assert.equal(generateRfqCode(7), generateRfqCode(7, rfqDayKey()), 'Mặc định dùng cùng múi giờ');

console.log(`✅ RFQ migration/mã đơn: ${checked} migration còn nguyên định dạng, mã RFQ dùng một múi giờ duy nhất.`);
