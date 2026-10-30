// node scripts/check-ui-copy.mjs
//
// Chốt văn phong giao diện (docs/copy-style.md): không còn "buyer"/"NCC" trong chuỗi
// tiếng Việt, không lộ từ nội bộ, câu không quá dài. Chỉ quét những file đã chuyển
// đổi ở đợt 1; khi sửa file mới thì thêm vào danh sách SCOPE.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

/** Đợt 1: form 3 bước, bảng giá, xem trước, danh sách sản phẩm, duyệt giá CRM, media. */
const SCOPE = [
  'app/supplier/portal/products/product-editor.tsx',
  'app/supplier/portal/products/product-storefront.tsx',
  'app/supplier/portal/products/[id]/quantity-pricing/page.tsx',
  'app/supplier/portal/products/[id]/quantity-pricing/preview-form.tsx',
  'app/supplier/portal/product-actions.ts',
  'app/supplier/portal/quantity-revision-actions.ts',
  'components/products/quantity-pricing-editor.tsx',
  'components/products/quantity-pricing-inline.tsx',
  'app/crm/products/quantity-review/page.tsx',
  'app/crm/products/quantity-review/actions.ts',
  'app/crm/products/quantity-review/submit-actions.ts',
  'app/crm/products/quantity-review/review-controls.tsx',
  'lib/media/readiness.ts',
  'lib/media/limits.ts',
  'lib/products/quantity-pricing.ts',
  // Đợt 2: 12 màn hình CRM chính, khung điều hướng CRM và thư báo nội bộ.
  'app/crm/rfqs/[id]/page.tsx',
  'app/crm/rfqs/[id]/compose-action.ts',
  'app/crm/categories/categories-manager.tsx',
  'app/crm/products/page.tsx',
  'app/crm/products/[slug]/edit/page.tsx',
  'app/crm/products/[slug]/edit/review-actions.ts',
  'components/product-form.tsx',
  'app/crm/suppliers/[slug]/page.tsx',
  'app/crm/suppliers/[slug]/verification-actions.ts',
  'app/crm/suppliers/[slug]/audit/[step]/audit-form.tsx',
  'app/crm/verifications/submissions/[id]/page.tsx',
  'app/crm/dashboard/page.tsx',
  'app/crm/layout.tsx',
  'components/sidebar.tsx',
  'lib/supplier-portal/notify.ts',
];

const VIETNAMESE = /[àáảãạăâđêôơưýÀ-ỹ]/;
/** Từ nội bộ hoặc từ tiếng Anh không được xuất hiện trong UI tiếng Việt. */
const BANNED = [
  { pattern: /\bbuyer\b/i, why: 'dùng "người mua"' },
  { pattern: /\bNCC\b/, why: 'dùng "nhà cung cấp" hoặc "bạn"' },
  { pattern: /mô hình mới/i, why: 'bỏ chi tiết triển khai nội bộ' },
  { pattern: /\bstaging\b/i, why: 'từ nội bộ' },
  { pattern: /\bmigration\b/i, why: 'từ nội bộ' },
  { pattern: /\bgated?\b/i, why: 'từ nội bộ' },
  { pattern: /feature flag/i, why: 'từ nội bộ' },
];
const MAX_LENGTH = 120;
/** Ngoại lệ có chủ đích: nội dung tiếng Anh công khai và mã lỗi dữ liệu. */
const ALLOW_LINE = /copy-allow/;

let checked = 0;
const problems = [];

for (const file of SCOPE) {
  if (!existsSync(file)) { problems.push(`${file}: thiếu file trong danh sách quét`); continue; }
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (ALLOW_LINE.test(line)) return;
    const withoutComments = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
    if (!withoutComments.trim()) return;
    // Chuỗi ký tự trong dấu nháy và text node JSX; bỏ qua mã (identifier, giá trị dữ liệu).
    const chunks = [
      ...[...withoutComments.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? ''),
      ...[...withoutComments.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]),
    ];
    for (const text of chunks) {
      if (!VIETNAMESE.test(text)) continue;
      checked += 1;
      for (const rule of BANNED) {
        if (rule.pattern.test(text)) problems.push(`${file}:${index + 1}: ${rule.why} — "${text.trim()}"`);
      }
      // Template string có biến thì độ dài thực tế phụ thuộc dữ liệu, bỏ qua giới hạn.
      if (!text.includes('${') && text.length > MAX_LENGTH) {
        problems.push(`${file}:${index + 1}: câu ${text.length} ký tự (tối đa ${MAX_LENGTH}) — "${text.trim().slice(0, 70)}…"`);
      }
    }
  });
}

assert.ok(checked > 200, `Quét được quá ít chuỗi (${checked}); danh sách SCOPE có thể sai`);
assert.deepEqual(problems, [], `Văn phong giao diện chưa đạt:\n${problems.join('\n')}`);

// Chuẩn phải tồn tại và nêu đúng ba quyết định gốc.
const doc = readFileSync('docs/copy-style.md', 'utf8');
for (const rule of ['người mua', 'nhà cung cấp', 'Incoterm']) assert.ok(doc.includes(rule), `docs/copy-style.md thiếu quy tắc: ${rule}`);

console.log(`UI copy: ${checked} chuỗi tiếng Việt trong ${SCOPE.length} file đúng văn phong (không buyer/NCC, không từ nội bộ, câu ≤ ${MAX_LENGTH} ký tự)`);
