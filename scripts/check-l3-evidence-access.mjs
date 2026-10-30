// Offline ACL checks for L3 evidence: owner, staff permissions, public route and traversal.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
function compile(path, mocks) {
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  vm.runInThisContext(`(function(exports, require, module) { ${code}\n})`, { filename: path })(mod.exports, (id) => {
    if (id in mocks) return mocks[id];
    return nativeRequire(id);
  }, mod);
  return mod.exports;
}
class NextResponse extends Response { static json(body, init) { return Response.json(body, init); } }
const filePath = 'supplier-submissions/sub-a/export.pdf';
let currentSession = null;
let user = { id: 'user-a', role: 'supplier', supplier_id: 'sup-a', email: 'a@example.com', is_active: true };
let company = { id: 'sup-a', onboarding_status: 'approved' };
let asset = { audience: 'internal', mime: 'application/pdf' };
let reads = 0;
const store = {
  getSubmission: async (id) => id === 'sub-a' ? { id, supplier_id: 'sup-a' } : null,
  getUser: async () => user,
  getSupplier: async (id) => company?.id === id ? company : null,
  getMediaByPath: async (path) => path === filePath ? asset : null,
};
const mocks = {
  'next/server': { NextResponse },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { getSession: async () => currentSession },
  '@/lib/auth/permissions': { hasPermission: (role, permission) => role === 'reviewer' && permission === 'media.internal' },
  '@/lib/media/storage': { getObject: async (path) => { reads++; return path === filePath ? { data: new Uint8Array([1, 2, 3]) } : null; } },
  '@/lib/supplier-portal/onboarding': { portalApproved: (supplier) => supplier.onboarding_status === 'approved' },
  '@/lib/media/readiness': { isExpired: () => false },
  '@/lib/public/product-selection': { isTestOnlyProduct: () => false, productReviewApproved: () => true },
};
const privateRoute = compile('app/api/supplier-portal/submission-file/[...path]/route.ts', mocks);
const publicRoute = compile('app/public-media/[...path]/route.ts', mocks);
const request = () => new Request('http://example.test/file');
const params = (path) => ({ params: Promise.resolve({ path: path.split('/') }) });
assert.equal((await privateRoute.GET(request(), params(filePath))).status, 401);
assert.equal(reads, 0);
currentSession = { uid: 'user-a', role: 'supplier', email: 'a@example.com' };
let response = await privateRoute.GET(request(), params(filePath));
assert.equal(response.status, 200);
assert.equal(response.headers.get('content-type'), 'application/pdf');
assert.match(response.headers.get('cache-control'), /private/);
assert.match(response.headers.get('x-robots-tag'), /noindex/);
assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
user = { ...user, supplier_id: 'sup-b' }; company = { id: 'sup-b', onboarding_status: 'approved' };
assert.equal((await privateRoute.GET(request(), params(filePath))).status, 403, 'Another supplier cannot see evidence');
user = { ...user, supplier_id: 'sup-a' }; company = { id: 'sup-a', onboarding_status: 'pending' };
assert.equal((await privateRoute.GET(request(), params(filePath))).status, 403, 'Unapproved portal cannot see evidence');
company = { ...company, onboarding_status: 'approved' }; user = { ...user, is_active: false };
assert.equal((await privateRoute.GET(request(), params(filePath))).status, 403, 'Inactive account cannot see evidence');
user = { ...user, is_active: true, email: 'changed@example.com' };
assert.equal((await privateRoute.GET(request(), params(filePath))).status, 403, 'Mismatched session cannot see evidence');
currentSession = { uid: 'staff', role: 'sale', email: 'staff@example.com' };
assert.equal((await privateRoute.GET(request(), params(filePath))).status, 403, 'Staff without internal-media permission cannot see evidence');
currentSession = { ...currentSession, role: 'reviewer' };
assert.equal((await privateRoute.GET(request(), params(filePath))).status, 200, 'Staff with internal-media permission can view');
asset = { ...asset, audience: 'buyer' };
assert.equal((await privateRoute.GET(request(), params(filePath))).status, 403);
assert.equal((await privateRoute.GET(request(), params('supplier-submissions/../secret.pdf'))).status, 400);
const readsBeforePublic = reads;
assert.equal((await publicRoute.GET(request(), params(filePath))).status, 404);
assert.equal((await publicRoute.GET(request(), params('supplier-submissions/sub-a/export.jpg'))).status, 404);
assert.equal(reads, readsBeforePublic, 'Public route rejects submission files before opening storage');
console.log('✅ L3 evidence access: only owner/authorized staff; private cache, no public route or traversal.');
