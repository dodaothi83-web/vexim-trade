// node --experimental-strip-types scripts/check-shipment-months.mjs
//
// Ô "Shipment month" từng là <input type="month">: trình duyệt hiện placeholder theo ngôn
// ngữ của máy người dùng nên máy tiếng Việt ra "---- năm ----" giữa form tiếng Anh. Kiểm
// này giữ danh sách tháng do server dựng: nhãn tiếng Anh, giá trị đúng YYYY-MM.
import assert from 'node:assert/strict';

const { buildShipmentMonths, SHIPMENT_MONTH_COUNT } = await import('../lib/public/shipment-months.ts');

const months = buildShipmentMonths(new Date(Date.UTC(2026, 10, 3))); // 3 Nov 2026
assert.equal(months.length, SHIPMENT_MONTH_COUNT);
assert.deepEqual(months[0], { value: '2026-11', label: 'Nov 2026' });
assert.deepEqual(months[1], { value: '2026-12', label: 'Dec 2026' });
assert.deepEqual(months[2], { value: '2027-01', label: 'Jan 2027' }, 'Qua năm mới thì tăng năm');
assert.deepEqual(months.at(-1), { value: '2028-10', label: 'Oct 2028' });

for (const month of months) {
  assert.match(month.value, /^\d{4}-(0[1-9]|1[0-2])$/, 'Giá trị đúng định dạng YYYY-MM mà server kiểm');
  assert.match(month.label, /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/, 'Nhãn luôn là tiếng Anh');
  assert.doesNotMatch(month.label, /năm|tháng/i, 'Không lọt chữ tiếng Việt');
}

const december = buildShipmentMonths(new Date(Date.UTC(2026, 11, 31)));
assert.deepEqual(december[0], { value: '2026-12', label: 'Dec 2026' });
assert.deepEqual(december[1], { value: '2027-01', label: 'Jan 2027' });

console.log('✅ Shipment month: ô chọn tiếng Anh do server dựng, giá trị YYYY-MM đúng định dạng.');
