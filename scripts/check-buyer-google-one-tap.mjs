import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const { NextResponse } = require('next/server');
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function load(file, mocks, globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: mod, exports: mod.exports, Buffer, Date, process, console, URL, JSON, ...globals,
    require(id) { assert.ok(id in mocks, `${file}: unexpected ${id}`); return mocks[id]; } }, { filename: file });
  return mod.exports;
}
const cookieJar = new Map();
let buyerSession = null;
const signPayload = (value) => {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', 'test-only').update(body).digest('hex')}`;
};
const readSignedPayload = (token) => {
  try {
    const [body, sig] = token.split('.');
    if (crypto.createHmac('sha256', 'test-only').update(body).digest('hex') !== sig) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch { return null; }
};
const policy = load('lib/buyer/one-tap.ts', {});
for (const path of ['/buyer/sign-in', '/buyer', '/supplier/portal', '/crm/a', '/login', '/sign-in', '/auth/callback', '/api/a', '/register']) assert.equal(policy.oneTapPublicPath(path), false);
for (const path of ['/', '/products/cashew/a', '/search', '/suppliers/example', '/rfq']) assert.equal(policy.oneTapPublicPath(path), true);
assert.equal(policy.oneTapCooldownActive(null), false);
assert.equal(policy.oneTapCooldownActive('bad'), false);
assert.equal(policy.oneTapCooldownActive(String(Date.now() + 1000)), true);
assert.equal(policy.oneTapCooldownActive(String(Date.now() - 1000)), false);

const helper = load('lib/auth/google-one-tap.ts', {
  'server-only': {}, 'node:crypto': crypto,
  'next/headers': { cookies: async () => ({ get: (key) => ({ value: cookieJar.get(key) }) }) },
  '@/lib/auth/session': { signPayload, readSignedPayload, SESSION_COOKIE: 'vxt_session', verifySessionToken: (value) => value === 'staff-session' ? { uid: 'staff' } : null },
  '@/lib/auth/buyer-session': { getBuyerSession: async () => buyerSession },
});
const previous = { enabled: process.env.GOOGLE_ONE_TAP_ENABLED, id: process.env.GOOGLE_ONE_TAP_CLIENT_ID };
const clientId = '1234-example.apps.googleusercontent.com';
try {
  delete process.env.GOOGLE_ONE_TAP_ENABLED;
  process.env.GOOGLE_ONE_TAP_CLIENT_ID = clientId;
  assert.equal(helper.googleOneTapClientId(), null);
  process.env.GOOGLE_ONE_TAP_ENABLED = 'true';
  assert.equal(helper.googleOneTapClientId(), clientId);
  process.env.GOOGLE_ONE_TAP_CLIENT_ID = 'not-a-client-secret';
  assert.equal(helper.googleOneTapClientId(), null);
  process.env.GOOGLE_ONE_TAP_CLIENT_ID = clientId;
  assert.equal(await helper.hasOneTapSession(), false);
  buyerSession = { uid: 'buyer' }; assert.equal(await helper.hasOneTapSession(), true); buyerSession = null;
  cookieJar.set('vxt_session', 'staff-session'); assert.equal(await helper.hasOneTapSession(), true); cookieJar.clear();
  const challenge = helper.issueOneTapChallenge(clientId);
  const payload = helper.readOneTapChallenge(challenge.cookie, clientId);
  assert.match(payload.nonce, /^[a-f0-9]{64}$/);
  assert.equal(challenge.nonce, crypto.createHash('sha256').update(payload.nonce).digest('hex'));
  assert.notEqual(payload.nonce, challenge.nonce);
  assert.notEqual(challenge.cookie, helper.issueOneTapChallenge(clientId).cookie);
  assert.equal(helper.readOneTapChallenge(`${challenge.cookie}tampered`, clientId), null);
  assert.equal(helper.readOneTapChallenge(challenge.cookie, 'another-client'), null);
  assert.equal(helper.readOneTapChallenge(signPayload({ ...payload, exp: Date.now() - 1 }), clientId), null);
  assert.equal(helper.readOneTapChallenge(signPayload({ ...payload, purpose: 'supplier' }), clientId), null);
  assert.equal(helper.readOneTapChallenge(signPayload({ ...payload, nonce: 123 }), clientId), null);

  const google = load('lib/auth/google-oauth.ts', {
    'server-only': {}, 'node:crypto': crypto, '@supabase/supabase-js': { createClient: () => null },
    '@/lib/auth/secret': { getAuthSecret: () => 'test-only' }, '@/lib/db/supabase': { supabaseUrl: () => 'https://example.supabase.co' },
    '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  });
  let limited = false;
  let providerError = false;
  let verified = true;
  let mode = 'supabase';
  let providerCalls = 0;
  let saved = null;
  let existing = null;
  let createRaces = false;
  let created = [];
  const store = {
    get mode() { return mode; },
    getBuyerUserByEmail: async (email) => { assert.equal(email, 'buyer@example.com'); return existing; },
    getBuyerByEmail: async () => ({ company: 'Known company' }),
    createBuyerUser: async (input) => {
      created.push(input);
      if (createRaces) { existing = { id: 'raced', ...input }; throw new Error('duplicate'); }
      return { id: 'buyer-id', ...input };
    },
    updateBuyerUser: async (id, patch) => ({ ...existing, id, ...patch }),
  };
  const route = load('app/api/auth/google/buyer/one-tap/route.ts', {
    'next/server': { NextResponse },
    'next/headers': { cookies: async () => ({ get: (key) => ({ value: cookieJar.get(key) }) }) },
    '@/lib/auth/google-one-tap': helper,
    '@/lib/auth/buyer-session': { startBuyerSession: async (input) => { saved = input; } },
    '@/lib/auth/abuse-protection': { checkAuthRateLimit: async () => ({ status: limited ? 'limited' : 'allowed' }) },
    '@/lib/auth/google-oauth': { ...google, googleClient: () => ({ auth: { signInWithIdToken: async (input) => {
      providerCalls++;
      assert.equal(input.provider, 'google');
      assert.equal(input.nonce, payload.nonce, 'Server passes the raw nonce to Supabase; GIS receives the hash');
      return { error: providerError ? new Error('invalid signature/nonce') : null, data: { user: {
        id: 'google-id', email: 'Buyer@Example.com', email_confirmed_at: '2026-11-04',
        identities: [{ provider: 'google', identity_data: { email_verified: verified, email: 'Buyer@Example.com' } }],
      } } };
    } } }) },
    '@/lib/db': { getStore: () => store },
  });
  const jwt = (aud = clientId) => `header.${Buffer.from(JSON.stringify({ aud })).toString('base64url')}.signature`;
  const request = (method = 'POST', body = { credential: jwt() }, extra = {}) => new Request('https://www.veximtrade.com/api/auth/google/buyer/one-tap', {
    method, headers: { origin: 'https://www.veximtrade.com', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...extra },
    body: method === 'PUT' ? undefined : JSON.stringify(body),
  });
  assert.equal((await route.POST(request('POST', {}, { origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await route.PUT(request('PUT', {}, { 'sec-fetch-site': 'cross-site' }))).status, 403);
  assert.equal(providerCalls, 0);
  const issued = await route.PUT(request('PUT'));
  assert.equal(issued.status, 200);
  assert.match((await issued.json()).nonce, /^[a-f0-9]{64}$/);
  assert.match(issued.headers.get('set-cookie'), /HttpOnly/);
  assert.match(issued.headers.get('set-cookie'), /Secure/);
  assert.match(issued.headers.get('set-cookie'), /SameSite=lax/i);
  assert.equal(issued.headers.get('cache-control'), 'no-store');
  assert.equal((await route.POST(request())).status, 400, 'No browser-bound nonce');
  cookieJar.set(helper.ONE_TAP_COOKIE, challenge.cookie);
  assert.equal((await route.POST(request('POST', { credential: jwt('other-client') }))).status, 400);
  assert.equal((await route.POST(request('POST', { credential: 123 }))).status, 400);
  assert.equal((await route.POST(request('POST', { credential: 'a'.repeat(17000) }))).status, 400);
  assert.equal(providerCalls, 0, 'Invalid requests never reach the identity provider');
  limited = true; assert.equal((await route.POST(request())).status, 429); limited = false;
  providerError = true; assert.equal((await route.POST(request())).status, 401); assert.equal(saved, null); providerError = false;
  verified = false; assert.equal((await route.POST(request())).status, 401); assert.equal(saved, null); verified = true;
  mode = 'local'; assert.equal((await route.POST(request())).status, 503); mode = 'supabase';
  const success = await route.POST(request());
  assert.equal(success.status, 200);
  assert.equal((await success.json()).ok, true);
  assert.equal(saved.uid, 'buyer-id'); assert.equal(saved.email, 'buyer@example.com');
  assert.equal(created.length, 1); assert.equal(created[0].company_name, 'Known company');
  assert.match(success.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(success.headers.get('cache-control'), 'no-store');
  existing = { id: 'existing', email: 'buyer@example.com', verified_at: null };
  assert.equal((await route.POST(request())).status, 200); assert.equal(saved.uid, 'existing');
  existing = null; createRaces = true;
  assert.equal((await route.POST(request())).status, 200); assert.equal(saved.uid, 'raced');
  buyerSession = { uid: 'existing' };
  assert.equal((await route.POST(request())).status, 409); assert.equal((await route.PUT(request('PUT'))).status, 409); buyerSession = null;
  cookieJar.set('vxt_session', 'staff-session');
  assert.equal((await route.POST(request())).status, 409); cookieJar.delete('vxt_session');
  process.env.GOOGLE_ONE_TAP_ENABLED = 'false'; assert.equal((await route.PUT(request('PUT'))).status, 409);
  const client = read('components/buyer-google-one-tap.tsx');
  assert.match(client, /auto_select: false/);
  assert.match(client, /use_fedcm_for_prompt: true/);
  assert.match(client, /router\.refresh\(\)/);
  assert.doesNotMatch(client, /window\.location\.(?:assign|replace|reload)|router\.push/);
  assert.match(client, /if \(!ready \|\| !record/);
  assert.match(client, /identity\.cancel\(\)/);
  assert.match(client, /ONE_TAP_COOLDOWN_MS/);
  assert.doesNotMatch(client, /localStorage\.setItem\([^\n]*(?:credential|token)/);
  const source = read('app/api/auth/google/buyer/one-tap/route.ts');
  assert.doesNotMatch(source, /createUser|app_users|startSession\(|console\./);
  assert.match(source, /signInWithIdToken/);
  assert.match(source, /isVerifiedGoogleUser/);
  const layout = read('app/(public)/layout.tsx');
  assert.match(layout, /oneTapClientId && !buyerSession && !\(await hasOneTapSession\(\)\)/);
  // Execute the real saved-products provider with controlled hooks and async loads.
  // Session refresh must not key/remount the public subtree or expose another account's IDs.
  const slots = [], effects = [], queued = [];
  let stateIndex = 0, effectIndex = 0;
  const hooks = {
    createContext: () => ({ Provider: 'saved-provider' }),
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useEffect: (effect, deps) => {
      const index = effectIndex++;
      if (effects[index] && deps.every((dep, i) => dep === effects[index].deps[i])) return;
      effects[index]?.cleanup?.();
      effects[index] = { deps, cleanup: effect() };
    },
  };
  const provider = load('components/buyer-saved-products.tsx', {
    react: hooks, 'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { usePathname: () => '/rfq' }, 'next/link': { default: () => null },
    'lucide-react': {},
    '@/app/(public)/buyer/account/actions': { getSavedProductsState: () => new Promise((resolve) => queued.push(resolve)) },
  }, { window: { addEventListener() {}, removeEventListener() {} } });
  const children = { unfinishedQuote: 'keep this instance' };
  const renderProvider = (sessionKey) => {
    stateIndex = effectIndex = 0;
    const tree = provider.BuyerSavedProductsProvider({ children, sessionKey, isVi: false });
    assert.equal(tree.props.children, children);
    return tree.props.value;
  };
  assert.equal(renderProvider('guest').state, null);
  queued.shift()({ authenticated: false, ids: [] }); await Promise.resolve();
  assert.equal(renderProvider('guest').state.authenticated, false);
  assert.equal(renderProvider('account-a').state, null);
  queued.shift()({ authenticated: true, ids: ['a-private'] }); await Promise.resolve();
  const accountA = renderProvider('account-a');
  assert.equal(accountA.state.ids[0], 'a-private');
  assert.equal(renderProvider('account-b').state, null, 'Account A data hidden on first render after identity changes');
  queued.shift()({ authenticated: true, ids: ['b-private'] }); await Promise.resolve();
  accountA.update('stale-write', true);
  assert.equal(renderProvider('account-b').state.ids.join(','), 'b-private', 'Old account update cannot mutate new account cache');
  assert.equal(renderProvider('account-c').state, null);
  const oldLoad = queued.shift();
  assert.equal(renderProvider('guest').state, null);
  oldLoad({ authenticated: true, ids: ['c-private'] }); await Promise.resolve();
  assert.equal(renderProvider('guest').state, null, 'Cancelled account load cannot expose stale IDs');
  queued.shift()({ authenticated: false, ids: [] }); await Promise.resolve();
  assert.equal(renderProvider('guest').state.authenticated, false);
  assert.doesNotMatch(layout, /<BuyerSavedProductsProvider key=/);
  assert.match(layout, /sessionKey=\{buyerSession\?\.email/);
  console.log('✅ Buyer Google One Tap: opt-in, signed nonce/hash/expiry/purpose, origin/rate/body guards, audience/provider verification, buyer-only sessions, account races, cooldown, no forced navigation or token storage.');
} finally {
  if (previous.enabled === undefined) delete process.env.GOOGLE_ONE_TAP_ENABLED; else process.env.GOOGLE_ONE_TAP_ENABLED = previous.enabled;
  if (previous.id === undefined) delete process.env.GOOGLE_ONE_TAP_CLIENT_ID; else process.env.GOOGLE_ONE_TAP_CLIENT_ID = previous.id;
}
