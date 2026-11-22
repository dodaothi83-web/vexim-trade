// node --experimental-strip-types --no-warnings scripts/check-supplier-attribute-pool.mjs
//
// Thông số theo nhóm hàng: nhà cung cấp được tự thêm thông số còn thiếu (hoặc thêm lựa
// chọn mới), mục đó được lưu vào danh mục để nhà cung cấp khác dùng lại, nhưng không
// tham gia bộ lọc buyer và không tự lên trang buyer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  attributeKeyFromLabel, cleanSupplierAttributeText, effectiveFieldsFor, fieldsFor, mergeSupplierAttributePool,
  publicProductAttributes, sanitizeSupplierAttributePool, saveProductAttributes, supplierAttributePoolSignature, supplierFieldsFor,
} from '../lib/product-attributes.ts';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

/* 1. Nhãn tiếng Việt → khoá ổn định, không dấu. */
assert.equal(attributeKeyFromLabel('Độ ẩm'), 'do_am');
assert.equal(attributeKeyFromLabel('Tỷ lệ hạt vỡ'), 'ty_le_hat_vo');
assert.equal(attributeKeyFromLabel('Quy cách bao bì thực tế'), 'quy_cach_bao_bi_thuc_te');
assert.match(attributeKeyFromLabel('2 lớp túi'), /^[a-z][a-z0-9_]{0,31}$/);

/* 2. Nội dung rác bị chặn, không lọt vào danh mục dùng chung. */
assert.equal(cleanSupplierAttributeText('Độ ẩm'), 'Độ ẩm');
assert.equal(cleanSupplierAttributeText('a'), '', 'Quá ngắn');
assert.equal(cleanSupplierAttributeText('Gọi 0912 345 678 để đặt'), '');
assert.equal(cleanSupplierAttributeText('Xem vexim.com.vn'), '');
assert.equal(cleanSupplierAttributeText('mail a@b.com'), '');
assert.equal(cleanSupplierAttributeText('<script>x</script>'), '');

/* 3. Làm sạch + gộp pool: không tin client, không trùng, có giới hạn. */
const dirtyPool = [
  { key: 'do_am', label: 'Độ ẩm', type: 'text', options: [] },
  { key: 'do_am', label: 'Độ ẩm lần 2', type: 'text', options: [] },
  { key: 'bad', label: 'Zalo 0987 654 321', options: [] },
  { key: 'grade', label: 'Grade', options: ['W320 nửa hạt', 'W320 nửa hạt', 'gọi 0912 345 678'] },
  ...Array.from({ length: 20 }, (_, i) => ({ key: `extra_${i}`, label: `Thông số ${i}`, options: [] })),
];
const cleanPool = sanitizeSupplierAttributePool(dirtyPool);
assert.equal(cleanPool.length, 12, 'Pool giới hạn 12 thông số');
assert.equal(cleanPool[0].key, 'do_am');
assert.equal(cleanPool[0].supplier_added, true);
assert.deepEqual(cleanPool.find((f) => f.key === 'grade').options, ['W320 nửa hạt'], 'Bỏ lựa chọn trùng và lựa chọn chứa số điện thoại');
assert.ok(!cleanPool.some((f) => f.label.includes('Zalo')), 'Nhãn chứa số điện thoại bị loại');

const mergedPool = mergeSupplierAttributePool(
  [{ key: 'grade', label: 'Grade', options: ['W320 nửa hạt'] }],
  [{ key: 'grade', label: 'Grade', options: ['W240 nửa hạt'] }, { key: 'do_am', label: 'Độ ẩm' }],
);
assert.deepEqual(mergedPool.find((f) => f.key === 'grade').options, ['W320 nửa hạt', 'W240 nửa hạt'], 'Hai NCC thêm hai lựa chọn → cùng một danh sách');
assert.equal(mergedPool.length, 2);

assert.equal(supplierAttributePoolSignature(mergedPool),
  supplierAttributePoolSignature([...mergedPool].reverse().map((f) => ({ ...f }))), 'Dấu vân tay không phụ thuộc thứ tự');
assert.notEqual(supplierAttributePoolSignature(mergedPool), supplierAttributePoolSignature(cleanPool));

