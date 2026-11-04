# Buyer Google One Tap

## Scope

Google Identity Services can offer a Google-owned One Tap/FedCM invitation on public pages for signed-out visitors. This is an optional buyer sign-in entrance, not a replacement for email codes or the existing Google redirect button.

- Only the buyer account/session is created or matched. No supplier/staff role, internal `app_users` account, supplier verification, quote submission, or contact-sharing permission is granted.
- A valid buyer or internal/supplier session suppresses the invitation. The API checks again before either issuing a challenge or exchanging a credential.
- Sign-in, registration, internal and buyer-account routes do not load the invitation.
- The privacy-choice banner must be resolved first. Authentication is independent of analytics/marketing permission and never turns those categories on.
- Automatic account selection is disabled. Google/browser determines whether a prompt can be shown; dismissal or an unsupported/blocked browser does not block the site.
- A local timestamp limits attempts to once per 24 hours across tabs/pages in that browser. The timestamp is recorded when prompting, not a claim that Google displayed its UI or reported dismissal. If storage is unavailable, skip the invitation and keep explicit sign-in available.
- Successful sign-in refreshes server session props in place, without redirecting or reloading the page. Existing RFQ submission still requires the buyer's explicit action.

## Configuration and rollout

The feature defaults to OFF. No remote provider configuration or production environment variables have been changed by this implementation.

1. Use a Google Cloud **Web application** OAuth client that is also accepted by the existing Supabase Auth Google provider.
2. In Google Cloud, add the exact HTTPS website origin under **Authorized JavaScript origins**, for example `https://www.veximtrade.com`. Add another origin only if that host is genuinely served and tested. Keep the existing Supabase OAuth redirect URI for the redirect-button flow.
3. Confirm that Supabase Auth's Google provider is enabled and lists this client ID. **Keep nonce verification enabled**; do not enable Skip nonce checks.
4. On the application server, set:
   - `GOOGLE_ONE_TAP_ENABLED=true`
   - `GOOGLE_ONE_TAP_CLIENT_ID=<public-web-client-id>.apps.googleusercontent.com`
5. The existing Supabase server URL/key and authentication secret configuration must work. The origin must also pass the existing `SITE_URL`, `APP_URL` or `GOOGLE_OAUTH_SITE_URL` allowlist. Do not broaden that allowlist to arbitrary preview hosts.
6. Deploy and test on the actual authorized HTTPS origin with a real Google account. The OAuth client ID is public; never put a Google client secret or a Supabase service-role key in client props.
7. To disable, unset the enable flag or set it to `false`, then redeploy. The existing email and Google redirect sign-in paths remain available.

No database migration is required. A correctly configured existing buyer-account schema is required, as with the current buyer Google callback.

## Security flow

1. A same-origin `PUT /api/auth/google/buyer/one-tap` creates a signed, HttpOnly, SameSite=Lax, five-minute nonce cookie with a buyer-specific purpose and configured client ID.
2. The browser receives only the SHA-256 hash of the random nonce for Google Identity Services.
3. GIS returns a Google ID token after the user chooses to continue. The browser posts it in a bounded JSON request to the same route. It is never stored in local/session storage or logged.
4. The server verifies the exact allowed origin, fetch-site, feature flag, session state, rate limit, signed challenge, expiry and intended client ID. Token audience is only a prefilter, never proof of identity.
5. A new request-local Supabase client exchanges the token with `signInWithIdToken`, passing the **raw nonce**. Supabase must verify signature, issuer, expiry, Google audience and the hashed nonce. The app also requires a verified Google identity/email using the existing Google identity check.
6. Only after provider verification does the app find/create `buyer_users`, retain any known buyer company, mark verification, and create `vxt_buyer`. Concurrent account creation can reuse the account that won the race.
7. The challenge is cleared after a credential attempt. Responses are no-store. No access/refresh token is returned to the browser.

Cookies, local suppression storage and Google authentication behavior are disclosed in the cookie/privacy pages. Analytics permissions are not changed by Google sign-in.

## Preserving page state and isolating saved products

The old public layout keyed the entire saved-products provider by buyer email. A session refresh could therefore remount the public subtree and discard an unfinished form. This integration replaces that React key with a `sessionKey` prop.

The provider scopes its saved-products snapshot to that key, hides old IDs immediately on identity change, refetches for the new identity, cancels stale async loads, and ignores updates from a previous identity. Its children are no longer remounted just because a buyer signs in. This protects both unfinished forms and account-specific saved data.

## Verification

`npm run check:buyer-one-tap` exercises signed nonce expiry/purpose/client binding, hashed versus raw nonce, cross-origin rejection, rate limiting, malformed/oversized credentials, provider failure and unverified identity, buyer-only account creation, concurrent creation, existing-session suppression, cooldown/path policy, and saved-product isolation across account changes with stale asynchronous responses/updates.

The check is also included in `npm run check:entry` for existing CI coverage. Existing buyer sign-in/account tests, legal checks, copy checks and TypeScript are regression gates.

Still required before enabling: real Google/Supabase token exchange on the authorized production/staging domain; browser dismissal/FedCM behavior; successful in-place sign-in with an unfinished RFQ; buyer/internal session isolation; unsupported-browser fallback. This sandbox cannot validate the real Google prompt or provider configuration, and unit mocks are not proof that the live identity provider is configured correctly.
