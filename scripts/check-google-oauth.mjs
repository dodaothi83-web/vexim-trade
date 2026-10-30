// node scripts/check-google-oauth.mjs — PKCE, verified signup ticket, no auto-roles, one login.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
function load(file, mocks, extras = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Buffer, URL, Request, Response, Date, console,
    process: { env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-secret', GOOGLE_OAUTH_SITE_URL: 'https://vexim.example' } },
    require: (name) => { if (name === 'server-only') return {}; assert.ok(name in mocks, `Unexpected ${name} in ${file}`); return mocks[name]; }, ...extras,
  }, { filename: file });
  return mod.exports;
}
const oauth = load('../lib/auth/google-oauth.ts', {
  'node:crypto': { default: crypto }, '@supabase/supabase-js': { createClient },
  '@/lib/auth/secret': { getAuthSecret: () => 'test-secret-that-is-not-in-browser' },
  '@/lib/db/supabase': { supabaseUrl: () => 'https://example.supabase.co' },
  '@/lib/site': { SITE_URL: 'https://vexim.example' },
});
assert.equal(oauth.googleOriginAllowed('https://vexim.example'), true);
assert.equal(oauth.googleOriginAllowed('https://attacker.example'), false);
assert.equal(oauth.googleRequestOrigin(new Request('http://0.0.0.0:3003/api/auth/google/start', { headers: { host: '127.0.0.1:3003' } })), 'http://127.0.0.1:3003');
assert.equal(oauth.googleRequestOrigin(new Request('http://0.0.0.0:3003/api/auth/google/start', { headers: { 'x-forwarded-host': 'vexim.example', 'x-forwarded-proto': 'https' } })), 'https://vexim.example');
const googleUser = (email = 'google@example.com') => ({ id: 'auth-google', email, email_confirmed_at: 'now',
  identities: [{ provider: 'google', identity_data: { email, email_verified: true } }] });
assert.equal(oauth.isVerifiedGoogleUser(googleUser()), true);
assert.equal(oauth.isVerifiedGoogleUser({ ...googleUser(), email_confirmed_at: null }), false);
assert.equal(oauth.isVerifiedGoogleUser({ ...googleUser(), identities: [{ provider: 'email' }] }), false);
assert.equal(oauth.isVerifiedGoogleUser({ ...googleUser(), identities: [{ provider: 'google', identity_data: { email: 'someone-else@example.com', email_verified: true } }] }), false);
const ticket = oauth.issueGoogleSignupTicket('auth-google', 'Google@Example.com');
assert.equal(oauth.verifyGoogleSignupTicket(ticket).email, 'google@example.com');
assert.equal(oauth.verifyGoogleSignupTicket(ticket + 'tamper'), null);
const expiredBody = Buffer.from(JSON.stringify({ id: 'auth-google', email: 'google@example.com', exp: Date.now() - 1 })).toString('base64url');
const expiredMac = crypto.createHmac('sha256', 'test-secret-that-is-not-in-browser').update(`google-signup:${expiredBody}`).digest('base64url');
assert.equal(oauth.verifyGoogleSignupTicket(`${expiredBody}.${expiredMac}`), null);
assert.equal(oauth.verifyGoogleSignupTicket(null), null);
const items = {};
const client = oauth.googleClient(items);
const result = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://vexim.example/api/auth/google/callback', skipBrowserRedirect: true } });
assert.equal(result.error, null);
assert.ok(result.data.url.includes('code_challenge='));
assert.ok(result.data.url.includes('code_challenge_method=s256'));
assert.ok(Object.keys(items).some((key) => key.includes('code-verifier')));
assert.ok(oauth.parseGoogleFlow(JSON.stringify({ intent: 'signup', items })));
assert.equal(oauth.parseGoogleFlow(JSON.stringify({ intent: 'admin', items })), null);
let currentUser = null;
let issuedSession = 0;
let googleIntent = 'login';
let flowValue = JSON.stringify({ intent: googleIntent, items: { verifier: 'secret' } });
const cookieSet = [];
const NextResponse = { redirect: (loc) => { const res = new Response(null, { status: 302, headers: { Location: String(loc) } }); res.cookies = { set: (...args) => cookieSet.push(args) }; return res; } };
let createdSupplierAccounts = 0;
const store = { mode: 'supabase', getUserByEmail: async () => currentUser,
  listUsers: async () => [{ role: 'admin', is_active: true }],
  createUser: async (input) => { createdSupplierAccounts++; currentUser = { ...input, id: 'new-supplier' }; return currentUser; },
  addAuditLog: async () => null, touchUserLogin: async () => null };
