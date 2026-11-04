// Generate the review page from the real React artwork, not a second hand-maintained drawing.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/brand/vexim-shield.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { module: mod, exports: mod.exports, require(id) {
  if (id === 'react') return React;
  if (id === 'react/jsx-runtime') return jsx;
  throw Error(id);
} });
const icon = (size, variant = 'compact') => renderToStaticMarkup(React.createElement(mod.exports.VeximShieldIcon, { size, variant }));
for (const variant of ['compact', 'duotone']) {
  const svg = icon(24, variant);
  assert.match(svg, /fill-rule="evenodd"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.doesNotMatch(svg, /<image|<use|<script|\bid=/);
  fs.writeFileSync(`public/brand/vexim/shield-${variant}.svg`, svg+'\n');
}
const sizes = [10, 12, 16, 20, 24, 48];
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Khiên Vexim — mẫu duyệt</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f6f9;color:#24324a;font:15px/1.6 system-ui,sans-serif}main{max-width:980px;margin:auto;padding:48px 24px}h1{font-size:34px;line-height:1.2;letter-spacing:-1px;color:#1f3e74}h2{font-size:18px}p{max-width:700px;color:#59677c}.card{background:white;border:1px solid #e2e7ee;border-radius:20px;padding:28px;margin:20px 0}.row{display:flex;gap:32px;align-items:center;flex-wrap:wrap;color:#1f3e74}.sample{display:flex;flex-direction:column;gap:12px;align-items:center}.sample span{font-size:12px;color:#778398}.pip{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;border:1px solid #9cabbc;background:#f3f5f8;color:#68788d}.on{border-color:#0e7a4e;background:#eaf6ef;color:#0e7a4e}.dark{background:#152b4e;color:#fff}.dark p{color:#c4d0e2}.dark .row{color:#fff}.tag{display:inline-block;padding:4px 12px;border-radius:20px;background:#e9eef7;color:#1f3e74;font-size:12px}.status{display:flex;align-items:center;gap:10px}.large{display:flex;align-items:center;gap:24px}.muted{font-size:13px}
</style><main><span class="tag">Mẫu chờ duyệt · Chưa thay khiên đang dùng</span><h1>Khiên riêng của Vexim</h1><p>Dáng bo mềm, chữ V bằng khoảng âm xuyên nền thật. Không có dấu tick cố định. Chữ V là hoạ tiết nhận diện mới, không thay thế logo V gốc.</p>
<section class="card"><h2>01 · Bản tối giản</h2><p>Ít chi tiết, ưu tiên đọc rõ trong huy hiệu nhỏ.</p><div class="row">${sizes.map(n=>`<div class="sample">${icon(n)}<span>${n}px</span></div>`).join('')}</div></section>
<section class="card"><h2>02 · Bản duotone</h2><div class="large row">${icon(80,'duotone')}${icon(48,'duotone')}${icon(24,'duotone')}</div><p>Nền phụ trong cùng tông màu, không bóng đổ hoặc hiệu ứng kim loại.</p></section>
<section class="card"><h2>03 · Trong huy hiệu tròn</h2><div class="row"><div class="status"><span class="pip">${icon(12)}</span>Chưa có bước được duyệt</div><div class="status"><span class="pip on">${icon(12)}</span>Bước đã duyệt — ví dụ minh hoạ</div></div><p class="muted">Giữ vòng tròn, viền và nền. Trạng thái do dữ liệu xác minh quyết định, không do bản thân hình khiên.</p></section>
<section class="card dark"><h2>04 · Trên nền tối</h2><div class="row">${icon(16)}${icon(24)}${icon(48,'duotone')}</div><p>Khoảng âm chữ V hiện đúng màu nền, không có mảng trắng cố định.</p></section><p class="muted">Tất cả trạng thái trên trang này chỉ để xem thiết kế, không phải thông tin xác minh doanh nghiệp thực tế.</p></main></html>`;
fs.writeFileSync('docs/brand-preview/shield.html', html);
console.log('Shield preview generated from real React source; exports and negative-space checks passed.');
