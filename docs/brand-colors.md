# Brand colours

Canonical palette: `lib/brand/colors.json`.

- Update the JSON, then run `npm run brand:sync` to regenerate `app/brand-colors.css`.
- Tailwind brand, ink and semantic utilities read the generated theme.
- Email templates import the same JSON and inline the resolved colours for email-client compatibility.
- Run `npm run check:brand` to check palette sync, text contrast and key public/email usage.

Use navy for actions and navigation, light blue for small accents, and the pale blue-grey surface for neutral panels. Never use brand navy as the only indication of approval. Approved checks remain green; incomplete information remains warning brown on cream; validation failures remain red.

The public header already uses the supplied logo PNG, not a placeholder letter. Do not redraw or recolour the asset.

Shared theme tokens also affect shared CRM controls. This is not a separate CRM redesign. CRM-specific charts and workflow colours have not been migrated.