let oauthRate = { status: 'ok' };
const oauthRateCalls = [];
const start = load('../app/api/auth/google/start/route.ts', {
  'next/server': { NextResponse },
  '@/lib/auth/session': { getSession: async () => null },
  '@/lib/auth/abuse-protection': { checkAuthRateLimit: async (input) => { oauthRateCalls.push(input); return oauthRate; } },
  '@/lib/auth/google-oauth': oauth,
  '@/lib/db/supabase': { supabaseUrl: () => 'https://example.supabase.co' },
  '@/lib/site': { SITE_URL: 'https://vexim.example' },
});
assert.ok((await start.GET(new Request('https://other.example/api/auth/google/start?intent=signup'))).headers.get('location').endsWith('/supplier/register?oauth=origin'));
assert.ok((await start.GET(new Request('https://vexim.example/api/auth/google/start?intent=bad'))).headers.get('location').endsWith('/login?oauth=invalid'));
const started = await start.GET(new Request('https://vexim.example/api/auth/google/start?intent=signup'));
assert.ok(started.headers.get('location').startsWith('https://example.supabase.co/auth/v1/authorize?'));
assert.ok(cookieSet.some(([name, value]) => name === 'vxt_google_flow' && JSON.parse(value).intent === 'signup'));
assert.equal(oauthRateCalls.at(-1).flow, 'supplier-signup');
oauthRate = { status: 'limited' };
assert.ok((await start.GET(new Request('https://vexim.example/api/auth/google/start?intent=login'))).headers.get('location').endsWith('/login?oauth=rate_limited'));
assert.equal(oauthRateCalls.at(-1).flow, 'login');
oauthRate = { status: 'ok' };
const callback = load('../app/api/auth/google/callback/route.ts', {
  'next/server': { NextResponse }, 'next/cache': { revalidatePath() {} },
  'next/headers': { cookies: async () => ({ get: () => ({ value: flowValue }) }) },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { createSessionToken: () => { issuedSession++; return 'signed-session'; }, SESSION_COOKIE: 'vxt_session' },
  '@/lib/auth/google-oauth': { ...oauth,
    googleClient: () => ({ auth: { exchangeCodeForSession: async () => ({ data: { user: googleUser() }, error: null }) } }) },
  '@/lib/site': { SITE_URL: 'https://vexim.example' },
  '@/lib/supplier-portal/notify': { notifyStaffSupplierAccount: async () => 'sent' },
});
const callbackUrl = 'https://vexim.example/api/auth/google/callback?code=single-use&sb_flow_id=some-flow';
assert.ok((await callback.GET(new Request(callbackUrl))).headers.get('location').endsWith('/login?oauth=not_allowed'));
assert.equal(issuedSession, 0, 'Unprovisioned Google identities never receive CRM roles');
currentUser = { id: 'existing-id', email: 'google@example.com', name: 'Supplier', role: 'supplier', supplier_id: 'supplier-id', is_active: false };
assert.ok((await callback.GET(new Request(callbackUrl))).headers.get('location').endsWith('/login?oauth=not_allowed'));
currentUser.is_active = true;
const loggedIn = await callback.GET(new Request(callbackUrl));
assert.ok(loggedIn.headers.get('location').endsWith('/supplier/portal'));
assert.equal(issuedSession, 1);
assert.ok(cookieSet.some(([name, value]) => name === 'vxt_session' && value === 'signed-session'));
currentUser = null; flowValue = JSON.stringify({ intent: 'signup', items: { verifier: 'secret' } });
const signup = await callback.GET(new Request(callbackUrl));
assert.ok(signup.headers.get('location').endsWith('/supplier/portal'));
assert.equal(createdSupplierAccounts, 1, 'Explicit Google registration creates a restricted supplier account');
assert.equal(currentUser.role, 'supplier');
assert.equal(currentUser.supplier_id, null, 'Google registration alone cannot create/publish the business page');
assert.equal(issuedSession, 2, 'Verified Google user can enter the locked dashboard immediately');
flowValue = JSON.stringify({ intent: 'login', items: { verifier: 'secret' } });
assert.ok((await callback.GET(new Request(callbackUrl))).headers.get('location').endsWith('/supplier/portal'), 'Unlinked supplier can sign in again');
assert.equal(issuedSession, 3);
currentUser = null;
assert.ok((await callback.GET(new Request(callbackUrl))).headers.get('location').endsWith('/login?oauth=not_allowed'), 'Ordinary Google login cannot create an app role');
assert.equal(createdSupplierAccounts, 1);
console.log('✅ Google OAuth: PKCE, verified email, account-first supplier registration and restricted dashboard access.');
