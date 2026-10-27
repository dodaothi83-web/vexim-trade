// node scripts/check-supplier-storage-cleanup.mjs
// Ensure Storage errors do not silently turn failed remote cleanup into success.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync(new URL('../lib/media/storage.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function load({ configured, fallback, remove }) {
  const localRemoved = [];
  const mod = { exports: {} };
  const mocks = {
    'server-only': {},
    'node:fs/promises': { rm: async (p) => localRemoved.push(p) },
    'node:path': path,
    '@/lib/db/supabase': { supabaseConfigured: () => configured,
      getSupabaseClient: () => ({ storage: { from: () => ({ remove }) } }) },
    '@/lib/db': { localFallbackAllowed: () => fallback },
  };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, console, Date, Uint8Array,
    process: { cwd: () => '/virtual', env: {} },
    require: (id) => { assert.ok(id in mocks, `Unexpected storage import: ${id}`); return mocks[id]; },
  }, { filename: 'lib/media/storage.ts' });
  return { storage: mod.exports, localRemoved };
}
const object = 'products/abc/image.webp';
let remoteCalls = 0;
const remoteOk = load({ configured: true, fallback: false, remove: async (paths) => {
  remoteCalls++; assert.equal(paths[0], object); return { error: null };
} });
await remoteOk.storage.deleteObject(object);
assert.equal(remoteCalls, 1); assert.equal(remoteOk.localRemoved.length, 1);
const remoteFailure = load({ configured: true, fallback: true, remove: async () => ({ error: new Error('Storage refused deletion') }) });
await assert.rejects(remoteFailure.storage.deleteObject(object), /Storage refused deletion/);
assert.equal(remoteFailure.localRemoved.length, 0, 'A local delete is not proof of remote deletion');
const networkFailure = load({ configured: true, fallback: true, remove: async () => { throw new Error('fetch failed'); } });
await assert.rejects(networkFailure.storage.deleteObject(object), /fetch failed/);
await assert.rejects(networkFailure.storage.deleteObject(object), /Storage không khả dụng/, 'Marked-down remote storage never reports false success');
const local = load({ configured: false, fallback: true, remove: async () => { throw Error('not used'); } });
await local.storage.deleteObject(object); assert.equal(local.localRemoved.length, 1);
const blocked = load({ configured: false, fallback: false, remove: async () => { throw Error('not used'); } });
await assert.rejects(blocked.storage.deleteObject(object), /Storage không khả dụng/);
await assert.rejects(local.storage.deleteObject('../other.webp'), /Đường dẫn tệp không hợp lệ/);
console.log('✅ Storage cleanup: remote errors and unavailable storage are reported.');
