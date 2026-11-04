// Load the actual approved React vectors for VM-based SSR checks. Do not mock their shapes.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../components/brand/vexim-icons.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  module: mod, exports: mod.exports,
  require(id) {
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime') return jsx;
    throw Error(`Unexpected icon dependency: ${id}`);
  },
});
export const brandIcons = mod.exports;
