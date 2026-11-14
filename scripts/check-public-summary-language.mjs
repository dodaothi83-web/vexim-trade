import assert from "node:assert/strict";
import fs from "node:fs";

const { looksVietnamese, stripVietnameseMarks } = await import("../lib/vietnamese-text.ts");
const { approvedPublicReviewSummaries } = await import("../lib/verification-status.ts");

// 1. Nhận biết câu tiếng Việt, nhưng tên riêng tiếng Việt trong câu tiếng Anh vẫn hợp lệ.
assert.equal(looksVietnamese("Tôi đã xác thực đúng tài liệu"), true);
assert.equal(looksVietnamese("Đã kiểm tra"), true);
assert.equal(looksVietnamese("Facility reviewed by Nguyễn Văn An (Vexim review lead) via video call on 7 Nov 2026. Observed: production line, warehouse."), false,
  "Tên người kiểm tiếng Việt trong tóm tắt tiếng Anh không bị chặn");
assert.equal(looksVietnamese("Café supplier résumé reviewed"), false, "é/è kiểu tiếng Anh/Pháp không bị coi là tiếng Việt");
assert.equal(looksVietnamese(""), false);
assert.equal(stripVietnameseMarks("Long Bình Tân, Đồng Nai"), "Long Binh Tan, Dong Nai");

// 2. Trang công khai bỏ tóm tắt viết bằng tiếng Việt và dùng câu mặc định tiếng Anh.
const row = (level, en, at) => ({ target_level: level, status: "approved", public_summary_published_at: at, public_summary_i18n: { en } });
assert.deepEqual({ ...approvedPublicReviewSummaries([row(3, "Tôi đã xác thực đúng tài liệu", "2026-11-07")]) }, {},
  "Tóm tắt tiếng Việt không hiện cho người mua");
assert.equal(approvedPublicReviewSummaries([row(3, "Export documents for two shipments were reviewed.", "2026-11-07")])[3],
  "Export documents for two shipments were reviewed.");

// 3. CRM từ chối lưu tóm tắt công khai viết bằng tiếng Việt.
const actions = fs.readFileSync(new URL("../app/crm/suppliers/[slug]/verification-actions.ts", import.meta.url), "utf8");
assert.match(actions, /if \(looksVietnamese\(summary\)\) return "Tóm tắt công khai đang viết bằng tiếng Việt/, "CRM chặn tóm tắt tiếng Việt");

console.log("✅ Tóm tắt xác minh công khai: chặn tiếng Việt ở CRM và trang công khai, giữ tên riêng trong câu tiếng Anh.");
