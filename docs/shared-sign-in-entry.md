# Shared sign-in entry

The public guest account icon now opens `/sign-in`, not `/register`.
The EN/VI entrance offers two primary links and a smaller staff link:

- Buyer: `/buyer/sign-in`, preserving an optional validated internal `next` path.
- Supplier: `/login`, using the existing supplier authentication and role checks.
- Staff: `/login`, using the existing internal authentication and permissions.
- New accounts: a separate secondary `/register` link.

This is one entrance, not a shared credential form. Buyer cookies and internal/supplier
sessions remain separate. There is no email-based role guessing, account creation,
new permission grant, password handling or authentication migration on this page.
Signed-in buyer avatars retain their existing account menu.

The new route uses cookie-based account localization and noindex metadata/headers.
Tests in `npm run check:entry` include EN/VI rendering, destinations, rejected external
return paths, unchanged guest/signed-in headers and existing role redirects.
