// Exercise the real CRM delete action with shared submission/verification paths.
// No external storage or database is contacted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
const start = source.indexOf('export async function deleteMediaAction(');
const end = source.indexOf('\n}', start) + 2;
assert.ok(start >= 0 && end > start, 'CRM deletion action not found');
const compiled = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const files = new Set(['submission/original.pdf', 'submission/thumb.jpg', 'verification/unique.jpg']);
let failLookup = false;
let blockEdit = false;
const rows = [
  { id: 'source', owner_type: 'submission', storage_path: 'submission/original.pdf', thumb_path: 'submission/thumb.jpg' },
  { id: 'copied', owner_type: 'verification', verification_id: 'review', storage_path: 'submission/original.pdf', thumb_path: 'submission/thumb.jpg' },
  { id: 'unique', owner_type: 'verification', verification_id: 'review', storage_path: 'verification/unique.jpg', thumb_path: null },
];
const store = {
  getMedia: async (id) => rows.find((row) => row.id === id) ?? null,
  getVerification: async () => ({ id: 'review', status: 'in_progress' }),
  deleteMedia: async (id) => { const index = rows.findIndex((row) => row.id === id); if (index >= 0) rows.splice(index, 1); },
  getMediaByPath: async (path) => {
    if (failLookup) throw new Error('database unavailable');
    return rows.find((row) => row.storage_path === path || row.thumb_path === path) ?? null;
  },
};
const exported = {};
const run = new Function('exports', 'guard', 'getStore', 'verificationMediaEditError', 'logEvidenceChange', 'deleteObject', 'revalidateAll', 'console', compiled);
run(exported, async () => null, () => store, async () => blockEdit ? 'Đợt kiểm đã khóa.' : null, async () => {},
  async (path) => { files.delete(path); }, () => {}, { error() {} });

let result = await exported.deleteMediaAction('copied');
assert.equal(result.ok, true);
assert.ok(files.has('submission/original.pdf') && files.has('submission/thumb.jpg'), 'Deleting a verification copy must retain its supplier source');
assert.ok(rows.some((row) => row.id === 'source'));
result = await exported.deleteMediaAction('source');
assert.equal(result.ok, true);
assert.ok(!files.has('submission/original.pdf') && !files.has('submission/thumb.jpg'), 'Unreferenced files may be removed');

blockEdit = true;
result = await exported.deleteMediaAction('unique');
assert.equal(result.ok, false);
assert.ok(rows.some((row) => row.id === 'unique') && files.has('verification/unique.jpg'));
blockEdit = false;
failLookup = true;
result = await exported.deleteMediaAction('unique');
assert.equal(result.ok, true);
assert.ok(files.has('verification/unique.jpg'), 'When reference lookup fails, retain bytes instead of risking data loss');
console.log('✅ Shared L3 evidence: deleting an audit copy preserves supplier files; unknown references fail safe.');
