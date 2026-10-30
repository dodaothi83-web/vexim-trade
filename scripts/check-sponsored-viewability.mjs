// node scripts/check-sponsored-viewability.mjs
// Execute the real card effect with a deterministic observer, clock and document.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../components/sponsored-product-band.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText + '\nexports.TestCard = SponsoredBandCard;';

function fixture(marketingAllowed = true) {
  let now = 0, nextTimer = 0, observer, cleanup, cookieAllowed = marketingAllowed;
  const timers = new Map(), listeners = new Map(), session = new Map(), requests = [];
  const document = {
    visibilityState: 'visible',
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const setTimeout = (fn, delay) => { const id = ++nextTimer; timers.set(id, { at: now + delay, fn }); return id; };
  const clearTimeout = (id) => { timers.delete(id); };
  class IntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; this.disconnected = false; observer = this; }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  const mocks = {
    'react/jsx-runtime': jsx,
    react: { useRef: () => ({ current: {} }), useEffect: (effect) => { cleanup = effect(); } },
    '@/components/public-product-card': { PublicProductCard: () => null },
    '@/components/cookie-consent': { useCookieConsent: () => ({ marketingAllowed }) },
    '@/lib/cookie-consent': { cookieConsentFromDocument: () => ({ marketing: cookieAllowed }) },
    '@/lib/public/product-comparison': { hasProductComparisonPeer: () => false },
  };
  const exports = {};
  vm.runInNewContext(js, {
    exports, Date, Set, IntersectionObserver, document, setTimeout, clearTimeout,
    sessionStorage: { getItem: (key) => session.get(key) ?? null, setItem: (key, value) => session.set(key, value), removeItem: (key) => session.delete(key) },
    fetch: (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return Promise.resolve({ ok: true }); },
    require: (id) => { assert.ok(id in mocks, `Unexpected import: ${id}`); return mocks[id]; },
  }, { filename: 'sponsored-product-band.tsx' });
  const card = exports.TestCard({ item: { push: { id: 'push-1' }, product: { id: 'p1', imagePaths: [], supplierId: 's1' } }, categorySlug: 'pepper', comparisonEnabled: false });
  return {
    requests, card, observer,
    revokeCookie: () => { cookieAllowed = false; },
    intersect: (ratio, intersecting = ratio > 0) => observer.callback([{ isIntersecting: intersecting, intersectionRatio: ratio }]),
    visibility: (state) => { document.visibilityState = state; listeners.get('visibilitychange')?.(); },
    advance(ms) {
      const target = now + ms;
      while (true) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]); now = due[1].at; due[1].fn();
      }
      now = target;
    },
    cleanup: () => cleanup(),
    hasVisibilityListener: () => listeners.has('visibilitychange'),
  };
}

const visible = fixture();
assert.equal(visible.observer.options.threshold, 0.5);
visible.intersect(0.49); visible.advance(1000);
assert.equal(visible.requests.length, 0, 'Less than half visible never counts');
visible.intersect(0.5); visible.advance(799);
assert.equal(visible.requests.length, 0, '800 ms must be continuous');
visible.visibility('hidden'); visible.advance(2000);
assert.equal(visible.requests.length, 0, 'Background tab cancels the pending impression');
visible.visibility('visible'); visible.advance(799);
assert.equal(visible.requests.length, 0, 'Returning starts a fresh 800 ms');
visible.advance(1);
assert.deepEqual(visible.requests[0].body, { pushId: 'push-1', event: 'impression' });
visible.intersect(0.8); visible.advance(1000);
assert.equal(visible.requests.length, 1, 'Repeated visibility is deduplicated in the tab');
visible.card.props.onClickCapture({ target: { closest: () => null } });
assert.equal(visible.requests.length, 1, 'Non-link clicks do not count');
visible.card.props.onClickCapture({ target: { closest: () => ({}) } });
visible.card.props.onClickCapture({ target: { closest: () => ({}) } });
assert.equal(visible.requests.length, 2, 'A link click is recorded once per tab in the dedupe window');
assert.equal(visible.requests[1].body.event, 'click');
visible.cleanup();
assert.equal(visible.observer.disconnected, true);
assert.equal(visible.hasVisibilityListener(), false);

const moved = fixture();
moved.intersect(0.7); moved.advance(400); moved.intersect(0.49); moved.advance(1000);
assert.equal(moved.requests.length, 0, 'Leaving the visibility threshold cancels the timer');
moved.intersect(0.7); moved.cleanup(); moved.advance(1000);
assert.equal(moved.requests.length, 0, 'Unmount cancels the timer');

const revoked = fixture();
revoked.intersect(1); revoked.revokeCookie(); revoked.advance(1000);
revoked.card.props.onClickCapture({ target: { closest: () => ({}) } });
assert.equal(revoked.requests.length, 0, 'Cross-tab revocation is rechecked even with stale React consent state');
revoked.cleanup();

const noConsent = fixture(false);
noConsent.intersect(1); noConsent.advance(1000);
noConsent.card.props.onClickCapture({ target: { closest: () => ({}) } });
assert.equal(noConsent.requests.length, 0, 'No impressions or clicks without marketing consent');
noConsent.cleanup();
console.log('✅ Sponsored viewability: 50% for 800 ms, tab hide/return, unmount, link clicks, deduplication and consent (mocked observer/clock).');
