import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const realRequire = createRequire(import.meta.url);

function loadTs(path, mocks = {}) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod,
    exports: mod.exports,
    console,
    Date,
    process,
    require: (id) => {
      if (id === "sanitize-html") return realRequire(id);
      if (id === "server-only") return {};
      if (!(id in mocks)) throw new Error(`Unexpected import ${id} in ${path}`);
      return mocks[id];
    },
  }, { filename: String(path) });
  return mod.exports;
}

/** Load the real sanitizer for action and translation regression harnesses. */
export function loadProductDescription() {
  const formatPath = new URL("../lib/products/product-description-format.ts", import.meta.url);
  const descriptionPath = new URL("../lib/products/product-description.ts", import.meta.url);
  const format = loadTs(formatPath);
  const description = loadTs(descriptionPath, { "./product-description-format": format });
  return { description, format };
}
