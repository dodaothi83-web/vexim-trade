#!/usr/bin/env node
// node scripts/check-buyer-shortlist-copy.mjs
//
// Kiểm Ý chứ không kiểm TỪ: mỗi trang phải nêu đường buyer tự chọn nhà cung cấp
// trước, và nêu đường nhờ Vexim tìm là dự phòng. Nhờ vậy có thể viết lại câu chữ
// mà không làm gãy kiểm tra, và cũng không ai vô tình bỏ mất một trong hai đường.
//
// Từ "shortlist" bị cấm trong nội dung buyer đọc, vì nó đặt Vexim vào giữa và
// mô tả sai luồng hiện tại. Tên hàm và giá trị enum nội bộ không bị kiểm.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const home = read("app/(public)/home.tsx");
const homeMetadata = read("app/(public)/page.tsx");
const rootLayout = read("app/layout.tsx");
const productPage = read("app/(public)/products/[slug]/[productId]/page.tsx");
const categoryPage = read("app/(public)/products/[slug]/page.tsx");
const categoryFaqCopy = read("lib/public/category-faq.ts");
const rfqStatus = read("app/(public)/rfq/status/[token]/page.tsx");
const rfqEmail = read("lib/email/rfq.ts");
const faqPrompt = read("lib/ai/draft-style.ts");
const crmRfq = read("app/crm/rfqs/[id]/page.tsx");
const llms = read("app/llms.txt/route.ts");
const categorySeed = read("lib/db/category-seed.ts");
const seafoodFaq = read("supabase/migrations/20261021_seafood_category_buyer_first_copy.sql");
const metaCopy = read("lib/public/meta-copy.ts");
const comparePage = read("app/(public)/compare/page.tsx");
const howItWorks = read("app/(public)/how-it-works/page.tsx");
const rfqForm = read("app/(public)/rfq/rfq-form.tsx");
const privacy = read("app/(legal)/privacy-policy/page.tsx");
const terms = read("app/(legal)/terms-of-service/page.tsx");

/* ---------- Một nguồn câu chữ cho metadata ---------- */

assert.ok(
  metaCopy.includes("export const HOME_META_DESCRIPTION") &&
    metaCopy.includes("export const HOME_HERO_LINE") &&
    metaCopy.includes("export const CATEGORY_META_SUFFIX") &&
    metaCopy.includes("export function categoryMetaFallback"),
  "Metadata copy lives in one shared module",
);
assert.ok(
  metaCopy.includes("Request a quote from the supplier you choose") &&
    metaCopy.includes("we look for suppliers that match"),
  "Shared copy keeps the chosen-supplier path first and the open request as the fallback",
);
assert.ok(
  homeMetadata.includes("HOME_META_DESCRIPTION") && rootLayout.includes("HOME_META_DESCRIPTION"),
  "Homepage metadata and root metadata read the shared description instead of repeating it",
);
assert.ok(home.includes("HOME_HERO_LINE"), "Homepage hero reads the shared line");

/* ---------- Footnote-length guard ---------- */

const homeDescriptionMatch = metaCopy.match(/export const HOME_META_DESCRIPTION =\s*\n?\s*"([^"]+)"/);
assert.ok(homeDescriptionMatch, "Homepage meta description is readable as a plain string");
const homeDescription = homeDescriptionMatch[1];
assert.ok(
  homeDescription.length <= 160,
  `Homepage meta description stays within the search snippet (${homeDescription.length} chars)`,
);

/* ---------- Trang chủ: hai đường, thứ tự đúng ---------- */

assert.ok(
  home.includes("Is searching products and submitting a Request for Quotation (RFQ) free for buyers?") && home.includes("request a quote directly from the supplier you choose"),
  "Homepage FAQ separates browsing chosen suppliers from sending an open request",
);
assert.ok(
  productPage.includes("Your request goes to this supplier first. If they can’t meet it, we’ll ask you before suggesting anyone else."),
  "Product page reassures the buyer that the selected supplier receives the request first",
);

/* ---------- Metadata trang chủ: schema nói đúng luồng ---------- */

assert.ok(homeMetadata.includes('"@type": "Organization"'), "Homepage includes Organization schema");
assert.ok(
  homeMetadata.includes("Buyers can browse supplier listings, request a quote from a supplier they choose") &&
    homeMetadata.includes("we look for suppliers that match"),
  "Organization schema explains browsing and chosen-supplier RFQs, then the open request as fallback",
);
assert.ok(
  homeMetadata.includes("buyers contract directly with the chosen supplier; Vexim does not hold buyer payments"),
  "Organization schema explains direct contracting and that Vexim does not hold payments",
);

/* ---------- Trang danh mục ---------- */