/* 4. Trường CMS + thông số NCC tự thêm: NCC thấy cả hai, buyer chỉ thấy trường CMS. */
const category = {
  product_fields: [
    { key: 'product_type', label: 'Product', type: 'select', options: ['Cassia whole', 'Star anise'], filterable: true },
    { key: 'moisture', label: 'Moisture', type: 'text', options: [] },
  ],
  supplier_product_fields: [
    { key: 'product_type', label: 'Product', type: 'select', options: ['Cassia powder hạt mịn'], supplier_added: true },
    { key: 'do_am', label: 'Độ ẩm thực tế', type: 'text', options: [], supplier_added: true },
  ],
};
assert.equal(fieldsFor(category).length, 2, 'Cấu hình CMS không bị thay đổi');
assert.equal(supplierFieldsFor(category).length, 2);
const effective = effectiveFieldsFor(category);
assert.deepEqual(effective.find((f) => f.key === 'product_type').options, ['Cassia whole', 'Star anise', 'Cassia powder hạt mịn']);
assert.equal(effective.find((f) => f.key === 'do_am').filterable, false, 'Thông số tự thêm không thành bộ lọc buyer');
assert.equal(effective.length, 3);

/* 5. Lưu được giá trị NCC tự nhập, vẫn chặn giá trị lạ. */
const saved = saveProductAttributes(category, { product_type: 'Cassia powder hạt mịn', do_am: '13,5%' }, { legacy: 'giữ' });
assert.deepEqual(saved, { legacy: 'giữ', product_type: 'Cassia powder hạt mịn', do_am: '13,5%' });
assert.throws(() => saveProductAttributes(category, { product_type: 'Loại không ai khai' }), /Product/);

/* 6. Trang buyer không tự nhận thông số NCC tự thêm. */
assert.deepEqual(publicProductAttributes(category, saved), {}, 'Giá trị chỉ có trong danh sách NCC tự thêm không lọt lên buyer');
assert.deepEqual(publicProductAttributes(category, { product_type: 'Star anise' }), { product_type: 'Star anise' });
assert.deepEqual(publicProductAttributes(category, { do_am: '13,5%' }), {}, 'Trường tự thêm không công bố cho buyer');

/* 7. Server action: đọc pool từ form, gộp, ghi vào danh mục, và lỗi ghi không làm hỏng việc lưu. */
const actions = read('../app/supplier/portal/product-actions.ts');
assert.match(actions, /attribute_pool/, 'Server đọc thông số NCC tự thêm từ form');
assert.match(actions, /mergeSupplierAttributePool\(savedPool, attributePoolFromForm\(form\)\)/);
assert.match(actions, /supplierAttributePoolSignature\(pool\) !== supplierAttributePoolSignature\(savedPool\)/,
  'Không ghi lại danh mục khi pool không đổi (JSONB đổi thứ tự khoá)');
assert.match(actions, /updateCategory\(category\.id, \{ supplier_product_fields: pool \}\)/);
assert.match(actions, /catch \(error\) \{\s*console\.warn\("\[supplier-product\] attribute pool", error\);/,
  'Thiếu migration cũng không làm hỏng lần lưu sản phẩm');
assert.match(actions, /saveProductAttributes\(\{ product_fields: category\?\.product_fields \?\? \[\], supplier_product_fields: pool \}/,
  'Lưu sản phẩm bằng danh sách trường đã gộp');

/* 8. Thành phần giao diện: mô tả đúng việc cần làm, có lối thêm thông số và giá trị. */
function load(file, mocks) {
  const mod = { exports: {} };
  const source = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, console, JSON,
    require: (id) => {
      if (!(id in mocks)) throw new Error(`${file}: unexpected import ${id}`);
      return mocks[id];
    },
  }, { filename: file });
  return mod.exports;
}

const { SupplierAttributeInputs } = load('../components/supplier-attribute-inputs.tsx', {
  react: React,
  'react/jsx-runtime': jsx,
  '@/lib/product-attribute-labels': await import('../lib/product-attribute-labels.ts'),
  '@/lib/i18n/format': await import('../lib/i18n/format.ts'),
  '@/lib/i18n/portal/product-editor': await import('../lib/i18n/portal/product-editor.ts'),
  '@/lib/product-attributes': {
    SUPPLIER_ATTRIBUTE_FIELD_LIMIT: 12, attributeKeyFromLabel, cleanSupplierAttributeText, mergeAttributeFields: (official, pool) =>
      effectiveFieldsFor({ product_fields: official, supplier_product_fields: pool }),
  },
});

const html = renderToStaticMarkup(React.createElement(SupplierAttributeInputs, {
  officialFields: category.product_fields,
  supplierFields: category.supplier_product_fields,
  values: { do_am: '13,5%' },
}));
// 2026-11-22: khối gọn, không khung/tiêu đề/ghi chú, không nút "Thêm" giá trị mới.
assert.doesNotMatch(html, /Thông số theo nhóm hàng|Không bắt buộc|nhà cung cấp có thể tự thêm|không tạo nhãn xác minh/,
  'Bỏ hết chữ xung quanh ô thông số');
