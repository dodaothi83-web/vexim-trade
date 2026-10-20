#!/usr/bin/env node
// node scripts/check-buyer-shortlist-copy.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const home = read("app/(public)/home.tsx");
const homeMetadata = read("app/(public)/page.tsx");
const rootLayout = read("app/layout.tsx");
const productPage = read("app/(public)/products/[slug]/[productId]/page.tsx");
const categoryPage = read("app/(public)/products/[slug]/page.tsx");
const rfqStatus = read("app/(public)/rfq/status/[token]/page.tsx");
const rfqEmail = read("lib/email/rfq.ts");
const faqPrompt = read("lib/ai/draft-style.ts");
const crmRfq = read("app/crm/rfqs/[id]/page.tsx");

assert.ok(
  home.includes("Browse verified Vietnamese suppliers and request a quote from the one you choose. Haven’t found the right fit? Send us your requirements and Vexim will shortlist suppliers that match."),
  "Homepage separates browsing chosen suppliers from sending an open RFQ",
);
assert.ok(
  productPage.includes("Your request goes to this supplier first. If they can’t meet it, we’ll ask you before suggesting anyone else."),
  "Product page reassures the buyer that the selected supplier receives the request first",
);

for (const [name, file] of [
  ["homepage", home],
  ["homepage metadata", homeMetadata],
  ["root layout metadata", rootLayout],
  ["category page", categoryPage],
  ["RFQ status", rfqStatus],
  ["RFQ confirmation email", rfqEmail],
  ["FAQ prompt", faqPrompt],
  ["CRM RFQ page", crmRfq],
]) {
  assert.doesNotMatch(file, /2\s*(?:to|–|-|—)\s*4/, `${name} must not promise a fixed number of suppliers`);
}

console.log("✅ Buyer shortlist copy: chosen supplier first, open RFQ matching and no fixed supplier count.");
