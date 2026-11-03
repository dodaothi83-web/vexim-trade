// node --experimental-strip-types scripts/check-portal-i18n.mjs
//
// Giai đoạn 2 của i18n: cổng nhà cung cấp chuyển dần theo từng cụm.
//
// Cụm 1 gồm khung cổng (menu trái, thanh trên, layout) và trang tổng quan. Check này giữ
// đúng những chỗ dễ vỡ khi chuyển dần:
//  - bản dịch lệch khoá so với bản gốc;
//  - tiếng Việt còn sót trong khung/nội dung đã chuyển sang tiếng Anh;
//  - dải tiến độ xác minh: câu do mô hình sinh ra cũng phải có bản tiếng Anh, không chỉ
//    phần khung;
//  - menu và trang đọc ngôn ngữ từ hai nguồn khác nhau.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

import { loadPortalDictionary } from "./lib/portal-dictionary.mjs";

const root = path.join(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const portal = loadPortalDictionary();

const overviewPageSource = read("app/supplier/portal/page.tsx");

const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậđêềếểễệôồốổỗộơờớởỡợưừứửữựỳýỷỹỵ]/i;

/* 1. Hai ngôn ngữ phải cùng bộ khoá, cùng kiểu. */
function shape(value, trail) {
  if (typeof value === "string") return [[trail, "string"]];
  if (Array.isArray(value)) return value.flatMap((item, index) => shape(item, `${trail}[${index}]`));
  return Object.entries(value).flatMap(([key, item]) => shape(item, trail ? `${trail}.${key}` : key));
}
function leaves(value, trail) {
  if (typeof value === "string") return [[trail, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => leaves(item, `${trail}[${index}]`));
  return Object.entries(value).flatMap(([key, item]) => leaves(item, trail ? `${trail}.${key}` : key));
}
for (const cluster of ["shared", "shell", "overview", "profile", "onboarding", "products", "productEditor"]) {
  assert.deepEqual(
    shape(portal.vi[cluster], cluster),
    shape(portal.en[cluster], cluster),
    `${cluster}: khoá tiếng Việt khớp tiếng Anh`,
  );
}

for (const [key, text] of leaves(portal.en, "")) {
  assert.doesNotMatch(text, VIETNAMESE, `Chuỗi tiếng Anh ${key} còn dấu tiếng Việt`);
  assert.ok(text.trim().length > 0, `Chuỗi tiếng Anh ${key} rỗng`);
  assert.doesNotMatch(text, /[—–]/, `${key} dùng gạch ngang dài`);
}
for (const [key, text] of leaves(portal.vi, "")) {
  assert.ok(text.trim().length > 0, `Chuỗi tiếng Việt ${key} rỗng`);
  assert.doesNotMatch(text, /[—–]/, `${key} dùng gạch ngang dài`);
}

/* 2. Không còn chuỗi hiển thị viết cứng trong các file đã chuyển. */
const CONVERTED = [
  "app/supplier/portal/page.tsx",
  "app/supplier/portal/layout.tsx",
  "app/supplier/portal/pending-profile-refresh.tsx",
  "app/supplier/portal/verification-progress.tsx",
  "app/supplier/portal/supplier-profile-form.tsx",
  "app/supplier/portal/supplier-category-picker.tsx",
  "app/supplier/portal/profile/page.tsx",
  "app/supplier/portal/profile/profile-edit-form.tsx",
  "app/supplier/portal/profile/profile-actions.ts",
  "app/supplier/portal/profile/edit/page.tsx",
  "app/supplier/portal/products/page.tsx",
  "app/supplier/portal/products/product-storefront.tsx",
  "app/supplier/portal/products/product-certificates-form.tsx",
  "components/supplier-sidebar.tsx",
  "components/supplier-topbar.tsx",
];
const withoutComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join("\n");
for (const file of CONVERTED) {
  assert.doesNotMatch(
    withoutComments(read(file)),
    VIETNAMESE,
    `${file}: còn tiếng Việt ngoài comment — chuỗi hiển thị phải nằm trong từ điển`,
  );
}

/* 3. Dải tiến độ xác minh: mô hình cũng phải nói được tiếng Anh. */
function loadModel() {
  const load = (rel, mocks = {}) => {
    const filename = path.join(root, rel);
    const mod = { exports: {} };
    vm.runInNewContext(
      ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      {
        module: mod,
        exports: mod.exports,
        process,
        console,
        Date,
        Map,
        Set,
        require: (key) => {
          if (key in mocks) return mocks[key];
          if (key === "server-only") return {};
          throw new Error(`${rel}: unexpected import ${key}`);
        },
      },
      { filename },
    );
    return mod.exports;
  };
  const types = load("lib/types.ts");
  const policy = load("lib/supplier-portal/policy.ts", {
    "@/lib/types": types,
    "@/lib/verification": { auditUploadKind: () => null },
  });
  const scope = load("lib/l2-scope.ts");
  return load("lib/supplier-portal/verification-progress.ts", {
    "@/lib/types": types,
    "@/lib/l2-scope": scope,
    "./policy": policy,
  });
}

const { buildVerificationProgress } = loadModel();
const supplierId = "sup-1";
const review = (over = {}) => ({
  id: "v1", supplier_id: supplierId, target_level: 1, status: "in_progress", return_reason: null,
  created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-20T00:00:00Z", ...over,
});
const submission = (over = {}) => ({
  id: "sub-2", supplier_id: supplierId, target_level: 2, status: "draft", review_note: null,
  created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z", ...over,
});
const base = { supplierId, supplierType: "manufacturer", reviews: [], submissions: [], requests: [], documents: [] };
const scenarios = {
  empty: base,
  l1Approved: { ...base, reviews: [review({ status: "approved", approved_at: "2026-10-25T00:00:00Z" })] },
  // Lý do trả lại là DỮ LIỆU do nhân viên gõ, không phải chuỗi giao diện: dùng câu tiếng Anh
  // ở đây để check chỉ bắt lỗi dịch thiếu, không bắt lỗi nội dung người dùng nhập.
  l1Returned: { ...base, reviews: [review({ status: "returned", return_reason: "Photo is blurry" })] },
  l2Returned: { ...base, submissions: [submission({ status: "returned" })] },
  l3Pending: { ...base, submissions: [submission({ target_level: 3, status: "pending_review" })] },
  partner: { ...base, supplierType: "trading", reviews: [review({ target_level: 2, status: "approved", l2_scope: "partner_contract" })] },
  typeUnknown: { ...base, supplierType: null },
};

for (const [name, input] of Object.entries(scenarios)) {
  for (const locale of ["vi", "en"]) {
    const progress = buildVerificationProgress({ ...input, locale });
    const texts = [progress.headline, ...progress.steps.flatMap((step) => [step.title, step.description, step.note, step.metric, step.status, step.action])];
    for (const text of texts) {
      assert.ok(String(text).trim().length > 0, `${name}/${locale}: câu rỗng`);
      if (locale === "en") {
        assert.doesNotMatch(String(text), VIETNAMESE, `${name}: câu tiếng Anh còn dấu tiếng Việt — "${text}"`);
      } else {
        assert.match(String(text), VIETNAMESE, `${name}: câu tiếng Việt phải giữ nguyên tiếng Việt — "${text}"`);
      }
    }
  }
}
// Mặc định vẫn là tiếng Việt: trang chưa chuyển không được đổi tiếng.
assert.match(buildVerificationProgress(base).headline, /Bước tiếp theo/, "Mặc định giữ tiếng Việt");

/* 3b. Cụm 2: ngôn ngữ phải chảy tới tận biểu mẫu và thông báo của server action. */
assert.match(
  overviewPageSource,
  /<SupplierProfileForm[^>]*messages=\{m\.onboarding\}/,
  "Biểu mẫu hồ sơ nhận chuỗi từ từ điển (nếu quên, biểu mẫu vẫn tiếng Việt)",
);
assert.match(
  overviewPageSource,
  /<SupplierProfileForm[^>]*types=\{m\.shared\.supplierTypes\}/,
  "Loại hình trong biểu mẫu dùng chung một bộ nhãn với trang hồ sơ",
);
assert.match(overviewPageSource, /<SupplierProfileForm[^>]*lang=\{locale\}/, "Biểu mẫu khai đúng ngôn ngữ");
const editPage = read("app/supplier/portal/profile/edit/page.tsx");
assert.match(editPage, /<SupplierProfileEditForm[^>]*messages=\{copy\}/, "Trang chỉnh sửa truyền chuỗi xuống biểu mẫu");
const profileActions = read("app/supplier/portal/profile/profile-actions.ts");
assert.match(profileActions, /getPortalMessages\(\)/, "Thông báo của server action theo ngôn ngữ đang chọn");
assert.doesNotMatch(profileActions, /message: "/, "Không trả thông báo viết cứng từ server action");

/* 3c. Cụm 3a: danh sách sản phẩm. */
const listPage = read("app/supplier/portal/products/page.tsx");
assert.match(listPage, /const \{ locale, intl, m \} = await getPortalMessages\(\)/, "Trang danh sách đọc từ điển một lần");
assert.match(listPage, /messages=\{m\.products\}/, "Danh sách sản phẩm nhận chuỗi từ từ điển");
assert.match(listPage, /intl=\{intl\}/, "Danh sách định dạng số và ngày theo ngôn ngữ");
const storefront = read("app/supplier/portal/products/product-storefront.tsx");
assert.doesNotMatch(storefront, /"(?:vi-VN)"/, "Danh sách không còn khoá cứng vi-VN cho số và ngày");
assert.match(storefront, /useMemo\(\(\) => Object\.fromEntries/, "Bộ lọc dựng từ danh sách id, nhãn lấy từ từ điển");
// Thang đo hoàn thiện dùng chung với CRM: CRM vẫn tiếng Việt, cổng đọc nhãn theo ngôn ngữ.
const completeness = read("lib/products/completeness.ts");
assert.match(completeness, /labelEn:/, "Mỗi mục hoàn thiện có nhãn tiếng Anh");
assert.match(completeness, /copy\.lang === "en" \? result\.next\.labelEn/, "Câu nhắc chọn nhãn theo ngôn ngữ");

/* 4. Ngôn ngữ của cổng lấy từ cookie, không đổi URL. */
const layout = read("app/layout.tsx");
assert.match(layout, /isLocalizedPath\(pathname\)/, "layout dùng đúng phạm vi đa ngôn ngữ");
const { isLocalizedPath, isLocalizedPortalPath } = await import("../lib/i18n/config.ts");
for (const route of ["/supplier/portal", "/supplier/portal/products", "/login", "/register"]) {
  assert.equal(isLocalizedPath(route), true, `${route} đọc ngôn ngữ từ cookie`);
}
for (const route of ["/supplier/apply", "/crm/dashboard", "/rfq", "/"]) {
  assert.equal(isLocalizedPath(route), false, `${route} chưa chuyển ở cụm này`);
}
assert.equal(isLocalizedPortalPath("/supplier/portal/rfqs"), true);
assert.equal(isLocalizedPortalPath("/supplier/portalx"), false);

/* 5. Ngôn ngữ phải được truyền vào mô hình tiến độ, không chỉ vào khung của khối. */
const overviewPage = overviewPageSource;
assert.match(
  overviewPage,
  /buildVerificationProgress\(\{[\s\S]{0,400}?\n\s+locale,/,
  "Trang tổng quan truyền locale vào buildVerificationProgress (nếu quên, các bước vẫn tiếng Việt)",
);
assert.match(overviewPage, /<VerificationProgressPanel progress=\{verification\} messages=\{copy\.verificationPanel\} lang=\{locale\} \/>/);

/* 6. Khung và menu dùng chung một nguồn chữ. */
const portalLayout = read("app/supplier/portal/layout.tsx");
assert.match(portalLayout, /getPortalMessages\(\)/, "layout cổng đọc từ điển một lần");
assert.match(portalLayout, /messages=\{m\.shell\}/, "menu trái nhận chuỗi từ layout");
assert.match(portalLayout, /<SupplierTopbar messages=\{m\.shell\}/, "thanh trên nhận chuỗi từ layout");
const topbar = read("components/supplier-topbar.tsx");
assert.match(topbar, /<LocaleSwitch locale=\{lang\} label=\{messages\.topbar\.language\} \/>/, "công tắc ngôn ngữ nằm ở thanh trên");
const sidebar = read("components/supplier-sidebar.tsx");
assert.match(sidebar, /labelKey: keyof ShellMessages\["nav"\]/, "menu giữ khoá, không giữ chữ");
assert.doesNotMatch(sidebar, /label: "Tổng quan"/, "nhãn menu không còn viết cứng");

console.log("✅ Portal i18n (cụm 1 + 2 + 3a: khung, tổng quan, hồ sơ, danh sách sản phẩm): đủ khoá, không lẫn tiếng Việt trong bản tiếng Anh, mô hình tiến độ nói được cả hai ngôn ngữ.");
