// node scripts/check-supplier-raw-material-profile.mjs
// Sourcing fields: native province suggestions, bounded writes, CRM whitelist and migration.
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
  defaultValue: "Vùng Tây Nguyên",
}));
assert.match(regionHtml, /<input/);
assert.match(regionHtml, /name="raw_material_region"/);
assert.match(regionHtml, /list="vietnam-provinces-/);
assert.match(regionHtml, /<datalist/);
assert.match(regionHtml, /maxLength="180"/);
assert.match(regionHtml, /value="Vùng Tây Nguyên"/);
assert.equal((regionHtml.match(/<option/g) ?? []).length, 34);
assert.doesNotMatch(regionHtml, /<select/, "A native text datalist must not block custom regions");

const profileInput = compile("lib/supplier-portal/profile-input.ts");
const form = new FormData();
for (const [key, value] of Object.entries({
  name: "Example Supplier", contact_name: "Contact", phone: "0900000000", products: "Cashew",
  supplier_type: "manufacturer", tax_number: "0123456789", consent: "yes", information_accuracy: "yes",
  raw_material_region: `  ${"v".repeat(181)}  `, input_material_origin: ` ${"o".repeat(301)} `,
})) form.set(key, value);
const parsed = profileInput.parseSupplierProfile(form).patch;
assert.equal(parsed.raw_material_region.length, 180);
assert.equal(parsed.input_material_origin.length, 300);
const optionalForm = new FormData();
for (const [key, value] of Object.entries({
  name: "Example Supplier", contact_name: "Contact", phone: "0900000000", products: "Cashew",
  supplier_type: "manufacturer", tax_number: "0123456789", consent: "yes", information_accuracy: "yes",
})) optionalForm.set(key, value);
const optional = profileInput.parseSupplierProfile(optionalForm).patch;
assert.equal(optional.raw_material_region, null, "Existing suppliers can leave sourcing fields empty");
assert.equal(optional.input_material_origin, null);

// Execute only the existing CRM parser, not the whole server-action module.
const actionsSource = read("app/actions.ts");
const parserStart = actionsSource.indexOf("function parseSupplierInput(");
const parserEnd = actionsSource.indexOf("/** Rebuild supplier industries", parserStart);
assert.ok(parserStart >= 0 && parserEnd > parserStart);
const parser = compile("app/actions.ts#parseSupplierInput", {}, {
  source: `const str = (v) => v == null ? null : String(v).trim() || null;
const num = (v) => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const bool = (v, fallback = false) => v == null ? fallback : v === true || v === "true" || v === "yes" || v === 1;
${actionsSource.slice(parserStart, parserEnd)}`,
  append: "\nmodule.exports = { parseSupplierInput };\n",
});
const parsedCrm = parser.parseSupplierInput({
  name: "Example", raw_material_region: "r".repeat(181), input_material_origin: "i".repeat(301),
});
assert.equal(parsedCrm.raw_material_region.length, 180, "CRM save keeps the raw-material field");
assert.equal(parsedCrm.input_material_origin.length, 300, "CRM save keeps the input-origin field");
assert.equal(parser.parseSupplierInput({ name: "Example" }).raw_material_region, null);

const migration = read("supabase/migrations/20261037_supplier_raw_material_profile.sql");
const schema = read("supabase/schema.sql");
for (const column of ["raw_material_region", "input_material_origin"]) {
  assert.match(migration, new RegExp(`add column if not exists ${column} text`));
  assert.match(schema, new RegExp(`add column if not exists ${column} text`));
}
assert.match(migration, /notify pgrst, 'reload schema'/i);
assert.doesNotMatch(migration, /set not null/i, "Migration must not invalidate existing supplier profiles");
const hints = compile("lib/db/migration-hints.ts");
assert.match(hints.migrationHint(new Error("Could not find the 'input_material_origin' column in the schema cache")),
  /20261037_supplier_raw_material_profile\.sql/);

for (const [path, needle] of [
  ["app/supplier/portal/supplier-profile-form.tsx", "RawMaterialRegionInput"],
  ["app/supplier/portal/profile/profile-edit-form.tsx", "name=\"input_material_origin\""],
  ["components/supplier-form.tsx", "RawMaterialRegionInput"],
  ["app/crm/suppliers/[slug]/page.tsx", "supplier.input_material_origin"],
  ["components/public/supplier-storefront.tsx", "Raw material region"],
  ["components/public/product-comparison-table.tsx", "Input material origin"],
  ["app/(public)/compare/page.tsx", "supplierRawMaterialRegionEnglishDisplay"],
  ["app/(public)/products/[slug]/[productId]/page.tsx", "card.rawMaterialRegion"],
]) assert.ok(read(path).includes(needle), `${path} is connected to the sourcing fields`);

console.log("✅ Supplier raw-material profile: 34 province suggestions, custom input, bounded CRM/portal saves and nullable migration.");
