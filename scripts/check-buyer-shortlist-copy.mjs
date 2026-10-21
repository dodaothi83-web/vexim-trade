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
const llms = read("app/llms.txt/route.ts");
const categorySeed = read("lib/db/category-seed.ts");
const seafoodFaq = read("supabase/migrations/20261021_seafood_category_buyer_first_copy.sql");

assert.ok(
  home.includes("Browse verified Vietnamese suppliers and request a quote from the one you choose. Haven’t found the right fit? Send us your requirements and Vexim will shortlist suppliers that match."),
  "Homepage separates browsing chosen suppliers from sending an open RFQ",
);
assert.ok(
  productPage.includes("Your request goes to this supplier first. If they can’t meet it, we’ll ask you before suggesting anyone else."),
  "Product page reassures the buyer that the selected supplier receives the request first",
);

const homeDescription =
  "Browse verified Vietnamese suppliers and request a quote from the one you choose, or send your requirements and Vexim will shortlist suppliers that match.";
assert.ok(homeMetadata.includes(homeDescription), "Homepage metadata and Open Graph use the current sourcing model");
assert.ok(rootLayout.includes(homeDescription), "Root metadata fallback uses the current sourcing model");
assert.ok(homeMetadata.includes('"@type": "Organization"'), "Homepage includes Organization schema");
assert.ok(
  homeMetadata.includes("Buyers can browse supplier listings, request a quote from a supplier they choose"),
  "Organization schema explains browsing and chosen-supplier RFQs",
);
assert.ok(
  homeMetadata.includes("buyers contract directly with the chosen supplier; Vexim does not hold buyer payments"),
  "Organization schema explains direct contracting and that Vexim does not hold payments",
);

assert.ok(categoryPage.includes("function categoryMetaDescription"), "Category metadata normalizes stored descriptions");
assert.ok(categoryPage.includes("Request a quote from a supplier you choose"), "Category metadata includes the chosen-supplier path");
assert.ok(categoryPage.includes("Vexim will shortlist suppliers that match"), "Category metadata includes the open RFQ path");
assert.ok(categoryPage.includes("twitter: { card: \"summary_large_image\""), "Category Twitter cards use the same description as Open Graph");
assert.ok(categoryPage.includes("const STANDARD_CATEGORY_FAQS"), "Category FAQ output includes the current supplier-choice and matching explanations");
assert.ok(categoryPage.includes("safeJsonLd({"), "Category FAQ schema uses escaped JSON-LD output");
assert.ok(categorySeed.includes("Can I request a quote from a specific supplier?"), "Seeded category FAQs explain chosen-supplier RFQs");
assert.ok(categorySeed.includes("Paid listings never affect who Vexim recommends."), "Seeded category FAQs explain paid listings do not affect matching");
assert.ok(
  categoryPage.includes("If it is not on the page") &&
    categoryPage.includes("send your request straight to them, no") &&
    categoryPage.includes("step through us."),
  "Empty category pages let the buyer contact the supplier first and treat Vexim as the fallback",
);
assert.doesNotMatch(categoryPage, /Get matched with/, "Empty category pages do not present Vexim as the first stop for matching");
assert.ok(
  seafoodFaq.includes("It goes to that supplier first, not to us.") &&
    seafoodFaq.includes("We check producers outside these pages"),
  "Seafood category FAQs follow the buyer-first order",
);

assert.ok(llms.includes("Buyers can browse supplier listings and request a quote from a supplier they choose."), "llms.txt explains browsing and chosen-supplier RFQs");
assert.ok(llms.includes("Vexim will shortlist suppliers that match their specs, quantity and market."), "llms.txt explains open RFQ matching");
assert.ok(llms.includes("Supplier checks are shown separately for documents, factory visits and delivery history."), "llms.txt does not imply every supplier passed every check");
assert.ok(llms.includes("buyers contract directly with the chosen supplier; Vexim does not take orders or hold payments online."), "llms.txt explains direct contracting and no online orders or held payments");

assert.ok(faqPrompt.includes("buyers may request a quote from a supplier they choose"), "FAQ prompt includes chosen-supplier RFQs");
assert.ok(faqPrompt.includes("Vexim asks before suggesting anyone else"), "FAQ prompt includes consent before alternatives");
assert.ok(faqPrompt.includes("paid listings never affect who Vexim recommends"), "FAQ prompt includes paid-listing neutrality");
assert.ok(faqPrompt.includes("Vexim never holds buyer payments"), "FAQ prompt includes direct payment boundaries");

assert.ok(rfqEmail.includes("hasPreferredSupplier"), "RFQ confirmation email separates targeted and open requests");
assert.ok(rfqEmail.includes("Your request goes to your selected supplier first."), "Targeted RFQ confirmation email puts the selected supplier first");
assert.ok(rfqEmail.includes("We will select verified suppliers that match your specs, quantity and market"), "Open RFQ confirmation email explains matching criteria");
assert.ok(rfqEmail.includes("Suppliers are matched on your requirements only. Paid listings never affect who we recommend."), "Open RFQ confirmation email explains matching neutrality");
assert.ok(rfqEmail.includes("Your contact details stay private until you agree to an introduction."), "RFQ confirmation email explains contact privacy");
assert.ok(rfqEmail.includes("You sign the contract directly with the supplier you choose. Vexim never holds your payment."), "RFQ confirmation email explains direct contracting and payment boundaries");
assert.ok(rfqEmail.includes("Requesting a quote is free for buyers."), "RFQ confirmation email says RFQ is free");

for (const [name, file] of [
  ["homepage", home],
  ["homepage metadata", homeMetadata],
  ["root layout metadata", rootLayout],
  ["category page", categoryPage],
  ["RFQ status", rfqStatus],
  ["RFQ confirmation email", rfqEmail],
  ["FAQ prompt", faqPrompt],
  ["CRM RFQ page", crmRfq],
  ["llms.txt", llms],
  ["category seed", categorySeed],
]) {
  assert.doesNotMatch(file, /2\s*(?:to|–|-|—)\s*4/, `${name} must not promise a fixed number of suppliers`);
}

console.log("✅ Buyer shortlist copy: chosen supplier first, open RFQ matching and no fixed supplier count.");
