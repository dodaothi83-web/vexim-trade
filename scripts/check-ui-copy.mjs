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
  // Độ hoàn thiện hồ sơ (Phase 1, chỉ đọc) + thẻ sản phẩm trong cổng.
  'lib/products/completeness.ts',
  'app/supplier/portal/products/product-storefront.tsx',
  // Đợt 3: toàn bộ màn hình CRM còn lại, cổng nhà cung cấp, email và thông báo.
  'app/(public)/home.tsx',
  'app/actions.ts',
  'app/api/crm/products/import/route.ts',
  'app/api/media/file/[...path]/route.ts',
  'app/api/submission-review/[id]/route.ts',
  'app/api/supplier-portal/certificates/route.ts',
  'app/api/supplier-portal/products/[id]/media/route.ts',
  'app/api/supplier-portal/submissions/route.ts',
  'app/api/suppliers/[id]/profile-image/route.ts',
  'app/api/verifications/[id]/ai-review/route.ts',
  'app/auth-actions.ts',
  'app/crm/buyers/[id]/page.tsx',
  'app/crm/buyers/new/page.tsx',
  'app/crm/buyers/page.tsx',
  'app/crm/mail/compose/page.tsx',
  'app/crm/mail/page.tsx',
  'app/crm/pipeline/page.tsx',
  'app/crm/products/[slug]/edit/featured-image-action.ts',
  'app/crm/products/[slug]/edit/review-controls.tsx',
  'app/crm/products/[slug]/edit/translation-panel.tsx',
  'app/crm/products/[slug]/page.tsx',
  'app/crm/products/import/import-client.tsx',
  'app/crm/products/import/page.tsx',
  'app/crm/rfqs/[id]/actions.ts',
  'app/crm/rfqs/actions-inline.ts',
  'app/crm/rfqs/page.tsx',
  'app/crm/settings/page.tsx',
  'app/crm/settings/users/page.tsx',
  'app/crm/sponsored/page.tsx',
  'app/crm/suppliers/[slug]/account-actions.ts',
  'app/crm/suppliers/[slug]/audit/[step]/certificate-actions.ts',
  'app/crm/suppliers/[slug]/audit/[step]/certificate-row-controls.tsx',
  'app/crm/suppliers/[slug]/audit/[step]/page.tsx',
  'app/crm/suppliers/[slug]/edit/page.tsx',
  'app/crm/suppliers/[slug]/onboarding-actions.ts',
  'app/crm/suppliers/[slug]/onboarding-controls.tsx',
  'app/crm/suppliers/[slug]/products/new/page.tsx',
  'app/crm/suppliers/[slug]/verification-panel.tsx',
  'app/crm/team/page.tsx',
  'app/crm/templates/page.tsx',
  'app/crm/traffic/page.tsx',
  'app/crm/verifications/contact-request-button.tsx',
  'app/crm/verifications/page.tsx',
  'app/crm/verifications/submissions/[id]/submission-review-actions.tsx',
  'app/crm/verifications/submissions/page.tsx',
  'app/mail-attachment-actions.ts',
  'app/supplier/portal/documents/page.tsx',
  'app/supplier/portal/page.tsx',
  'app/supplier/portal/profile/page.tsx',
  'app/supplier/portal/profile/profile-edit-form.tsx',
  'app/supplier/portal/rfqs/page.tsx',
  'app/supplier/portal/storefront/page.tsx',
  'app/supplier/portal/supplier-profile-form.tsx',
  'app/supplier/portal/traffic/page.tsx',
  'app/supplier/portal/verification/verification-panel.tsx',
  'components/buyer-detail-actions.tsx',
  'components/buyer-form.tsx',
  'components/buyer-table.tsx',
  'components/compose-mail.tsx',
  'components/compose-sidebar.tsx',
  'components/mailbox.tsx',
  'components/media-manager.tsx',
  'components/pipeline-board.tsx',
  'components/product-file-picker.tsx',
  'components/products/grade-pricing-table.tsx',
  'components/prospect-actions.tsx',
  'components/prospect-importer.tsx',
  'components/public-sign-in-link.tsx',
  'components/stage-select.tsx',
  'components/supplier-actions.tsx',
  'components/supplier-form.tsx',
  'components/supplier-table.tsx',
  'components/template-editor.tsx',
  'components/user-manager.tsx',
  'lib/auth/permissions.ts',
  'lib/certificate-service.ts',
  'lib/db/local.ts',
  'lib/db/seed.ts',
  'lib/db/supabase.ts',
  'lib/email/privacy.ts',
  'lib/email/send.ts',
  'lib/email/stage-content.ts',
  'lib/email/templates.ts',
  'lib/pipeline.ts',
  'lib/products/grade-pricing.ts',
  'lib/products/legacy-grade-split-plan.ts',
  'lib/rfq/buyer-notify.ts',
  'lib/rfq/outreach.ts',
  'lib/rfq/spam-flags.ts',
  'lib/rfq/staff-sender.ts',
  'lib/rfq/supplier-question.ts',
  'lib/supplier-portal/dashboard.ts',
  'lib/traffic/site-report.ts',
  'lib/verification-submission-service.ts',
  'lib/verification.ts',
  'app/crm/mail/[id]/page.tsx',
  'app/crm/settings/quantity-pricing/page.tsx',
  'components/mail-threads.tsx',
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

/** Bỏ các đoạn ${...} (ngoặc cân bằng) để không kiểm mã bên trong biểu thức. */
function stripInterpolations(text) {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '$' && text[i + 1] === '{') {
      let depth = 1;
      i += 2;
      while (i < text.length && depth) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') depth -= 1;
        i += 1;
      }
      out += ' ';
      i -= 1;
    } else {
      out += text[i];
    }
  }
  return out;
}

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
      // Chỉ xét phần chữ hiển thị: biến trong ${...} là mã, không phải copy.
      const visible = stripInterpolations(text);
      for (const rule of BANNED) {
        if (rule.pattern.test(visible)) problems.push(`${file}:${index + 1}: ${rule.why} — "${text.trim()}"`);
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
