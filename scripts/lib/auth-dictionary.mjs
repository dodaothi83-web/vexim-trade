// Nạp từ điển khu vực tài khoản cho các check chạy bằng VM.
//
// Các check này transpile từng file .tsx rồi chạy trong `node:vm` với require giả, nên
// không thể import thẳng module TS. Hàm dưới đây làm đúng việc đó cho `lib/i18n/auth.ts`
// để check so khớp chuỗi thật mà trang render, không phải chuỗi chép tay trong test.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

/** @returns {Record<'en' | 'vi', any>} */
export function loadAuthDictionary() {
  const file = new URL('../../lib/i18n/auth.ts', import.meta.url);
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(
    source,
    { module: mod, exports: mod.exports, require: (id) => { throw new Error(`auth.ts: unexpected import ${id}`); } },
    { filename: file.pathname },
  );
  return mod.exports.authMessages;
}
