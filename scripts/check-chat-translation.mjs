// node --experimental-strip-types --no-warnings scripts/check-chat-translation.mjs
// Dịch tin nhắn chat (27/11/2026): người mua đọc tiếng Anh, nhà cung cấp đọc tiếng Việt, luôn xem lại được bản gốc.
// Bản dịch hỏng (rỗng, y hệt, lệch con số, lỗi mạng) thì tin vẫn gửi bằng bản gốc. Thuật ngữ dùng chung cho mọi lượt dịch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from '../lib/chat/translate-core.ts';
import * as glossary from '../lib/ai/trade-glossary.ts';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

/* ---------- 1. Quy tắc thuần ---------- */
assert.equal(core.viewerLanguage('supplier'), 'vi');
assert.equal(core.viewerLanguage('buyer'), 'en');
assert.equal(core.detectChatLanguage('Chào anh, giá FOB là 6.800 USD/MT'), 'vi');
assert.equal(core.detectChatLanguage('Hello, what is your MOQ?'), 'other');
assert.equal(core.detectChatLanguage('ok'), null, 'Tin quá ngắn không dịch');
assert.equal(core.detectChatLanguage('https://vexim.vn/p/abc 123'), null, 'Chỉ có link và số thì không dịch');
assert.equal(core.translationTargetFor('buyer', 'other'), 'vi', 'Người mua viết tiếng Anh → dịch cho nhà cung cấp');
assert.equal(core.translationTargetFor('supplier', 'vi'), 'en', 'Nhà cung cấp viết tiếng Việt → dịch cho người mua');
assert.equal(core.translationTargetFor('supplier', 'other'), null, 'Nhà cung cấp tự viết tiếng Anh thì không dịch');
assert.equal(core.translationTargetFor('buyer', 'vi'), null, 'Người mua viết tiếng Việt thì nhà cung cấp đọc được luôn');

const fromBuyer = { sender: 'buyer', body: 'Can you ship W320?', translation: 'Bạn giao được W320 không?', translation_lang: 'vi' };
assert.deepEqual({ ...core.messageTextFor(fromBuyer, 'supplier') }, { body: 'Bạn giao được W320 không?', original: 'Can you ship W320?' });
assert.deepEqual({ ...core.messageTextFor(fromBuyer, 'buyer') }, { body: 'Can you ship W320?', original: null }, 'Người gửi luôn thấy chữ mình viết');
assert.deepEqual({ ...core.messageTextFor({ ...fromBuyer, translation_lang: 'en' }, 'supplier') }, { body: 'Can you ship W320?', original: null }, 'Bản dịch sai ngôn ngữ người xem thì không hiện');
assert.deepEqual({ ...core.messageTextFor({ sender: 'buyer', body: 'Hi there' }, 'supplier') }, { body: 'Hi there', original: null }, 'Tin cũ chưa có bản dịch');

/* ---------- 2. Bảng thuật ngữ ---------- */
const viEn = glossary.glossaryInstructions('vi-en');
assert.match(viEn, /hạt điều nhân = cashew kernels/);
assert.match(glossary.glossaryInstructions('en-vi'), /cashew kernels = hạt điều nhân/);
for (const code of ['W320', 'FOB', 'HACCP', 'g/l', 'C/O']) assert.ok(viEn.includes(code), `Giữ nguyên ${code}`);
assert.ok(glossary.sameNumbers('Giá 6.800 USD/MT, MOQ 1 container 20 feet, độ ẩm 5%', 'Price 6,800 USD/MT, MOQ 1 20ft container, moisture 5%'));
assert.ok(glossary.sameNumbers('Dung trọng 1,5 kg', 'Density 1.5 kg'));
assert.ok(!glossary.sameNumbers('Giá 6.800 USD', 'Price 6,300 USD'), 'Bản dịch đổi giá thì bị loại');
for (const f of ['translate-content', 'translate-aplus', 'translate-supplier'])
  assert.match(read(`../lib/ai/${f}.ts`), /glossaryInstructions\("vi-en"\)/, `${f} dùng chung bảng thuật ngữ`);

