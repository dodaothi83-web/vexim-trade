// node scripts/check-certificate-scope.mjs — phạm vi chứng nhận (GĐ2 giấy tờ & chứng nhận).
//
// Kiểm sáu nghiệm thu: sản phẩm mới trong danh mục đã có HACCP tự lên chip; bỏ tick thì
// rơi khỏi chip và số đếm giảm 1; GPKD/giấy phép XK/C-O không bao giờ thành badge/chip;
// giấy hết hạn tự rơi; bản gia hạn đang chờ không làm mất giấy cũ.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const nodeRequire = createRequire(import.meta.url);

function resolveFile(target) {
  for (const cand of [target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  throw new Error(`Cannot resolve ${target}`);
}

const cache = new Map();
function loadTs(relPath, overrides = {}) {
  const abs = resolveFile(path.join(ROOT, relPath));
  const key = `${abs}::${Object.keys(overrides).sort().join(",")}`;
  if (cache.has(key)) return cache.get(key).exports;
  const module = { exports: {} };
  cache.set(key, module);
  const localRequire = (id) => {
    if (id in overrides) return overrides[id];
    if (id === "server-only") return {};
    if (id.startsWith("@/")) return loadTs(id.slice(2), overrides);
    if (id.startsWith(".")) {
      const resolved = path.relative(ROOT, path.resolve(path.dirname(abs), id));
      return loadTs(resolved, overrides);
    }
    return nodeRequire(id);
  };
  const source = fs.readFileSync(abs, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const fn = new vm.Script(
    `(function (exports, require, module, __filename, __dirname) {\n${transpiled}\n});`,
    { filename: abs },
  ).runInThisContext();
  fn(module.exports, localRequire, module, abs, path.dirname(abs));
  return module.exports;
}

const scope = loadTs("lib/certificate-scope.ts");
const facets = loadTs("lib/public/certificate-facets.ts");
const certificatesModule = loadTs("lib/public/certificates.ts");
const l1 = loadTs("lib/certificate-l1.ts");

const TODAY = "2026-10-31";
const CASHEW = "cat-cashew";
const RICE = "cat-rice";
const media = [{ id: "m-cert", supplier_id: "s1", audience: "internal", storage_path: "certs/haccp.pdf", expires_on: null }];
const base = {
  supplier_id: "s1", issuer: "SGS", number: "VN-1", valid_until: "2027-03-31", file_media_id: "m-cert",
  review_status: "approved", publicly_visible: true, staff_hidden: false, holder_match: "owner", holder_name: "Nhà máy A",
};
const cert = (patch) => ({ ...base, ...patch });
const verified = (patch) => ({ verified_by: "staff@vexim.vn", verified_at: "2026-10-20T00:00:00Z", ...patch });

/* 1. Sản phẩm trong danh mục đã có HACCP được duyệt thì tự lên chip. */
const haccp = cert({ id: "c-haccp", name: "HACCP Codex", certificate_scheme: "haccp" });
const scopes = [verified({ id: "sc-1", certificate_id: "c-haccp", category_id: CASHEW, product_id: null })];
const products = [
  { id: "p-new", supplierId: "s1", categoryId: CASHEW, categoryPath: [CASHEW] },
  { id: "p-rice", supplierId: "s1", categoryId: RICE, categoryPath: [RICE] },
  { id: "p-child", supplierId: "s1", categoryId: "cat-cashew-kernels", categoryPath: ["cat-cashew-kernels", CASHEW] },
];
const map = facets.certificateSchemesByProduct(products, [haccp], media, TODAY, { scopes, optouts: [] });
assert.deepEqual([...(map.get("p-new") ?? [])], ["haccp"], "sản phẩm mới trong danh mục tự thừa hưởng HACCP");
assert.deepEqual([...(map.get("p-child") ?? [])], ["haccp"], "nhóm con thuộc danh mục cha cũng thừa hưởng");
assert.equal(map.get("p-rice"), undefined, "danh mục khác không thừa hưởng");
assert.deepEqual(facets.buildCertificateFacets(map).map((facet) => [facet.code, facet.count]), [["haccp", 2]]);

/* Phạm vi chưa xác nhận không có hiệu lực. */
const unverified = facets.certificateSchemesByProduct(products, [haccp], media, TODAY, {
  scopes: [{ id: "sc-x", certificate_id: "c-haccp", category_id: CASHEW, product_id: null }], optouts: [],
});
assert.equal(unverified.size, 0, "phạm vi chưa có người xác nhận thì không áp cho người mua");

/* 2. Nhà cung cấp bỏ tick thì sản phẩm rơi khỏi chip, số đếm giảm 1. */
const optedOut = facets.certificateSchemesByProduct(products, [haccp], media, TODAY, {
  scopes,
  optouts: [{ product_id: "p-new", certificate_id: "c-haccp" }],
});
assert.equal(optedOut.get("p-new"), undefined, "bỏ tick thì không còn thừa hưởng");
assert.deepEqual(facets.buildCertificateFacets(optedOut).map((facet) => [facet.code, facet.count]), [["haccp", 1]],
  "số đếm trên chip giảm đúng 1");

/* Phạm vi gắn thẳng sản phẩm là quyết định của nhân viên: opt-out không ghi đè. */
const direct = [verified({ id: "sc-2", certificate_id: "c-haccp", category_id: null, product_id: "p-new" })];
const directMap = facets.certificateSchemesByProduct(products, [haccp], media, TODAY, {
  scopes: direct, optouts: [{ product_id: "p-new", certificate_id: "c-haccp" }],
});
assert.deepEqual([...(directMap.get("p-new") ?? [])], ["haccp"], "opt-out chỉ áp cho giấy thừa hưởng, không xoá phạm vi trực tiếp");

/* 3. GPKD, giấy phép XK, C/O không bao giờ thành badge hay chip, kể cả khi có phạm vi. */
for (const [id, scheme] of [["c-legal", "business_license"], ["c-exp", "export_license"], ["c-co", "origin"], ["c-phyto", "phytosanitary"]]) {
  const legal = cert({ id, name: `${scheme} doc`, certificate_scheme: scheme });
  const legalScopes = [verified({ id: `sc-${id}`, certificate_id: id, category_id: CASHEW, product_id: null })];
  const legalMap = facets.certificateSchemesByProduct(products, [legal], media, TODAY, { scopes: legalScopes, optouts: [] });
  assert.equal(legalMap.size, 0, `${scheme} không lên chip`);
  const onPdp = certificatesModule.publicProductCertificates("s1", "p-new", [legal], media, TODAY, {
    scopes: legalScopes, optouts: [], categoryId: CASHEW, categoryPath: [CASHEW],
  });
  assert.equal(onPdp.length, 0, `${scheme} không thành badge sản phẩm`);
}

/* 4. Giấy hết hạn tự rơi khỏi chip. */
const expired = cert({ id: "c-old", name: "HACCP Codex", certificate_scheme: "haccp", valid_until: "2026-01-01" });
const expiredScopes = [verified({ id: "sc-old", certificate_id: "c-old", category_id: CASHEW, product_id: null })];
assert.equal(
  facets.certificateSchemesByProduct(products, [expired], media, TODAY, { scopes: expiredScopes, optouts: [] }).size,
  0, "giấy hết hạn rơi khỏi bộ lọc",
);

/* 5. Bản gia hạn đang chờ duyệt: giấy cũ vẫn giữ chip. */
const pendingRenewal = cert({
  id: "c-haccp-2", name: "HACCP Codex", certificate_scheme: "haccp",
  review_status: "pending", publicly_visible: false, supersedes_certificate_id: "c-haccp",
});
const duringRenewal = facets.certificateSchemesByProduct(products, [haccp, pendingRenewal], media, TODAY, { scopes, optouts: [] });
assert.deepEqual([...(duringRenewal.get("p-new") ?? [])], ["haccp"], "bản gia hạn chờ duyệt không làm mất giấy cũ");

/* Duyệt xong: phạm vi chuyển sang bản mới, bản cũ ngừng hiện. */
const copied = scope.renewalScopeRows("c-haccp", "c-haccp-2", scopes, { id: "staff@vexim.vn", at: "2026-11-01T00:00:00Z" });
assert.deepEqual(copied.map((row) => [row.certificate_id, row.category_id, row.product_id]), [["c-haccp-2", CASHEW, null]]);
const approvedRenewal = { ...pendingRenewal, review_status: "approved", publicly_visible: true };
const supersededOld = { ...haccp, superseded_by_certificate_id: "c-haccp-2" };
const afterRenewal = facets.certificateSchemesByProduct(products, [supersededOld, approvedRenewal], media, TODAY, {
  scopes: [...scopes, ...copied.map((row, index) => ({ id: `sc-new-${index}`, ...row }))], optouts: [],
});
assert.deepEqual([...(afterRenewal.get("p-new") ?? [])], ["haccp"], "bản mới giữ chip sau khi phạm vi chuyển sang");
assert.equal(
  certificatesModule.publicProductCertificates("s1", "p-new", [supersededOld], media, TODAY, {
    scopes, optouts: [], categoryId: CASHEW, categoryPath: [CASHEW],
  }).length,
  0, "bản cũ đã bị thay thì không còn hiện",
);

/* 6. Bảng L1 suy ra từ giấy đã duyệt + cảnh báo lệch mục checklist. */
const l1Rows = l1.deriveL1Rows([
  cert({ id: "c-bl", name: "GPKD", certificate_scheme: "business_license", valid_until: null, file_media_id: null }),
  cert({ id: "c-h", name: "HACCP", certificate_scheme: "haccp" }),
  cert({ id: "c-pending", name: "Halal", certificate_scheme: "halal", review_status: "pending" }),
], TODAY);
assert.deepEqual(l1Rows.map((row) => row.key).sort(), ["business_license", "haccp_or_brc"]);
assert.equal(l1.checklistMismatch({ id: "x", name: "GPKD", checklist_key: "haccp_or_brc", certificate_scheme: "business_license" })?.includes("business_license"), true);
assert.equal(l1.checklistMismatch({ id: "x", name: "HACCP", checklist_key: "haccp_or_brc", certificate_scheme: "haccp" }), null);

/* 7. Nối dây: trang danh mục đọc phạm vi/opt-out; portal có opt-out; CRM có hàng đợi. */
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const categoryPage = read("app/(public)/products/[slug]/page.tsx");
const categoryCertificateData = read("lib/public/category-certificate-data.ts");
assert.match(categoryCertificateData, /listCertificateScopes/, "dữ liệu danh mục đọc phạm vi chứng nhận");
assert.match(categoryCertificateData, /listCertificateOptoutsForSuppliers/, "dữ liệu danh mục đọc lựa chọn bỏ nhận");
assert.match(categoryPage, /readCategoryCertificateData\(/, "trang danh mục lấy phạm vi + opt-out từ một chỗ");
assert.match(categoryPage, /certificateSchemesByProduct\(\s*products\.map/, "số đếm tính trên danh sách trước khi lọc theo chứng nhận");
const pdp = read("app/(public)/products/[slug]/[productId]/page.tsx");
assert.match(pdp, /listCertificateScopes/, "trang sản phẩm dùng cùng phạm vi");
const portalForm = read("app/supplier/portal/products/product-certificates-form.tsx");
assert.match(portalForm, /setProductCertificateOptoutAction/, "nhà cung cấp bỏ tick được giấy thừa hưởng");
assert.match(portalForm, /Yêu cầu mở rộng phạm vi/, "giấy ngoài phạm vi có nút xin mở rộng");
assert.doesNotMatch(portalForm, /name="checklist_key"/, "nhà cung cấp không chọn ngăn khi tải giấy");
const portalDocuments = read("app/supplier/portal/documents/page.tsx");
assert.match(portalDocuments, /deriveL1Rows/, "bảng L1 tính từ giấy đã duyệt");
const crmQueue = read("app/crm/certificates/page.tsx");
assert.match(crmQueue, /Giấy chưa phân loại/, "CRM có hàng đợi giấy chưa phân loại");

/* 6b. Trang CRM mới là một route thật: tự chặn quyền, cùng quyền với mục menu. */
assert.match(crmQueue, /requirePagePermission\("verifications\.view", "\/crm\/certificates"\)/,
  "trang hàng đợi tự chặn quyền verifications.view");
assert.match(crmQueue, /export const dynamic = "force-dynamic"/, "trang hàng đợi đọc dữ liệu mỗi lần mở");
assert.match(crmQueue, /robots: \{ index: false, follow: false \}/, "trang nội bộ không cho máy tìm kiếm");
const navRow = read("components/sidebar.tsx").split("\n").find((line) => line.includes('href: "/crm/certificates"'));
assert.ok(navRow, "menu có mục Giấy tờ & chứng nhận");
assert.match(navRow, /perm: "verifications\.view"/, "mục menu dùng đúng quyền như trang");
assert.match(crmQueue, /href=\{`\/crm\/suppliers\/\$\{certificate\.supplier_id\}\/audit\/documents`\}/,
  "hàng đợi mở đúng hồ sơ của nhà cung cấp");
assert.match(crmQueue, /certificateSchemeLabel/, "hàng đợi hiện loại giấy");
const editor = read("app/supplier/portal/products/product-editor.tsx");
assert.match(editor, /Chứng nhận theo danh mục/, "form thêm sản phẩm hiện khối chứng nhận theo danh mục");
assert.match(editor, /mục Chứng nhận áp dụng của trang sản phẩm/, "chỉ sang khối bỏ tick ở trang sản phẩm");
assert.doesNotMatch(read("app/supplier/portal/products/[id]/page.tsx"), /certificateInheritance=/,
  "trang sửa sản phẩm không lặp lại khối giấy theo danh mục");
assert.match(editor, /certificateInheritance/, "khối đó lấy từ giấy đã duyệt cho danh mục");
assert.match(read("app/supplier/portal/products/new/page.tsx"), /certificateInheritanceByCategory/,
  "trang thêm sản phẩm nạp giấy thừa hưởng theo danh mục");
/* 7. Câu chữ ở cổng nhà cung cấp: cùng một giọng, không mã bước nội bộ, không nói AI. */
const documentsPage = read("app/supplier/portal/documents/page.tsx");
const uploadBox = read("app/supplier/portal/certificate-upload.tsx");
const portalCertForm = read("app/supplier/portal/products/product-certificates-form.tsx");
const uploadRoute = read("app/api/supplier-portal/certificates/route.ts");
/** Chuỗi tiếng Việt hiển thị trong file — bỏ qua chú thích và tên biến. */
function visibleStrings(src) {
  const vi = /[À-ỹ]/;
  const out = [];
  for (const match of src.matchAll(/"([^"\n]*)"|`([^`\n]*)`/g)) {
    const text = match[1] ?? match[2] ?? "";
    if (vi.test(text)) out.push(text);
  }
  return out;
}
for (const [name, src] of [
  ["trang Giấy tờ", documentsPage],
  ["ô tải ở trang Giấy tờ", uploadBox],
  ["khối chứng nhận ở trang sản phẩm", portalCertForm],
  ["API tải chứng nhận", uploadRoute],
]) {
  const showing = visibleStrings(src).filter((text) => /\bAI\b|\bL2\b/.test(text));
  assert.deepEqual(showing, [], `${name}: câu nhà cung cấp đọc không nhắc AI hay mã bước nội bộ`);
}
assert.match(uploadBox, /Gia hạn giấy đã có \(tùy chọn\)/, "ô tải ở trang Giấy tờ có chọn gia hạn");
assert.match(portalCertForm, /name="certificate_id"/, "ô tải ở trang sản phẩm gia hạn được ngay tại chỗ");
assert.match(portalCertForm, /Gia hạn giấy đã có \(tùy chọn\)/, "hai ô tải dùng cùng nhãn gia hạn");
assert.match(uploadBox, /Tên trên giấy \(không bắt buộc\)/, "ô tải gọi đúng tên trường nhập");
assert.match(portalCertForm, /Tên trên giấy \(không bắt buộc\)/, "hai ô tải gọi cùng tên trường");
assert.match(portalCertForm, /pendingUploads/, "giấy vừa tải hiện riêng là đang chờ phân loại");
assert.doesNotMatch(documentsPage, /review_note \|\| c\.ai_summary/, "không đưa ghi chú nội bộ cho nhà cung cấp đọc");
assert.match(documentsPage, /supplierCertificateNote/, "thẻ chứng nhận dùng câu trạng thái viết cho nhà cung cấp");

const { supplierCertificateNote } = loadTs("lib/certificate-supplier-copy.ts");
const today = "2026-10-31";
assert.equal(supplierCertificateNote({ review_status: "pending", publicly_visible: false, staff_hidden: false,
  valid_until: "2027-05-01", superseded_by_certificate_id: null }, today), "Đang chờ nhân viên đối chiếu.");
assert.equal(supplierCertificateNote({ review_status: "approved", publicly_visible: true, staff_hidden: false,
  valid_until: "2027-05-01", superseded_by_certificate_id: null }, today), "Đã duyệt và đang hiện với người mua.");
assert.match(supplierCertificateNote({ review_status: "approved", publicly_visible: true, staff_hidden: false,
  valid_until: "2026-01-01", superseded_by_certificate_id: null }, today), /hết hạn/);
assert.match(supplierCertificateNote({ review_status: "approved", publicly_visible: true, staff_hidden: false,
  valid_until: "2027-05-01", superseded_by_certificate_id: "cert-new" }, today), /Bản cũ/);
assert.match(supplierCertificateNote({ review_status: "approved", publicly_visible: true, staff_hidden: true,
  valid_until: "2027-05-01", superseded_by_certificate_id: null }, today), /tạm ẩn/);

/* 8. Cổng nhà cung cấp: chứng nhận chất lượng chỉ có một đường vào, và thẻ trống không
   được nói "đã đối chiếu xong". */
const policy = read("lib/supplier-portal/policy.ts");
assert.match(policy, /QUALITY_CERTIFICATE_DOC_KEYS = \["haccp_or_brc", "product_certs"\]/,
  "hai mục chứng nhận chất lượng được tách khỏi lưới giấy tờ");
assert.match(policy, /COMPANY_DOCUMENT_KEYS = INITIAL_DOCUMENT_KEYS\.filter/,
  "lưới giấy tờ chỉ còn giấy tờ doanh nghiệp");
assert.match(documentsPage, /COMPANY_DOCUMENT_KEYS\.map/, "trang giấy tờ dựng lưới từ danh sách giấy tờ doanh nghiệp");
assert.doesNotMatch(documentsPage, /INITIAL_DOCUMENT_KEYS\.map\(/,
  "không còn ô tải HACCP/chứng chỉ sản phẩm trong lưới");
assert.match(documentsPage, /legacyCertFiles/, "tệp chứng nhận tải theo luồng cũ vẫn xem lại được");
assert.match(documentsPage, /title=\{!latest \? "Chưa có tệp"/,
  "thẻ chưa có tệp không ghi Đã đối chiếu xong");
assert.match(documentsPage, /certificateMediaIds\.has\(latest\.id\)/,
  "thẻ giấy tờ nói rõ tệp đã vào kho chứng nhận");
assert.match(documentsPage, /L1_DOC_ITEMS\.filter\(\(item\) => \(INITIAL_DOCUMENT_KEYS as readonly string\[\]\)\.includes\(item\.key\)\)/,
  "bảng L1 bỏ hai mục khai tay (mã số thuế, số tài khoản)");
assert.match(documentsPage, /Mã số thuế và số tài khoản ngân hàng khai trong Hồ sơ doanh nghiệp/,
  "bảng L1 chỉ chỗ khai hai mục đó");
const profileEvidence = read("lib/supplier-portal/profile-evidence.ts");
assert.match(profileEvidence, /ingestCertificateScan\(\{/,
  "giấy chứng nhận nộp lúc đăng ký cũng vào kho chứng nhận");
assert.match(profileEvidence, /isL1CertificateKey\(key\)/, "chỉ giấy chứng nhận mới chạy bước phân loại");

const auditForm = read("app/crm/suppliers/[slug]/audit/[step]/audit-form.tsx");
assert.match(auditForm, /contributedChecklistKey/, "mục L1 nhận giấy theo loại đã chốt");
assert.match(auditForm, /checklistMismatch/, "cảnh báo khi loại giấy lệch mục checklist");
const approve = read("app/crm/suppliers/[slug]/audit/[step]/certificate-actions.ts");
assert.match(approve, /transferRenewalScope/, "duyệt bản gia hạn thì chuyển phạm vi");
const migration = read("supabase/migrations/20261076_certificate_scope_flow.sql");
assert.match(migration, /create table if not exists public\.certificate_scopes/);
assert.match(migration, /create table if not exists public\.product_certificate_optouts/);
assert.match(migration, /supersedes_certificate_id/);
assert.match(migration, /approved_product_ids/, "chuyển phạm vi cũ sang bảng phạm vi");
assert.doesNotMatch(migration, /update public\.certificates set certificate_scheme/i, "không tự chốt loại cho giấy cũ");
assert.match(read("supabase/schema.sql"), /certificate_scopes/, "schema gộp có bảng phạm vi");

console.log("✅ Phạm vi chứng nhận: thừa hưởng theo danh mục, opt-out trừ đúng 1, giấy pháp lý/theo lô không lên badge, hết hạn tự rơi, bản gia hạn giữ giấy cũ tới khi duyệt.");
