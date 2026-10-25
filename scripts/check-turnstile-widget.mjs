// node scripts/check-turnstile-widget.mjs — Turnstile lifecycle, owned error UI and RFQ token wiring.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';

const widget = fs.readFileSync(new URL('../components/turnstile-widget.tsx', import.meta.url), 'utf8');
const form = fs.readFileSync(new URL('../app/(public)/rfq/rfq-form.tsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../app/(public)/rfq/page.tsx', import.meta.url), 'utf8');

assert.match(widget, /sitekey: siteKey/);
assert.match(widget, /appearance: "interaction-only"/, 'Cloudflare only exposes the iframe when interaction is needed');
assert.match(widget, /size: "flexible"/);
assert.match(widget, /"before-interactive-callback": \(\) => setStatus\("interactive"\)/);
assert.match(widget, /"expired-callback": fail/);
assert.match(widget, /"timeout-callback": fail/);
assert.match(widget, /"error-callback": \(\) => \{[\s\S]*?return true;/, 'Cloudflare errors are owned by the form');
assert.match(widget, /window\.turnstile\.reset\(id\)/, 'Retry reuses a live widget without losing form data');
assert.match(widget, /window\.turnstile\?\.remove/, 'Unmounted widgets are cleaned up');
assert.match(widget, /setTimeout\(fail, 20_000\)/, 'A stalled script or challenge gets a recovery state');
assert.match(widget, /pointer-events-none absolute inset-0 opacity-0/);
assert.match(widget, /Try again/);
assert.doesNotMatch(widget, /Troubleshoot/, 'The application does not render Cloudflare\'s default error link');
assert.match(form, /<TurnstileWidget siteKey=\{turnstileSiteKey\} onChange=\{setTurnstileToken\} \/>/);
assert.match(form, /turnstile_token: turnstileToken/);
assert.match(page, /process\.env\.TURNSTILE_SITE_KEY \?\? process\.env\.NEXT_PUBLIC_TURNSTILE_SITE_KEY \?\? null/);

const loginForm = fs.readFileSync(new URL('../components/login-form.tsx', import.meta.url), 'utf8');
const loginPage = fs.readFileSync(new URL('../app/(auth)/login/page.tsx', import.meta.url), 'utf8');
const signupForm = fs.readFileSync(new URL('../app/(auth)/supplier/register/supplier-account-form.tsx', import.meta.url), 'utf8');
const signupPage = fs.readFileSync(new URL('../app/(auth)/supplier/register/page.tsx', import.meta.url), 'utf8');
const setupForm = fs.readFileSync(new URL('../components/setup-form.tsx', import.meta.url), 'utf8');
const setupPage = fs.readFileSync(new URL('../app/(auth)/setup/page.tsx', import.meta.url), 'utf8');
const serviceForm = fs.readFileSync(new URL('../components/service-registration-section.tsx', import.meta.url), 'utf8');
const home = fs.readFileSync(new URL('../app/(public)/home.tsx', import.meta.url), 'utf8');
for (const [name, source] of [['login', loginForm], ['supplier signup', signupForm], ['admin setup', setupForm], ['service registration', serviceForm]]) {
  assert.match(source, /<TurnstileWidget key=\{challengeVersion\}/, `${name} remounts the challenge after a failed submission`);
  assert.match(source, /resetChallenge\(\)/, `${name} clears a consumed or expired token`);
  assert.doesNotMatch(source, /Troubleshoot/, `${name} does not add Cloudflare's default error link`);
}
assert.match(loginForm, /loginAction\(email, password, turnstileToken\)/);
assert.match(signupForm, /form\.set\("turnstile_token", turnstileToken\)/);
assert.match(setupForm, /setupAdminAction\(email, name, password, password2, turnstileToken\)/);
assert.match(serviceForm, /formData\.set\("turnstile_token", turnstileToken\)/);
assert.match(serviceForm, /name="website_hp"/);
for (const source of [loginPage, signupPage, setupPage, home]) {
  assert.match(source, /process\.env\.TURNSTILE_SITE_KEY \?\? process\.env\.NEXT_PUBLIC_TURNSTILE_SITE_KEY \?\? null/);
}

// Server rendering must start with an owned loading state, not a Cloudflare error.
const output = ts.transpileModule(widget, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const mod = { exports: {} };
const Icon = () => null;
vm.runInNewContext(output, {
  module: mod,
  exports: mod.exports,
  console,
  process,
  require: (key) => {
    if (key === 'react') return React;
    if (key === 'react/jsx-runtime') return jsxRuntime;
    if (key === 'next/script') return { __esModule: true, default: () => null };
    if (key === 'lucide-react') return { AlertCircle: Icon, CheckCircle2: Icon, Loader2: Icon, RefreshCw: Icon };
    if (key === '@/components/ui') return { cx: (...parts) => parts.filter(Boolean).join(' ') };
    assert.fail(`Unexpected ${key}`);
  },
}, { filename: 'components/turnstile-widget.tsx' });
const html = renderToStaticMarkup(React.createElement(mod.exports.TurnstileWidget, {
  siteKey: 'test-site-key',
  onChange: () => {},
}));
assert.match(html, /data-turnstile-status="loading"/);
assert.match(html, /Loading security check/);
assert.match(html, /aria-hidden="true"/);
assert.doesNotMatch(html, /Troubleshoot/);

console.log('✅ Turnstile widget: production key wiring, hidden loading/error iframe, token clearing, retry and SSR state passed.');