assert.ok(categoryPage.includes("function categoryMetaDescription"), "Category metadata normalizes stored descriptions");
assert.ok(
  categoryPage.includes("categoryMetaFallback") &&
    categoryPage.includes("hasChosenSupplierPath") &&
    categoryPage.includes("hasOpenRequestPath"),
  "Category metadata detects both paths before appending anything",
);
assert.ok(
  metaCopy.includes("export function categoryMetaFallback") &&
    metaCopy.includes("Send your request straight to the supplier"),
  "Category fallback description ends with the chosen-supplier path",
);
assert.ok(
  categoryPage.includes('twitter: { card: "summary_large_image"'),
  "Category Twitter cards use the same description as Open Graph",
);
assert.ok(categoryFaqCopy.includes("export const STANDARD_CATEGORY_FAQS"), "Category FAQ output includes the current supplier-choice and matching explanations");
assert.ok(categoryPage.includes('from "@/lib/public/category-faq"'), "The category page renders those standard questions from the shared module");
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

/* ---------- llms.txt ---------- */

assert.ok(llms.includes("Buyers can browse supplier listings and request a quote from a supplier they choose."), "llms.txt explains browsing and chosen-supplier RFQs");
assert.ok(llms.includes("we look for suppliers that match their specs, quantity and market"), "llms.txt explains the open request without the old wording");
assert.ok(llms.includes("Supplier checks are shown separately for documents, factory verification and delivery history."), "llms.txt does not imply every supplier passed every check");
assert.ok(llms.includes("buyers contract directly with the chosen supplier; Vexim does not take orders or hold payments online."), "llms.txt explains direct contracting and no online orders or held payments");

/* ---------- Prompt AI soạn FAQ ---------- */

assert.ok(faqPrompt.includes("buyers may request a quote from a supplier they choose"), "FAQ prompt includes chosen-supplier RFQs");
assert.ok(faqPrompt.includes("Vexim asks before suggesting anyone else"), "FAQ prompt includes consent before alternatives");
assert.ok(faqPrompt.includes("paid listings never affect who Vexim recommends"), "FAQ prompt includes paid-listing neutrality");
assert.ok(faqPrompt.includes("Vexim never holds buyer payments"), "FAQ prompt includes direct payment boundaries");

/* ---------- Email xác nhận RFQ ---------- */

assert.ok(rfqEmail.includes("hasPreferredSupplier"), "RFQ confirmation email separates targeted and open requests");
assert.ok(rfqEmail.includes("Your request goes to your selected supplier first."), "Targeted RFQ confirmation email puts the selected supplier first");
assert.ok(rfqEmail.includes("We will select verified suppliers that match your specs, quantity and market"), "Open RFQ confirmation email explains matching criteria");
assert.ok(rfqEmail.includes("Suppliers are matched on your requirements only. Paid listings never affect who we recommend."), "Open RFQ confirmation email explains matching neutrality");
assert.ok(rfqEmail.includes("Your contact details stay private until you agree to an introduction."), "RFQ confirmation email explains contact privacy");
assert.ok(rfqEmail.includes("You sign the contract directly with the supplier you choose. Vexim never holds your payment."), "RFQ confirmation email explains direct contracting and payment boundaries");
assert.ok(rfqEmail.includes("Requesting a quote is free for buyers."), "RFQ confirmation email says RFQ is free");

/* ---------- Từ vựng buyer đọc không còn "shortlist" ---------- */

for (const [name, file] of [
  ["homepage", home],
  ["homepage metadata", homeMetadata],
  ["root layout metadata", rootLayout],
  ["category page", categoryPage],
  ["compare page", comparePage],
  ["how it works page", howItWorks],
  ["RFQ form", rfqForm],
  ["RFQ status", rfqStatus],
  ["privacy policy", privacy],
  ["terms of service", terms],
  ["llms.txt", llms],
  ["category seed", categorySeed],
]) {
  assert.doesNotMatch(file, /shortlist/i, `${name} must not use the word shortlist in buyer-facing copy`);
}

/* ---------- Không hứa số lượng nhà cung cấp cố định ---------- */

for (const [name, file] of [
  ["homepage", home],
  ["homepage metadata", homeMetadata],
  ["root layout metadata", rootLayout],
  ["category page", categoryPage],
  ["how it works page", howItWorks],
  ["RFQ status", rfqStatus],
  ["RFQ confirmation email", rfqEmail],
  ["FAQ prompt", faqPrompt],
  ["CRM RFQ page", crmRfq],
  ["llms.txt", llms],
  ["category seed", categorySeed],
]) {
  assert.doesNotMatch(file, /2\s*(?:to|–|-|—)\s*4/, `${name} must not promise a fixed number of suppliers`);
}

assert.ok(
  howItWorks.indexOf("Request a quote from a supplier you choose:") <
    howItWorks.indexOf("Send an open quote request:") &&
    howItWorks.indexOf("Hỏi báo giá nhà cung cấp bạn chọn:") <
      howItWorks.indexOf("Gửi yêu cầu báo giá mở:"),
  "How it works page keeps chosen-supplier path first and open quote request second in both EN and VI",
);

console.log("✅ Buyer shortlist copy: chosen supplier first, open request as fallback, one shared source for metadata, no buyer-facing 'shortlist'.");
