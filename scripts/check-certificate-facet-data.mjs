// node scripts/check-certificate-facet-data.mjs — cách trang danh mục đọc dữ liệu cho bộ lọc.
// Kiểm: gộp lượt đọc thay vì 4 lượt mỗi nhà cung cấp, chỉ đọc tệp cho nhà cung cấp có giấy,
// store cũ vẫn chạy được, lỗi đọc chỉ làm bộ lọc trống, và dữ liệu trả về đi thẳng vào
// certificateSchemesByProduct → chip đúng như trước.
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

const loader = loadTs("lib/public/category-certificate-data.ts");
const facets = loadTs("lib/public/certificate-facets.ts");
const readData = loader.readCategoryCertificateData;

/* ---------------- Dữ liệu thử ---------------- */

const TODAY = "2026-10-31";
const certificate = (id, supplier_id, patch = {}) => ({
  id, supplier_id, name: "HACCP Codex", issuer: null, number: null, valid_until: "2027-01-01",
  file_media_id: `file-${id}`, review_status: "approved", publicly_visible: true, staff_hidden: false,
  holder_match: "owner", holder_name: "Nhà máy A", certificate_scheme: "haccp",
  approved_product_ids: [], ...patch,
});
const media = (id, supplier_id) => ({
  id, supplier_id, owner_type: "supplier", audience: "internal", storage_path: `supplier-media/${supplier_id}/${id}.webp`,
});

const certificates = [certificate("c1", "s1"), certificate("c2", "s2")];
const mediaRows = [media("file-c1", "s1"), media("file-c2", "s2")];
const scopes = [{ id: "sc1", certificate_id: "c1", product_id: "p1", category_id: null, verified_by: "u1", verified_at: TODAY }];
const optouts = [];
const suppliers = ["s1", "s2", "s3", "s4", "s5", "s6"];

/** Store có hàm gộp; ghi lại từng lượt đọc để đếm. */
function bulkStore(calls) {
  return {
    listCertificatesForSuppliers: async (ids) => { calls.push(["certs", ids]); return certificates; },
    listCertificates: async (id) => { calls.push(["certsOne", id]); return certificates.filter((c) => c.supplier_id === id); },
    listMedia: async (type, id) => { calls.push(["media", type, id]); return mediaRows.filter((m) => m.supplier_id === id); },
    listCertificateScopes: async (ids) => { calls.push(["scopes", ids]); return scopes; },
    listCertificateOptoutsForSuppliers: async (ids) => { calls.push(["optouts", ids]); return optouts; },
    listCertificateOptouts: async (id) => { calls.push(["optoutsOne", id]); return optouts; },
  };
}

/* ---------------- 1. Gộp lượt đọc ---------------- */

const calls = [];
const data = await readData(bulkStore(calls), suppliers);
assert.equal(calls.length, 5,
  `6 nhà cung cấp tốn 5 lượt đọc (1 giấy, 2 tệp, 1 phạm vi, 1 opt-out), không phải 24 — thực tế ${calls.length}`);
assert.deepEqual(calls[0], ["certs", suppliers], "Giấy của mọi nhà cung cấp đọc một lượt");
assert.ok(!calls.some(([kind]) => kind === "certsOne"), "Không còn đọc giấy từng nhà cung cấp");
assert.deepEqual(calls.filter(([kind]) => kind === "media").map(([, , id]) => id), ["s1", "s2"],
  "Chỉ đọc tệp cho nhà cung cấp thật sự có giấy");
assert.deepEqual(calls.find(([kind]) => kind === "scopes")[1], ["c1", "c2"], "Phạm vi đọc một lượt theo đúng các giấy");
assert.deepEqual(calls.find(([kind]) => kind === "optouts")[1], ["s1", "s2"], "Opt-out đọc một lượt cho nhà cung cấp có giấy");
assert.deepEqual(data.certificates.map((c) => c.id), ["c1", "c2"]);
assert.deepEqual(data.scopes.map((s) => s.id), ["sc1"]);
assert.deepEqual(data.media.map((m) => m.id), ["file-c1", "file-c2"]);

/* ---------------- 2. Store cũ không có hàm gộp ---------------- */