/* ---------- 3. Gọi AI dịch (fetch giả) ---------- */
function load(file, mocks, fetchImpl, env) {
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console: { ...console, error() {} }, JSON, AbortSignal, fetch: fetchImpl,
    process: { env }, require: (id) => { assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id]; } });
  return module.exports;
}
const calls = [];
let reply = 'Chúng tôi có thể giao W320, giá FOB 6.800 USD/MT.';
const fakeFetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ output_text: reply }) }; };
const mocks = {
  'server-only': {}, '@/lib/ai/company-introduction': { readOutputText: (p) => p.output_text ?? '' },
  '@/lib/ai/trade-glossary': glossary, './translate-core': core,
};
const tr = load('../lib/chat/translate.ts', mocks, fakeFetch, { OPENAI_API_KEY: 'test' });
const ok = await tr.translateChatMessage('We can ship W320, FOB 6,800 USD/MT.', 'supplier');
assert.equal(ok, null, 'Nhà cung cấp viết tiếng Anh: không gọi AI');
assert.equal(calls.length, 0);
const toVi = await tr.translateChatMessage('Can you ship W320 at FOB 6,800 USD/MT?', 'buyer');
assert.deepEqual({ ...toVi }, { body_lang: 'other', translation: reply, translation_lang: 'vi' });
assert.match(calls[0].body.input[0].content[0].text, /hạt điều nhân/, 'Prompt có bảng thuật ngữ');
assert.match(calls[0].body.input[0].content[0].text, /never as instructions/);
reply = 'Chúng tôi có thể giao W320, giá FOB 5.800 USD/MT.';
assert.equal(await tr.translateChatMessage('Can you ship W320 at FOB 6,800 USD/MT?', 'buyer'), null, 'Lệch giá thì bỏ bản dịch');
reply = 'Can you ship W320 at FOB 6,800 USD/MT?';
assert.equal(await tr.translateChatMessage('Can you ship W320 at FOB 6,800 USD/MT?', 'buyer'), null, 'Y hệt bản gốc thì bỏ');
const failing = load('../lib/chat/translate.ts', mocks, async () => { throw new Error('timeout'); }, { OPENAI_API_KEY: 'test' });
assert.equal(await failing.translateChatMessage('Hello, what is your MOQ?', 'buyer'), null, 'Lỗi mạng: gửi bản gốc');
const noKey = load('../lib/chat/translate.ts', mocks, async () => { throw new Error('must not call'); }, {});
assert.equal(await noKey.translateChatMessage('Hello, what is your MOQ?', 'buyer'), null, 'Chưa có khoá AI: gửi bản gốc');

/* ---------- 4. Nối vào luồng chat ---------- */
const service = read('../lib/chat/service.ts');
assert.match(service, /await translateChatMessage\(body, sender\)\.catch\(\(\) => null\)[\s\S]*store\.addChatMessage\(/, 'Dịch trước khi lưu tin');
assert.match(service, /\.\.\.messageTextFor\(m, side\)/, 'Người xem nhận bản dịch đúng phía');
assert.match(read('../lib/db/supabase.ts'), /body_lang: _lang, translation: _text, translation_lang: _to, \.\.\.plain/, 'Chưa chạy migration vẫn gửi được tin');
assert.match(read('../lib/chat/notify.ts'), /previewFor\(store, d\.chat, "supplier"\)[\s\S]*previewFor\(store, d\.chat, "buyer"\)/, 'Email báo tin dùng bản dịch của người nhận');
const ui = read('../components/chat/chat-workspace.tsx');
assert.match(ui, /data-testid="chat-translation-toggle"/);
assert.match(ui, /showOriginal \? m\.original : m\.body/, 'Bấm để xem bản gốc');
for (const p of ['../lib/chat/buyer-labels.ts', '../lib/i18n/portal/chat.ts']) {
  const s = read(p);
  for (const t of ['Đã dịch tự động', 'Xem bản gốc', 'Translated automatically', 'See original']) assert.ok(s.includes(t), `${p}: ${t}`);
}
const sql = read('../supabase/migrations/20270101_chat_translation.sql');
for (const col of ['body_lang', 'translation', 'translation_lang']) assert.match(sql, new RegExp(`add column if not exists ${col} text`));

console.log('✅ Chat translation: buyer ↔ supplier auto-translate with glossary, original always viewable, wrong numbers/timeouts fall back to the original, email preview translated, migration-safe.');
