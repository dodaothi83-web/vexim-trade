# Vexim UI implementation notes

Before changing identity, icons or business labels, read `docs/brand-identity.md`.

The user approved direction 02 in `docs/brand-preview/index.html`: soft, restrained duotone navy business icons. Direction 01 was rejected as generic. Reuse `components/brand/vexim-icons.tsx`; do not independently replace it with default library business icons.

Keep the original V logo, existing navy palette and Be Vietnam Pro typography. Standard search/close/edit/navigation icons stay familiar. Supplier business type is not verification. Preserve semantic success/warning/error colours and actual verification scopes. Small circular shield pips in CRM/default contexts and their existing borders/backgrounds remain intentionally unchanged for legibility. On public listing cards (`variant="marketplace"`) the owner approved plain shields filled with the tier colour (green, light yellow, burgundy) and a white tick (see docs/brand-identity.md).

No design sample company, number or approved state is real production data. Design changes must not alter authentication, approval rules, pricing, buyer contact disclosure or stored records.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