assert.doesNotMatch(html, />Thêm<\/button>|Giá trị mới/, 'Không còn nút Thêm giá trị mới');
assert.doesNotMatch(html, /<section/, 'Không còn khung riêng');
assert.match(html, /name="attribute_pool"/, 'Pool cũ vẫn gửi kèm form để server không làm mất');
assert.match(html, /name="attribute:do_am"/, 'Thông số NCC đã thêm trước đây vẫn sửa được');
assert.match(html, /name="attribute:product_type"/);
assert.match(html, /value="13,5%"/);
assert.match(html, /Cassia powder hạt mịn/, 'Lựa chọn NCC khác đã thêm vẫn hiện trong danh sách chọn');

// Một thông số: nhãn "Phân loại sản phẩm", lựa chọn hiện tiếng Việt, giá trị gửi đi giữ nguyên.
const coffeeFields = [{ key: 'coffee_form', type: 'select', label: 'Product form', filterable: true,
  options: ['Green beans', 'Roasted beans', 'Ground coffee', 'Instant coffee'] }];
const coffeeHtml = renderToStaticMarkup(React.createElement(SupplierAttributeInputs, {
  officialFields: coffeeFields, supplierFields: [], values: { coffee_form: 'Roasted beans' },
}));
assert.match(coffeeHtml, /<label[^>]*for="attribute-coffee_form"[^>]*>Phân loại sản phẩm<\/label>/);
assert.doesNotMatch(coffeeHtml, /Product form/);
assert.match(coffeeHtml, /<option value="Green beans">Cà phê nhân \(chưa rang\)<\/option>/);
assert.match(coffeeHtml, /<option value="Roasted beans" selected="">Cà phê hạt rang<\/option>/);
assert.match(coffeeHtml, /<option value="Instant coffee">Cà phê hoà tan<\/option>/);
const coffeeEn = renderToStaticMarkup(React.createElement(SupplierAttributeInputs, {
  officialFields: coffeeFields, supplierFields: [], values: {}, lang: 'en',
  copy: { ...(await import('../lib/i18n/portal/product-editor.ts')).productEditorMessages.en.shared.attributes },
}));
assert.match(coffeeEn, />Product classification<\/label>/);
assert.match(coffeeEn, /<option value="Green beans">Green beans<\/option>/);

// Nhóm hàng chưa khai thông số: không hiện gì.
const noFieldHtml = renderToStaticMarkup(React.createElement(SupplierAttributeInputs, {
  officialFields: [], supplierFields: [], values: {},
}));
assert.equal(noFieldHtml, '', 'Danh mục chưa có thông số thì không hiện khối nào');

const component = read('../components/supplier-attribute-inputs.tsx');
assert.doesNotMatch(component, /function addOption\(|function addField\(/, 'Đã bỏ luồng tự thêm giá trị/thông số');
assert.match(component, /if \(!fields\.length\) return null;/, 'Không có thông số thì không render khối');

/* 9. Trang sản phẩm truyền cả trường CMS và thông số NCC khác đã thêm. */
const editor = read('../app/supplier/portal/products/product-editor.tsx');
assert.match(editor, /selectedCategory && \(officialAttributeFields\.length > 0 \|\| supplierAttributeFields\.length > 0\)/,
  'Danh mục chưa khai thông số thì không hiện khối trống ở bước 1');
assert.match(editor, /supplierFields=\{supplierAttributeFields\}/);
assert.match(editor, /officialFields=\{officialAttributeFields\}/);
assert.match(editor, /const officialAttributeFields = nonGradeProductFields\(fieldsFor\(activeCategory\)\)/);
assert.match(editor, /const supplierAttributeFields = nonGradeProductFields\(supplierFieldsFor\(activeCategory\)\)/);
// Ô phân loại nằm bên trái ô năng lực mỗi tháng, cùng một hàng (sm: 2 cột).
const specGrid = editor.slice(editor.indexOf('<SupplierAttributeInputs') - 600, editor.indexOf('name="monthly_capacity"'));
assert.match(specGrid, /grid border-t border-ink-100 sm:grid-cols-2/);
assert.ok(editor.indexOf('<SupplierAttributeInputs') < editor.indexOf('name="monthly_capacity"'), 'Phân loại đứng trước (bên trái) năng lực');
assert.doesNotMatch(editor, /copy\.spec\.attributes/, 'Bỏ nhãn hàng "Thông số riêng ngành hàng"');

console.log('✅ Thông số theo nhóm hàng: ô "Phân loại sản phẩm" gọn cạnh năng lực mỗi tháng, lựa chọn tiếng Việt, pool cũ được giữ, không tự lên trang buyer.');
