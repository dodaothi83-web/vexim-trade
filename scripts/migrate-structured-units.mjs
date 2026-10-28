// Migration & audit script for structured units & MOQ:
//   node --experimental-strip-types --no-warnings scripts/migrate-structured-units.mjs          (apply on data/local-db.json)
//   node --experimental-strip-types --no-warnings scripts/migrate-structured-units.mjs --dry-run (report only)

import fs from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";

function compileTs(relPath, mocks = {}) {
  const url = new URL(relPath, import.meta.url);
  let code = stripTypeScriptTypes(fs.readFileSync(url, "utf8"), { mode: "transform" });
  const exported = [];
  code = code
    .replace(/import\s+type\s+[^;]+;\n?/g, "")
    .replace(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];?/g, (_, names, spec) => {
      const mapped = names
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => !s.startsWith("type "))
        .map((s) => s.replace(/\s+as\s+/, ": "))
        .join(", ");
      return mapped ? `const { ${mapped} } = require(${JSON.stringify(spec)});` : "";
    })
    .replace(/export\s+async\s+function\s+(\w+)/g, (_, name) => {
      exported.push(name);
      return `async function ${name}`;
    })
    .replace(/export\s+function\s+(\w+)/g, (_, name) => {
      exported.push(name);
      return `function ${name}`;
    })
    .replace(/export\s+const\s+(\w+)/g, (_, name) => {
      exported.push(name);
      return `const ${name}`;
    });
  code += `\nmodule.exports = { ${exported.join(", ")} };`;
  const mod = { exports: {} };
  vm.runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: (spec) => {
      if (spec in mocks) return mocks[spec];
      throw new Error(`Unexpected import ${spec} in ${relPath}`);
    },
    Intl,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    JSON,
    Date,
    Error,
  });
  return mod.exports;
}

const priceUnits = compileTs("../lib/public/price-units.ts");
const gradeResolution = compileTs("../lib/public/grade-resolution.ts");
const gradePricing = compileTs("../lib/products/grade-pricing.ts", {
  "@/lib/public/price-units": priceUnits,
  "@/lib/public/grade-resolution": gradeResolution,
});

const dryRun = process.argv.includes("--dry-run");
const dbPath = new URL("../data/local-db.json", import.meta.url);
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));

const supplierById = new Map((db.suppliers ?? []).map((s) => [s.id, s]));
const categoryBySlug = new Map((db.categories ?? []).map((c) => [c.slug, c]));

const convertedItems = [];
const manualReviewItems = [];

for (const product of db.products ?? []) {
  const supplierName = supplierById.get(product.supplier_id)?.name ?? product.supplier_id;
  const catSlug = product.reviewed_category_slug ?? product.supplier_category_proposal ?? product.category ?? "";
  const category = catSlug ? (categoryBySlug.get(catSlug) ?? { slug: catSlug }) : null;
  let changed = false;

  // 1. Migrate grade_rows MOQs if present
  if (product.specs && Array.isArray(product.specs.grade_rows) && product.specs.grade_rows.length > 0) {
    for (const row of product.specs.grade_rows) {
      if (!row || typeof row !== "object") continue;
      if (!(typeof row.moq_qty === "number" && row.moq_qty > 0 && gradePricing.isMoqUnit(row.moq_unit))) {
        const parsed = gradePricing.parseLegacyMoqString(row.moq);
        if (parsed.status === "converted") {
          const before = row.moq;
          row.moq = parsed.buyerText;
          row.moq_qty = parsed.qty;
          row.moq_unit = parsed.unit;
          row.moq_unit_weight_kg = parsed.unitWeightKg;
          row.moq_mt_equivalent = parsed.mtEquivalent;
          changed = true;
          convertedItems.push({
            id: product.id,
            name: product.name,
            supplier: supplierName,
            before,
            after: parsed.buyerText,
          });
        }
      }
    }
    const firstRow = product.specs.grade_rows.find((r) => r && (r.moq || (r.moq_qty && r.moq_unit)));
    if (firstRow && firstRow.moq_qty && firstRow.moq_unit) {
      product.moq = firstRow.moq;
      product.moq_qty = firstRow.moq_qty;
      product.moq_unit = firstRow.moq_unit;
    }
  } else if (!(typeof product.moq_qty === "number" && product.moq_qty > 0 && gradePricing.isMoqUnit(product.moq_unit))) {
    // 2. Migrate top-level product MOQ
    const parsed = gradePricing.parseLegacyMoqString(product.moq);
    if (parsed.status === "converted") {
      const before = product.moq;
      product.moq = parsed.buyerText;
      product.moq_qty = parsed.qty;
      product.moq_unit = parsed.unit;
      if (parsed.unitWeightKg !== null) {
        product.specs = { ...(product.specs ?? {}), moq_unit_weight_kg: parsed.unitWeightKg };
      }
      changed = true;
      convertedItems.push({
        id: product.id,
        name: product.name,
        supplier: supplierName,
        before,
        after: parsed.buyerText,
      });
    }
  }

  // 3. Mirror structured lead_time in specs when lead_time_days is present
  if (typeof product.lead_time_days === "number" && product.lead_time_days > 0) {
    if (!product.specs || typeof product.specs !== "object" || !product.specs.lead_time) {
      product.specs = {
        ...(product.specs ?? {}),
        lead_time: { value: product.lead_time_days, unit: "days" },
      };
      changed = true;
    }
  }

  const audit = gradePricing.auditProductStructuredUnits(product, category);
  if (audit.needsReview) {
    manualReviewItems.push({
      id: product.id,
      supplier: supplierName,
      name: product.name,
      category: catSlug || "(chưa gán)",
      rawMoq: product.moq ?? "",
      rawPrice: product.ref_price != null ? `${product.currency ?? "USD"} ${product.ref_price}/${product.unit ?? "?"}` : "-",
      reasons: audit.reasons,
    });
  }
  void changed;
}

if (!dryRun) {
  fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

console.log(`=== KẾT QUẢ CHUYỂN ĐỔI ĐƠN VỊ TỰ ĐỘNG (${dryRun ? "DRY RUN" : "APPLIED"}) ===`);
console.log(`Tổng sản phẩm kiểm tra: ${(db.products ?? []).length}`);
console.log(`Đã chuyển tự động MOQ sang chuẩn mới: ${convertedItems.length}`);
for (const item of convertedItems) {
  console.log(`  [OK] ${item.id} | ${item.name} (${item.supplier}): "${item.before}" -> "${item.after}"`);
}
console.log(`\nCần rà soát & sửa tay (${manualReviewItems.length} sản phẩm):`);
for (const item of manualReviewItems) {
  console.log(`  [CẦN SỬA TAY] ${item.id} | ${item.name} (${item.supplier}) | Danh mục: ${item.category} | MOQ: "${item.rawMoq}" | Giá: ${item.rawPrice}`);
  for (const reason of item.reasons) {
    console.log(`     -> ${reason}`);
  }
}
