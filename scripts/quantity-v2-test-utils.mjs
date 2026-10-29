import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as pricing from '../lib/products/quantity-pricing.ts';
import * as revision from '../lib/products/quantity-revision-v2.ts';
function load(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, process, console, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
  return exports;
}
const entry = load('../lib/products/quantity-entry.ts', { '@/lib/products/quantity-pricing': pricing });
export const v2Validation = load('../lib/products/quantity-v2-validation.ts', { '@/lib/products/quantity-entry': entry, '@/lib/products/quantity-revision-v2': revision });
export { revision };
