// node scripts/check-product-raw-material-profile.mjs
// Product-owned sourcing fields: native province suggestions, bounded writes, CRM/portal wiring and migration.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function compile(path, mocks = {}, { jsx = false, append = "", source = null } = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule((source ?? read(path)) + append, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, require: (key) => {
      assert.ok(key in mocks, `Unexpected import ${key} in ${path}`);
      return mocks[key];
    },
    React, FormData, Date, String, Number, Boolean, Object, Array, RegExp, Error, JSON,
    console, process,
  }, { filename: path });
  return module.exports;
}

const provinces = compile("lib/vietnam-provinces.ts").VIETNAM_PROVINCE_SUGGESTIONS;
assert.equal(provinces.length, 34, "Suggest all 34 current province-level units");
assert.equal(new Set(provinces).size, 34);
for (const name of ["Hà Nội", "Hồ Chí Minh", "Huế", "Lâm Đồng", "Đắk Lắk"]) assert.ok(provinces.includes(name));

const regionInput = compile("components/raw-material-region-input.tsx", {
  react: React,
  "react/jsx-runtime": require("react/jsx-runtime"),
  "@/lib/vietnam-provinces": { VIETNAM_PROVINCE_SUGGESTIONS: provinces },
}, { jsx: true });
const regionHtml = renderToStaticMarkup(React.createElement(regionInput.RawMaterialRegionInput, {
  defaultValue: "Vùng Tây Nguyên", disabled: true,
}));
assert.match(regionHtml, /<input/);
assert.match(regionHtml, /name="raw_material_region"/);
assert.match(regionHtml, /list="vietnam-provinces-/);
assert.match(regionHtml, /<datalist/);
assert.match(regionHtml, /maxLength="180"/);
assert.match(regionHtml, /value="Vùng Tây Nguyên"/);
assert.match(regionHtml, /disabled=""/, "Pending supplier products keep the sourcing input locked");
assert.equal((regionHtml.match(/<option/g) ?? []).length, 34);
assert.doesNotMatch(regionHtml, /<select/, "A native text datalist must not block custom regions");

// Execute only the existing CRM product parser, not the whole server-action module.
const actionsSource = read("app/actions.ts");
const crmStart = actionsSource.indexOf("function parseProductInput(");
const crmEnd = actionsSource.indexOf("function priceRangeInputError", crmStart);
assert.ok(crmStart >= 0 && crmEnd > crmStart);
const crmParser = compile("app/actions.ts#parseProductInput", {}, {
  source: `const str = (v) => v == null ? null : String(v).trim() || null;
const num = (v) => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const bool = (v, fallback = false) => v == null ? fallback : v === true || v === "true" || v === "yes" || v === 1;
const displayNameInput = (v) => str(v)?.slice(0, 120) ?? null;
${actionsSource.slice(crmStart, crmEnd)}`,
  append: "\nmodule.exports = { parseProductInput };\n",
});
const parsedCrm = crmParser.parseProductInput({
  name: "Example product", raw_material_region: ` ${"r".repeat(181)} `, input_material_origin: ` ${"i".repeat(301)} `,
});
assert.equal(parsedCrm.raw_material_region.length, 180, "CRM product save keeps and bounds the raw-material field");
assert.equal(parsedCrm.input_material_origin.length, 300, "CRM product save keeps and bounds the input-origin field");
assert.equal(crmParser.parseProductInput({ name: "Example product" }).raw_material_region, null);
assert.equal(crmParser.parseProductInput({ name: "Example product" }).input_material_origin, null);

// Execute the supplier-portal product parser with the same small text helper used by the module.
const portalSource = read("app/supplier/portal/product-actions.ts");
const portalStart = portalSource.indexOf("function parseProduct(");
const portalEnd = portalSource.indexOf("async function approvedAccess", portalStart);
assert.ok(portalStart >= 0 && portalEnd > portalStart);
const portalParser = compile("app/supplier/portal/product-actions.ts#parseProduct", {}, {
  source: `const text = (form, key, max = 500) => String(form.get(key) ?? "").trim().slice(0, max);
${portalSource.slice(portalStart, portalEnd)}`,
  append: "\nmodule.exports = { parseProduct };\n",
});
const portalForm = new FormData();
portalForm.set("name", "Example product");
portalForm.set("raw_material_region", ` ${"v".repeat(181)} `);
portalForm.set("input_material_origin", ` ${"o".repeat(301)} `);
const parsedPortal = portalParser.parseProduct(portalForm, "supplier-1");
assert.equal(parsedPortal.raw_material_region.length, 180);
assert.equal(parsedPortal.input_material_origin.length, 300);
const optionalPortalForm = new FormData();
optionalPortalForm.set("name", "Example product");
const optionalPortal = portalParser.parseProduct(optionalPortalForm, "supplier-1");
assert.equal(optionalPortal.raw_material_region, null, "Existing products can leave sourcing fields empty");
assert.equal(optionalPortal.input_material_origin, null);

const migration = read("supabase/migrations/20261037_product_raw_material_profile.sql");
const schema = read("supabase/schema.sql");
for (const column of ["raw_material_region", "input_material_origin"]) {
  assert.match(migration, new RegExp(`add column if not exists ${column} text`));
  assert.match(schema, new RegExp(`add column if not exists ${column} text`));
}
assert.match(migration, /alter table public\.supplier_products/);
assert.doesNotMatch(migration, /alter table public\.suppliers\b/, "Product sourcing must not be added to the supplier table");
assert.match(migration, /notify pgrst, 'reload schema'/i);
assert.doesNotMatch(migration, /set not null/i, "Migration must not invalidate existing products");
const hints = compile("lib/db/migration-hints.ts");
assert.match(hints.migrationHint(new Error("Could not find the 'input_material_origin' column in the schema cache")),
  /20261037_product_raw_material_profile\.sql/);

for (const [path, needle] of [
  ["components/product-form.tsx", "RawMaterialRegionInput"],
  ["app/crm/products/[slug]/page.tsx", "product.input_material_origin"],
  ["app/supplier/portal/products/product-editor.tsx", "RawMaterialRegionInput"],
  ["app/supplier/portal/products/product-editor.tsx", "snapshot.input_material_origin"],
  ["app/crm/products/[slug]/edit/translation-panel.tsx", "key: \"raw_material_region\""],
  ["lib/ai/product-translation-service.ts", "raw_material_region: p.raw_material_region"],
  ["lib/public/product-catalog.ts", "tradeEnglish?.raw_material_region"],
  ["components/public/product-comparison-table.tsx", "Input material origin"],
  ["app/(public)/products/[slug]/[productId]/page.tsx", "card.rawMaterialRegion"],
]) assert.ok(read(path).includes(needle), `${path} is connected to product sourcing fields`);

// No duplicate supplier-level ownership or buyer-facing supplier rows remains.
for (const path of [
  "components/supplier-form.tsx",
  "app/supplier/portal/supplier-profile-form.tsx",
  "app/supplier/portal/profile/profile-edit-form.tsx",
  "app/supplier/portal/profile/page.tsx",
  "app/crm/suppliers/[slug]/page.tsx",
  "components/public/supplier-storefront.tsx",
  "app/(public)/compare/page.tsx",
  "lib/ai/translate-supplier.ts",
  "lib/public/supplier-english.ts",
]) assert.doesNotMatch(read(path), /raw_material_region|input_material_origin|Raw material region|Input material origin/,
  `${path} must not retain supplier-level sourcing fields`);

console.log("✅ Product raw-material profile: 34 province suggestions, custom input, product-owned CRM/portal saves and nullable migration.");
