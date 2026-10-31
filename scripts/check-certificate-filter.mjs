// node scripts/check-certificate-filter.mjs — bộ lọc chứng nhận cho danh sách sản phẩm.
// Kiểm: loại chứng nhận đọc từ chính giấy, không lấy từ ô checklist L1; chỉ chứng nhận
// đã duyệt + công khai + còn hạn + gắn đúng sản phẩm mới vào bộ lọc; URL và số đếm đúng.
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

const schemes = loadTs("lib/certificate-scheme.ts");
const facets = loadTs("lib/public/certificate-facets.ts");

// 1. Loại chứng nhận đọc từ tên/tổ chức cấp trên giấy, không theo ô checklist.
const detect = schemes.detectCertificateScheme;
assert.equal(detect({ name: "Giấy chứng nhận HACCP Codex" }), "haccp");
assert.equal(detect({ name: "ISO 22000:2018 Food safety management" }), "iso_22000");
assert.equal(detect({ name: "ISO 9001:2015" }), "iso_9001", "ISO 9001 không bị nhầm với ISO 22000");
assert.equal(detect({ name: "FSSC 22000 certificate" }), "fssc_22000", "FSSC đứng trước ISO 22000");
assert.equal(detect({ name: "BRCGS Food Safety Issue 9" }), "brc");
assert.equal(detect({ name: "Halal Certificate", issuer: "HCA" }), "halal");
assert.equal(detect({ name: "EU Organic" }), "organic");
assert.equal(detect({ name: "FDA registration" }), "fda");
assert.equal(detect({ name: "Giấy chứng nhận an toàn thực phẩm" }), "food_safety");
assert.equal(detect({ name: "Giấy phép xuất khẩu số 123" }), "export_license");
assert.equal(detect({ name: "Certificate of Origin Form B" }), "origin");
assert.equal(detect({ name: "Giấy chứng nhận kiểm dịch thực vật" }), "phytosanitary");
assert.equal(detect({ name: "Giấy chứng nhận chung" }), null, "Không đoán khi giấy không nêu chuẩn");
assert.equal(detect({ name: null, issuer: null, number: null }), null);
assert.equal(schemes.isCertificateScheme("iso_22000"), true);
assert.equal(schemes.isCertificateScheme("iso 22000"), false);
assert.equal(schemes.certificateSchemeLabel("halal", "vi"), "Halal");
assert.equal(schemes.certificateSchemeLabel("food_safety", "vi"), "ATTP");
assert.equal(schemes.certificateSchemeLabel("bogus"), null);

// 2. Chỉ chứng nhận đã duyệt + công khai + còn hạn + gắn đúng sản phẩm mới vào bộ lọc.
const TODAY = "2026-10-31";
const base = {
  supplier_id: "s1", name: "Giấy", issuer: null, number: null, valid_until: "2027-01-01",
  file_media_id: "m1", review_status: "approved", publicly_visible: true, staff_hidden: false,
  holder_match: "owner", holder_name: "Nhà máy A", approved_product_ids: ["p1"],
};
const cert = (patch) => ({ ...base, ...patch });
const certificates = [
  cert({ id: "c-haccp", name: "HACCP Codex", certificate_scheme: "haccp", approved_product_ids: ["p1"] }),
  cert({ id: "c-iso", name: "ISO 22000", certificate_scheme: "iso_22000", approved_product_ids: ["p2"] }),
  cert({ id: "c-expired", name: "Halal", certificate_scheme: "halal", valid_until: "2026-01-01", approved_product_ids: ["p3"] }),
  cert({ id: "c-hidden", name: "Halal", certificate_scheme: "halal", staff_hidden: true, approved_product_ids: ["p4"] }),
  cert({ id: "c-pending", name: "Halal", certificate_scheme: "halal", review_status: "pending", publicly_visible: false, approved_product_ids: ["p5"] }),
  cert({ id: "c-unlinked", name: "HACCP", certificate_scheme: "haccp", approved_product_ids: ["px"] }),
  cert({ id: "c-null", name: "Chứng nhận chung", certificate_scheme: null, approved_product_ids: ["p7"] }),
  cert({ id: "c-other", name: "Chứng nhận khác", certificate_scheme: "other", approved_product_ids: ["p8"] }),
  cert({ id: "c-partner", supplier_id: "s2", name: "Halal nhà máy đối tác", certificate_scheme: "halal",
    holder_match: "partner", holder_name: "Nhà máy Chế biến Tây Nguyên", approved_product_ids: ["p6"] }),
  cert({ id: "c-wrong-supplier", supplier_id: "s9", name: "HACCP", certificate_scheme: "haccp", approved_product_ids: ["p1"] }),
];
const products = [
  { id: "p1", supplierId: "s1" }, { id: "p2", supplierId: "s1" }, { id: "p3", supplierId: "s1" },
  { id: "p4", supplierId: "s1" }, { id: "p5", supplierId: "s1" }, { id: "p6", supplierId: "s2" },
  { id: "p7", supplierId: "s1" }, { id: "p8", supplierId: "s1" }, { id: "p9", supplierId: "s1" },
];
const map = facets.certificateSchemesByProduct(products, certificates, [], TODAY);
const schemesOf = (id) => [...(map.get(id) ?? [])].sort().join(",");
assert.equal(schemesOf("p1"), "haccp", "Chứng nhận HACCP đã duyệt, còn hạn, gắn đúng sản phẩm");
assert.equal(schemesOf("p2"), "iso_22000");
assert.equal(schemesOf("p3"), "", "Giấy hết hạn không vào bộ lọc");
assert.equal(schemesOf("p4"), "", "Giấy bị nhân viên ẩn không vào bộ lọc");
assert.equal(schemesOf("p5"), "", "Giấy chưa duyệt không vào bộ lọc");
assert.equal(schemesOf("p9"), "", "Giấy chưa được gắn cho sản phẩm không vào bộ lọc");
assert.equal(schemesOf("p7"), "", "Chưa phân loại thì không vào bộ lọc");
assert.equal(schemesOf("p8"), "", "'Khác' không thành một mục lọc");
assert.equal(schemesOf("p6"), "halal", "Giấy đứng tên nhà máy đối tác đã công khai vẫn lọc được");
assert.equal(schemesOf("p1").includes("haccp") && schemesOf("p1").includes("halal"), false,
  "Chứng nhận của nhà cung cấp khác không lẫn sang sản phẩm");

