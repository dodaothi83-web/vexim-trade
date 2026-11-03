// Nạp `lib/i18n/format.ts` cho các check chạy bằng VM (nội suy `{key}` trong chuỗi mẫu).
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

export function loadFormat() {
  const file = new URL('../../lib/i18n/format.ts', import.meta.url);
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(
    source,
    { module: mod, exports: mod.exports, require: (id) => { throw new Error(`format.ts: unexpected import ${id}`); } },
    { filename: file.pathname },
  );
  return mod.exports;
}
