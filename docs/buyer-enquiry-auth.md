# Buyer enquiry authentication

## Accepted behaviour

Buyer authentication happens **on the first click** of Request a quote or Ask about this product, before an enquiry form opens. Do not ask a guest to write an enquiry and only then reveal the account requirement.

The shared native dialog contains only a sign-in/create-account title and the compact authentication form. There is no introductory/benefit paragraph. Google appears first; the existing email → six-digit code flow remains available. First-time verified email/Google authentication creates the buyer account through the existing handlers; there is no new password system. Necessary code-entry instructions, errors and security challenge remain.

- Signed-in buyers proceed directly.
- Email-code authentication resumes the pending question in place, or navigates to the exact quote URL. Neither action submits an enquiry automatically.
- Google/email links preserve the return URL. Product questions use the product URL with `ask=1` to resume after redirect.
- Closing/Escape/backdrop returns to the same page. Dialog focus, native focus trapping and shared reference-counted body scroll locks are retained.
- RFQ links across the public layout (header, supplier/product pages, comparison and other CTAs) use one same-origin `/rfq` capture gate before Next navigation. Modified/new-tab clicks retain browser behaviour, but the destination still authenticates before rendering the form.
- A direct/bookmarked/new-tab `/rfq` visit renders only the entry gate for guests. There is a no-JavaScript sign-in link. Signed-in requests load the form and preserve category/product/supplier/grade/sample parameters.

## Ownership and persistence

`lib/rfq/submit.ts` checks the signed buyer session before rate-limit accounting, database writes or outbound email. No buyer session (including staff/supplier-only sessions) means rejection. Submitted email must match the session email, which is then used as canonical identity. The form pre-fills and locks that email. Existing consent, spam checks, product publication checks, targeted-supplier validation and contact-sharing rules are not relaxed.

Both quotes and questions already persist through the existing RFQ service and are listed by the authenticated buyer's email in their account. Dashboard cards now distinguish Quote request / Product enquiry (EN/VI). No schema migration or historical rewrite is needed. Exact-email ownership tests remain in place.

This is **not a new chat inbox**. Existing supplier-question replies still go to email; the status page remains explicit about that. New links open `/buyer/account/requests/[id]`. Legacy token-based status links now require the verified owner account and redirect there; see `docs/buyer-enquiry-links.md`. No invented delivery/read/reply states are introduced.

Return paths stay internal and bounded at 1,500 characters (previously 500, which could lose product/grade/supplier context); control characters and backslashes are rejected. Over-limit RFQ destinations fall back to `/rfq`, not an external location.

## Main files

- `components/buyer-enquiry-auth.tsx`: shared gate, compact dialog and direct-route entry.
- `components/buyer-sign-in-form.tsx`: optional compact variant and successful-code callback; standalone page behaviour unchanged.
- `components/products/ask-supplier-dialog.tsx`: authenticate before mounting/opening the question form.
- `app/(public)/rfq/page.tsx`: server-side form gate.
- `lib/rfq/submit.ts`: shared submission authentication and email ownership.
- `lib/browser/dialog-scroll-lock.ts`: safe scroll locking through dialog transitions.
- `app/(public)/buyer/account/page.tsx`: shared enquiry history and type labels.

## Verification

`npm run check:buyer-account` includes a jsdom/real React DOM interaction test covering the first-click quote/ask gate, compact EN/VI content, close/Escape, wrong-code handling, successful-code continuation, Google return links, deep-linked questions, StrictMode cleanup, no premature question mount, and scrolling across dialog transitions. Email and Google endpoints are mocked in this test; it does not claim live provider verification.

The RFQ regressions exercise anonymous and wrong-email rejection for both kinds before writes/email, plus existing consent, source-product, supplier, spam, delivery and quote isolation behaviour. Dashboard checks render both enquiry kinds with own-account filtering. CI runs the account/interaction checks separately from the RFQ suite.

Run: `npm run check:buyer-account`, `npm run check:rfq`, `npm run check:entry`, `npm run check:buyer-auth-i18n`, `npm run typecheck`, `npm run check:copy`, and `npm run build`.

Live Google/provider callback and real email delivery should be checked on an authorised deployment with configured origins and mail credentials. No remote configuration, live email or production records were changed during local tests.

Follow-up: the supplier-dashboard VM fixture now loads the actual i18n dictionaries/formatter, and its older name-equality expectation was updated to the existing validated-product-ID + free-text-requirements contract. `check-supplier-dashboard.mjs` passes and is part of `check:rfq` after the targeted portal-delivery fix. See `docs/rfq-targeted-delivery.md`.
