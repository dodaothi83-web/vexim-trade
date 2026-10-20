#!/usr/bin/env node
/**
 * Kiểm tra bản ghi cookie consent: mặc định từ chối phần không thiết yếu,
 * đọc lại được từ cookie header và hết hiệu lực sau 12 tháng.
 * Chạy: node --experimental-strip-types --no-warnings scripts/check-cookie-consent.mjs
 */
import assert from "node:assert/strict";

import {
  ACCEPTED_COOKIE_CONSENT,
  REJECTED_COOKIE_CONSENT,
  cookieConsentFromDocument,
  normalizeCookieConsentChoices,
  parseCookieConsent,
  serializeCookieConsent,
} from "../lib/cookie-consent.ts";

assert.deepEqual(normalizeCookieConsentChoices(), REJECTED_COOKIE_CONSENT);
assert.deepEqual(normalizeCookieConsentChoices({ analytics: true }), {
  necessary: true,
  analytics: true,
  marketing: false,
});
assert.deepEqual(normalizeCookieConsentChoices({ necessary: false, marketing: true }), {
  necessary: true,
  analytics: false,
  marketing: true,
});

const now = new Date("2026-10-20T00:00:00.000Z");
const serialized = serializeCookieConsent(ACCEPTED_COOKIE_CONSENT, now);
const parsed = parseCookieConsent(serialized, now);
assert.deepEqual(parsed, {
  ...ACCEPTED_COOKIE_CONSENT,
  version: 1,
  updatedAt: "2026-10-20T00:00:00.000Z",
});

const header = `other=value; vexim_cookie_consent=${encodeURIComponent(serialized)}; theme=light`;
assert.deepEqual(cookieConsentFromDocument(header, now), parsed);
assert.equal(cookieConsentFromDocument(header, new Date("2027-10-21T00:00:00.000Z")), null);
assert.equal(parseCookieConsent("not-json", now), null);
assert.equal(parseCookieConsent(JSON.stringify({ version: 99, analytics: true, updatedAt: now.toISOString() }), now), null);

console.log("ĐẠT: cookie consent mặc định tắt phần không thiết yếu và hết hiệu lực sau 12 tháng.");
