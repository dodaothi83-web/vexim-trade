# Public legal pages for Google sign-in review

Production URLs (use **the same exact canonical URLs** in Google Auth Platform / OAuth consent screen):

- Application home page: `https://www.veximtrade.com/`
- Privacy policy: `https://www.veximtrade.com/privacy-policy`
- Terms of service: `https://www.veximtrade.com/terms-of-service`

Both legal pages are public, work without login or database access, and are linked from the homepage, RFQ form, supplier registration, login, and public footers. Confirm the site redirects the apex domain to `www` and that the consent screen URLs exactly match the URLs shown above. Verify ownership of `veximtrade.com` in Google Search Console with an owner/editor of the Cloud project; complete any required brand/scope verification in Google Cloud. This app currently asks for `email profile` only for account authentication through Supabase; it does **not** request Gmail/Drive access. If scopes or data use change, update the policy and consent screen before submitting again. A legal reviewer should check the texts and confirm that `hello@veximtrade.com` is a monitored contact address before publication.

Marketing pages may remain `noindex` before launch; on the production domain the legal pages and exact homepage are crawlable even when `PUBLIC_SITE_INDEXABLE` is off. Vercel preview/development remain blocked from indexing. Deploy and verify that `GET /privacy-policy` and `GET /terms-of-service` return public HTML on the **production domain**, not just a Vercel preview or a login redirect. Publishing these pages helps satisfy policy-URL requirements but **does not guarantee Google approval**.
