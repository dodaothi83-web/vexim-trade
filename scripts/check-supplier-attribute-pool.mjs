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
assert.match(html, /Thông số theo nhóm hàng/);
assert.match(html, /Chọn đúng thông số cho lô hàng này, nếu không có thông số nào phù hợp nhà cung cấp có thể tự thêm\./,
  'Mô tả đúng câu yêu cầu, không dài dòng');
assert.doesNotMatch(html, /viết theo cách nhà máy vẫn gọi/, 'Bỏ mô tả dài cũ');
assert.doesNotMatch(html, /để nhà cung cấp khác dùng lại/, 'Bỏ mô tả dài cũ');
assert.doesNotMatch(html, /Thêm thông số chưa có trong danh sách/, 'Bỏ tiêu đề khối thêm thông số');
assert.doesNotMatch(html, /Ví dụ: Độ ẩm, Tỷ lệ hạt vỡ/, 'Bỏ dòng ví dụ dài');
assert.doesNotMatch(html, /Chưa có trong danh sách\? Thêm giá trị/, 'Bỏ nút chữ dài dưới ô chọn');
assert.doesNotMatch(html, /Thêm thông số khác|Tên thông số|Giá trị cho sản phẩm này/,
  'Không còn ô thêm thông số tự do: độ ẩm/tỷ lệ vỡ đã khai ở ô Quy cách / tiêu chuẩn');
assert.doesNotMatch(html, /attributeKeyFromLabel|Tên thông số mới/);
assert.match(html, /Chọn đúng thông số cho lô hàng này, nếu không có thông số nào phù hợp nhà cung cấp có thể tự thêm\./,
  'Giữ câu mô tả: không phù hợp thì tự thêm giá trị');
assert.match(html, />Thêm<\/button>/, 'Chữ Thêm ngay dưới ô Grade để bổ sung mã chưa có trong danh sách');
assert.equal((html.match(/class="input min-w-0 flex-1" name="attribute:product_type"/) ?? []).length, 1,
  'Ô Grade được nới rộng để chứa ô nhập mới bên cạnh');
assert.match(html, /name="attribute_pool"/, 'Pool được gửi kèm form');
assert.match(html, /name="attribute:do_am"/);
assert.match(html, /name="attribute:product_type"/);
assert.match(html, /value="13,5%"/);
assert.match(html, /Tự thêm/, 'Thông số của NCC khác được đánh dấu');
assert.match(html, /Cassia powder hạt mịn/, 'Lựa chọn NCC khác đã thêm hiện trong danh sách chọn');
assert.match(html, /không tạo nhãn xác minh/, 'Nói rõ không phải xác minh');

// Nhóm hàng chưa khai thông số: không hiện khối trống (quy cách đã nằm ở ô bên dưới).
const noFieldHtml = renderToStaticMarkup(React.createElement(SupplierAttributeInputs, {
  officialFields: [], supplierFields: [], values: {},
}));
assert.equal(noFieldHtml, '', 'Danh mục chưa có thông số thì không hiện khối nào');

const lockedHtml = renderToStaticMarkup(React.createElement(SupplierAttributeInputs, {
  officialFields: category.product_fields, supplierFields: [], values: {}, disabled: true,
}));
assert.doesNotMatch(lockedHtml, />Thêm<\/button>/, 'Sản phẩm đang chờ duyệt thì không thêm giá trị mới');

// Chữ "Thêm" dưới ô chọn mở ô nhập ngay cạnh ô đó (không phải link chữ dài).
const component = read('../components/supplier-attribute-inputs.tsx');
assert.match(component, /optionFor === field\.key && <>/, 'Ô nhập mới nằm cùng hàng với ô chọn');
assert.match(component, /className="input min-w-0 flex-1" autoFocus maxLength=\{60\} placeholder="Giá trị mới"/,
  'Ô nhập mới gọn, có nhãn cho trình đọc màn hình');
assert.match(component, /className="btn btn-primary btn-sm shrink-0" onClick=\{\(\) => addOption\(field, optionDraft\)\}>Thêm<\/button>/,
  'Nút Thêm nằm ngay cạnh ô nhập mới');
assert.doesNotMatch(component, /function addField\(/, 'Đã bỏ hàm thêm thông số tự do');
assert.match(component, /if \(!fields\.length\) return null;/, 'Không có thông số thì không render khối');



/* 9. Trang sản phẩm truyền cả trường CMS và thông số NCC khác đã thêm. */
const editor = read('../app/supplier/portal/products/product-editor.tsx');
assert.match(editor, /selectedCategory && \(fieldsFor\(activeCategory\)\.length > 0 \|\| supplierFieldsFor\(activeCategory\)\.length > 0\)/,
  'Danh mục chưa khai thông số thì không hiện khối trống ở bước 1');
assert.match(editor, /Quy cách \/ tiêu chuẩn/, 'Mô tả dài đã có ô Quy cách / tiêu chuẩn');
assert.match(editor, /supplierFields=\{supplierFieldsFor\(activeCategory\)\}/);
assert.match(editor, /officialFields=\{fieldsFor\(activeCategory\)\}/);
assert.match(editor, /Thông số theo nhóm hàng/, 'Bước 3 đọc lại thông số theo nhãn');

console.log('✅ Thông số theo nhóm hàng: NCC tự thêm thông số/giá trị còn thiếu, lưu vào danh mục cho NCC khác dùng lại, không tự lên bộ lọc hay trang buyer.');
