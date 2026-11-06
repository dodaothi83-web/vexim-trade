// node --experimental-strip-types --no-warnings scripts/check-spec-template.mjs
// Ô Quy cách / tiêu chuẩn có mẫu theo ngành hàng: khớp đúng danh mục, đủ hai ngôn ngữ,
// bản tiếng Anh không lẫn tiếng Việt, và nút chèn mẫu có trong trình soạn của nhà cung cấp.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { specTemplateFor, specTemplateText, stripEmptySpecLines } from '../lib/products/spec-template.ts';

assert.match(specTemplateFor('cashew-kernels', 'vi').fields[0], /W320/);
assert.match(specTemplateFor('pepper', 'en').fields[0], /g\/l/);
assert.match(specTemplateFor('coffee', 'vi').fields.join(' '), /TCVN 4193/);
assert.match(specTemplateFor('cinnamon-star-anise', 'vi').fields[0], /ống/, 'Quế hồi khớp mẫu quế trước');
assert.match(specTemplateFor('star-anise', 'en').fields[0], /whole/);
assert.match(specTemplateFor('honey', 'vi').fields[0], /Grade \/ kích cỡ/, 'Ngành khác dùng mẫu chung');
assert.match(specTemplateFor(null, 'en').fields[0], /Grade \/ size/);
for (const slug of ['cashew', 'pepper', 'coffee', 'rice', 'cinnamon', 'star-anise', 'honey']) {
  const en = specTemplateFor(slug, 'en'); const vi = specTemplateFor(slug, 'vi');
  assert.equal(en.fields.length, vi.fields.length, `${slug}: hai ngôn ngữ cùng số mục`);
  assert.doesNotMatch(en.fields.join(' ') + en.example, /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i, `${slug}: bản tiếng Anh không lẫn tiếng Việt`);
  assert.ok(vi.example.split('\n').length >= 5, `${slug}: ví dụ đủ dòng`);
}
assert.equal(specTemplateText({ fields: ['A', 'B'], example: '' }), 'A: \nB: ');
assert.equal(stripEmptySpecLines('Grade: W320\nĐộ ẩm tối đa: \nMàu sắc:\nĐóng gói: thùng 22,68 kg'), 'Grade: W320\nĐóng gói: thùng 22,68 kg', 'Bỏ dòng mẫu chưa điền khi lưu');
assert.equal(stripEmptySpecLines('Độ ẩm: 5%'), 'Độ ẩm: 5%');
assert.equal(stripEmptySpecLines('Grade: \nMàu: '), '', 'Chỉ có mẫu trống thì coi như chưa nhập');
assert.match(fs.readFileSync(new URL('../app/supplier/portal/product-actions.ts', import.meta.url), 'utf8'), /spec: stripEmptySpecLines\(/);
const editor = fs.readFileSync(new URL('../app/supplier/portal/products/product-editor.tsx', import.meta.url), 'utf8');
assert.match(editor, /placeholder=\{specTemplateFor\(/, 'Chữ mờ là ví dụ theo ngành hàng');
assert.match(editor, /copy\.spec\.specUseTemplate/, 'Có nút Dùng mẫu gợi ý');
assert.match(editor, /!current\.toLowerCase\(\)\.includes\(field\.toLowerCase\(\)\)/, 'Không chèn lại mục đã có');
console.log('✅ Mẫu quy cách theo ngành hàng: khớp danh mục, hai ngôn ngữ, nút chèn mẫu trong trình soạn.');
