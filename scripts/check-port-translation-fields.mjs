import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeRequire = createRequire(import.meta.url);
const cache = new Map();

// Nạp module TS thật; chỉ thay server-only và lời gọi OpenAI.
function load(abs) {
  if (cache.has(abs)) return cache.get(abs).exports;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const js = ts.transpileModule(fs.readFileSync(abs, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const req = (id) => {
    if (id === "server-only") return {};
    if (id === "@/lib/ai/trade-glossary") return { glossaryInstructions: () => "" };
    if (id === "@/lib/ai/company-introduction") return { readOutputText: () => "" };
    const base = id.startsWith("@/") ? path.join(root, id.slice(2)) : id.startsWith(".") ? path.resolve(path.dirname(abs), id) : null;
    if (!base) return nativeRequire(id);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return load(candidate);
    }
    throw new Error(`missing ${id}`);
  };
  vm.runInThisContext(`(function (exports, require, module) {${js}\n})`)(mod.exports, req, mod);
  return mod.exports;
}

const translate = load(path.join(root, "lib/ai/translate-content.ts"));
const { publicProductExportPortDisplay } = load(path.join(root, "lib/public/product-export-port.ts"));
const { publicExportPortDisplay } = load(path.join(root, "lib/public/product-detail-display.ts"));

const product = {
  name: "Hạt điều W180", description: "", spec: "", description_detail: "", packaging: "", certifications: "",
  moq: "100kg", monthly_capacity: "100 tấn", payment_terms: "TT 70% cọc", raw_material_region: "Hồ Chí Minh",
  input_material_origin: "Đồng Nai", incoterm_place: "Đồng Nai", export_port: "Cảng Hiệp Phước Mới",
};
const translation = {
  name: "W180 cashew kernels", description: "", spec: "", description_detail: "", packaging: "", certifications: "",
  moq: "100 kg", monthly_capacity: "100 tons", payment_terms: "TT 70% deposit", raw_material_region: "Ho Chi Minh City",
  input_material_origin: "Dong Nai", incoterm_place: "Dong Nai", export_port: "New Hiep Phuoc Port",
};

// 1. Bản dịch mới lưu nội dung gốc của từng trường thương mại.
const patch = translate.productTranslationPatch(translation, product, "ai", "test-model");
assert.equal(patch.translation_meta.field_sources.export_port, "Cảng Hiệp Phước Mới", "Lưu cảng gốc lúc dịch");
assert.equal(patch.translation_meta.field_sources.moq, "100kg", "Lưu MOQ gốc lúc dịch");

const translated = { ...product, ...patch };
assert.equal(publicProductExportPortDisplay(translated), "New Hiep Phuoc Port", "Bản dịch còn mới thì dùng");

// 2. Đổi MOQ không làm mất bản dịch cảng: đây là lỗi đã khiến "Cảng Long Bình Tân" hiện tiếng Việt.
const moqChanged = { ...translated, moq: "1 kg" };
assert.notEqual(moqChanged.translation_meta.source_hash, translate.productSourceHash(moqChanged), "Cả sản phẩm đã lệch");
assert.equal(publicProductExportPortDisplay(moqChanged), "New Hiep Phuoc Port", "Cảng không đổi thì giữ bản dịch cảng");

// 3. Đổi chính cảng thì không dùng bản dịch cũ.
assert.equal(publicProductExportPortDisplay({ ...translated, export_port: "Cảng Hiệp Phước Cũ" }), "Cảng Hiệp Phước Cũ",
  "Cảng đã đổi thì không dùng bản dịch của cảng cũ");

// 4. Bản dịch cũ chưa có field_sources vẫn theo quy tắc cũ (cả sản phẩm phải khớp).
const legacyMeta = { ...translated.translation_meta };
delete legacyMeta.field_sources;
const legacy = { ...translated, translation_meta: legacyMeta };
assert.equal(publicProductExportPortDisplay(legacy), "New Hiep Phuoc Port", "Bản cũ còn khớp vẫn dùng");
assert.equal(publicProductExportPortDisplay({ ...legacy, moq: "1 kg" }), "Cảng Hiệp Phước Mới", "Bản cũ đã lệch giữ cảng gốc");

// 5. Cảng Long Bình Tân là cảng đã biết, hiện đúng tên tiếng Anh kể cả khi chưa có bản dịch.
assert.equal(publicExportPortDisplay("Cảng Long Bình Tân"), "Long Binh Tan Port");
assert.equal(publicExportPortDisplay("Long Binh Tan Port"), "Long Binh Tan Port");
assert.equal(publicExportPortDisplay("Cảng Chưa Biết"), "Cảng Chưa Biết", "Cảng lạ vẫn không bị đoán");

// 6. Migration chuẩn hoá MOQ không còn cắt số 0 của số nguyên; migration sửa dữ liệu có ghi audit.
const original = fs.readFileSync(path.join(root, "supabase/migrations/20261052_structured_units_and_moq.sql"), "utf8");
assert.doesNotMatch(original, /trim\(trailing '0'/, "Không dùng trim số 0 (biến 100 thành 1)");
assert.equal((original.match(/trim_scale\(p[cmk]\.qty\)::text/g) ?? []).length, 3, "Cả 3 nhánh MOQ dùng trim_scale");
const repair = fs.readFileSync(path.join(root, "supabase/migrations/20261122_repair_moq_text.sql"), "utf8");
assert.match(repair, /moq_unit in \('kg', 'mt'\)/, "Chỉ sửa đơn vị kg và MT");
assert.match(repair, /trim_scale\(moq_qty\)/, "Dựng lại chữ từ cột số moq_qty");
assert.match(repair, /insert into public\.audit_log/, "Mỗi dòng sửa đều có audit");

console.log("✅ Cảng tiếng Anh: giữ bản dịch khi chỉ trường khác đổi, Long Binh Tan Port đã biết, migration MOQ không cắt số 0.");