// 3. Số đếm trên chip chỉ tính sản phẩm thật sự có loại đó.
const facetList = facets.buildCertificateFacets(map);
assert.deepEqual(facetList.map((f) => [f.code, f.count]), [["haccp", 1], ["iso_22000", 1], ["halal", 1]]);
assert.equal(facets.buildCertificateFacets(new Map()).length, 0, "Không có chứng nhận thì không hiện bộ lọc");

// 4. Lọc sản phẩm theo lựa chọn.
const picked = products.filter((p) => facets.productMatchesCertificateSchemes(map, p.id, ["haccp"]));
assert.deepEqual(picked.map((p) => p.id), ["p1"]);
const halal = products.filter((p) => facets.productMatchesCertificateSchemes(map, p.id, ["halal"]));
assert.deepEqual(halal.map((p) => p.id), ["p6"]);
assert.equal(products.filter((p) => facets.productMatchesCertificateSchemes(map, p.id, [])).length, products.length,
  "Không chọn gì thì trả toàn bộ danh sách");

// 5. URL của bộ lọc: đọc đúng, bỏ mã lạ, giữ thứ tự chuẩn và ổn định.
assert.deepEqual(facets.parseCertificateSchemeQuery("halal,haccp"), ["haccp", "halal"]);
assert.deepEqual(facets.parseCertificateSchemeQuery(["halal", "haccp"]), ["haccp", "halal"]);
assert.deepEqual(facets.parseCertificateSchemeQuery("haccp,bogus,other, haccp"), ["haccp"]);
assert.deepEqual(facets.parseCertificateSchemeQuery(null), []);
assert.deepEqual(facets.toggleCertificateScheme([], "halal"), ["halal"]);
assert.deepEqual(facets.toggleCertificateScheme(["halal"], "halal"), []);
assert.deepEqual(facets.toggleCertificateScheme(["haccp"], "halal"), ["haccp", "halal"]);
assert.equal(facets.certificateFilterHref("cashew", []), "/products/cashew");
assert.equal(facets.certificateFilterHref("cashew", ["haccp", "halal"]), "/products/cashew?cert=haccp,halal");

// 6. Nối dây giao diện và cửa ghi.
const page = fs.readFileSync(path.join(ROOT, "app/(public)/products/[slug]/page.tsx"), "utf8");
assert.match(page, /CertificateFacetChips/, "Trang danh mục có bộ lọc chứng nhận");
assert.match(page, /certificateSchemesByProduct/, "Bộ lọc dùng đúng nguồn chứng nhận đã kiểm");
assert.match(page, /parseCertificateSchemeQuery\(query\.cert\)/, "Đọc lựa chọn từ URL");
assert.match(page, /robots: \{ index: indexable && !filtered/, "Trang đã lọc không được index");
const chips = fs.readFileSync(path.join(ROOT, "components/certificate-facet-chips.tsx"), "utf8");
assert.match(chips, /aria-pressed/, "Chip cho biết trạng thái bật/tắt");
assert.match(chips, /Self-declared standards are not counted/, "Nói rõ không tính chứng nhận tự khai");
const facetSource = fs.readFileSync(path.join(ROOT, "lib/public/certificate-facets.ts"), "utf8");
assert.doesNotMatch(facetSource, /certifications/i, "Bộ lọc không đọc ô tự khai của sản phẩm");
const actions = fs.readFileSync(path.join(ROOT, "app/crm/suppliers/[slug]/audit/[step]/certificate-actions.ts"), "utf8");
assert.match(actions, /certificate\.scheme/, "Đổi loại chứng nhận có ghi audit");
assert.match(actions, /isCertificateScheme\(next\)/, "Chỉ nhận mã loại hợp lệ từ form");
const pdp = fs.readFileSync(path.join(ROOT, "app/(public)/products/[slug]/[productId]/page.tsx"), "utf8");
assert.match(pdp, /certificate\.schemeLabel/, "Trang sản phẩm hiện loại chứng nhận");

// 7. CSDL: danh sách mã trong migration phải trùng đúng bộ mã trong mã nguồn.
const migration = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261075_certificate_scheme.sql"), "utf8");
const listed = [...migration.matchAll(/'([a-z_0-9]+)'/g)].map((match) => match[1])
  .filter((code) => schemes.CERTIFICATE_SCHEMES.some((item) => item.code === code));
assert.deepEqual([...new Set(listed)].sort(), schemes.CERTIFICATE_SCHEMES.map((item) => item.code).sort(),
  "Ràng buộc SQL và danh sách mã trong mã nguồn phải khớp nhau");
assert.match(migration, /not valid/, "Không quét lại dữ liệu cũ");
assert.match(fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8"), /certificate_scheme text/,
  "Schema gộp có cột mới cho DB dựng mới");

console.log("✅ Bộ lọc chứng nhận: loại đọc từ giấy (không theo ô checklist), chỉ giấy đã duyệt–còn hạn–gắn sản phẩm, số đếm và URL đúng.");