const legacyCalls = [];
const legacy = {
  listCertificates: async (id) => { legacyCalls.push(["certsOne", id]); return certificates.filter((c) => c.supplier_id === id); },
  listMedia: async (type, id) => { legacyCalls.push(["media", type, id]); return mediaRows.filter((m) => m.supplier_id === id); },
  listCertificateScopes: async (ids) => { legacyCalls.push(["scopes", ids]); return scopes; },
  listCertificateOptouts: async (id) => { legacyCalls.push(["optoutsOne", id]); return optouts; },
};
const legacyData = await readData(legacy, suppliers);
assert.deepEqual(legacyData.certificates.map((c) => c.id), ["c1", "c2"], "Store cũ vẫn ra đúng giấy");
assert.deepEqual(legacyData.scopes.map((s) => s.id), ["sc1"]);
assert.deepEqual(legacyCalls.filter(([kind]) => kind === "certsOne").map(([, id]) => id), suppliers,
  "Không có hàm gộp thì lùi về đọc từng nhà cung cấp");

/* ---------------- 3. Lỗi đọc chỉ làm bộ lọc trống ---------------- */

const broken = {
  listCertificatesForSuppliers: async () => { throw new Error("mất kết nối"); },
  listMedia: async () => { throw new Error("mất kết nối"); },
  listCertificateScopes: async () => { throw new Error("mất kết nối"); },
  listCertificateOptoutsForSuppliers: async () => { throw new Error("mất kết nối"); },
};
const brokenData = await readData(broken, suppliers);
assert.deepEqual(brokenData, { certificates: [], media: [], scopes: [], optouts: [] },
  "Đọc lỗi thì trang danh mục không có chip, không ném lỗi");

const halfBroken = {
  listCertificatesForSuppliers: async () => certificates,
  listMedia: async () => { throw new Error("mất kết nối"); },
  listCertificateScopes: async () => [],
  listCertificateOptoutsForSuppliers: async () => [],
};
const halfData = await readData(halfBroken, suppliers);
assert.equal(halfData.certificates.length, 2, "Tệp lỗi không làm mất danh sách giấy");
assert.equal(halfData.media.length, 0);

/* ---------------- 4. Danh sách rỗng ---------------- */

const idle = [];
await readData(bulkStore(idle), []);
assert.deepEqual(idle, [], "Danh mục không có sản phẩm thì không đọc gì");
await readData(bulkStore(idle), ["", "  ", ""]);
assert.deepEqual(idle, [], "Mã nhà cung cấp rỗng bị bỏ trước khi đọc");
await readData(bulkStore(idle), ["s1", "s1", "s1"]);
assert.deepEqual(idle[0], ["certs", ["s1"]], "Nhà cung cấp trùng nhau chỉ đọc một lần");

/* ---------------- 5. Dữ liệu vừa đọc đi thẳng vào bộ lọc ---------------- */

const products = [
  { id: "p1", supplierId: "s1", categoryId: "cashew" },
  { id: "p2", supplierId: "s2", categoryId: "cashew" },
  { id: "p3", supplierId: "s3", categoryId: "cashew" },
];
const map = facets.certificateSchemesByProduct(products, data.certificates, data.media, TODAY,
  { scopes: data.scopes, optouts: data.optouts, });
assert.deepEqual([...(map.get("p1") ?? [])], ["haccp"], "Giấy có phạm vi theo sản phẩm vẫn lên chip");
assert.equal(map.get("p3"), undefined, "Nhà cung cấp không có giấy thì không có chip");
assert.deepEqual(facets.buildCertificateFacets(map).map((facet) => [facet.code, facet.count]), [["haccp", 1]],
  "Số trên chip tính trên dữ liệu vừa đọc");

/* ---------------- 6. Trang danh mục dùng đúng hàm này ---------------- */

const page = fs.readFileSync(path.join(ROOT, "app/(public)/products/[slug]/page.tsx"), "utf8");
assert.match(page, /readCategoryCertificateData\(getStore\(\), products\.map\(\(product\) => product\.supplierId\)\)/,
  "Trang danh mục đọc dữ liệu chứng nhận bằng hàm gộp, một lần cho cả danh mục");
assert.doesNotMatch(page, /store\.listCertificates\(supplierId\)/,
  "Trang danh mục không còn tự đọc giấy từng nhà cung cấp");
assert.match(page, /buildCertificateFacets\(schemesByProduct\)/, "Chip vẫn dựng từ dữ liệu đã qua cổng công khai");
assert.match(page, /categoryCertificateData|readCategoryCertificateData/, "Trang dùng chung một nguồn dữ liệu");

console.log("✅ Dữ liệu bộ lọc chứng nhận: gộp lượt đọc theo nhà cung cấp có giấy, store cũ vẫn chạy, lỗi đọc không làm hỏng trang.");
