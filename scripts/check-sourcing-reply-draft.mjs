// "AI viết tiếp cận" for buyers who already sent a request: fixed reply letter for sourcing,
// note only for direct RFQs, old outreach letter only when the buyer has no RFQ.
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildSourcingReplyLetter, extractBuyerQuestions, questionTopic } from "../lib/ai/sourcing-reply-draft.ts";

const inline = "Hello, I am looking for wholesale suppliers of Dubai-style mixed tropical fruit chips. I want to purchase in bulk for resale in Bangladesh. Please let me know: 1. Do you have mixed fruit chips? 2. Wholesale price per kg? 3.Minimum order quantity? 4.Can you provide factory/importer pricing? I am interested in regular bulk purchases and long-term business cooperation. 5. Pictures of the product. Thank you.";
const lines = "Hello,\n\nPlease let me know:\n\n1. Do you have mixed fruit chips?\n2. Price per kg\n3. Minimum order quantity\n4. Factory price for bulk order\n5. Pictures of the product\n\nThank you.";
assert.deepEqual(extractBuyerQuestions(inline), ["Availability of mixed fruit chips", "Wholesale price per kg", "Minimum order quantity", "Factory/importer pricing", "Product pictures"]);
assert.deepEqual(extractBuyerQuestions(lines), ["Availability of mixed fruit chips", "Price per kg", "Minimum order quantity", "Factory price for bulk order", "Product pictures"]);
assert.deepEqual(extractBuyerQuestions("Need cashew W320. What is your MOQ? Can you send samples?"), ["MOQ", "Samples"]);
assert.deepEqual(extractBuyerQuestions("Cashew kernels W320"), []);
assert.equal(questionTopic("Do you have mixed fruit chips?"), "Availability of mixed fruit chips");

const has = { targetPrice: false, packaging: false, deliveryTerms: false, neededBy: false };
const letter = buildSourcingReplyLetter({ recipientName: "sourav", rfqCode: "RFQ-20261124-00002", product: "Dubai-style mixed tropical fruit chips", quantity: "200 kg", destinationCountry: "Bangladesh", buyerText: inline, has });
assert.equal(letter.subject, "Your request RFQ-20261124-00002: Dubai-style mixed tropical fruit chips");
assert.equal(letter.body, [
  "Dear Sourav,",
  "Thank you for your request for Dubai-style mixed tropical fruit chips, 200 kg, delivered to Bangladesh. Our sourcing team is now contacting suitable Vietnamese suppliers for you.",
  "You asked about:\n1. Availability of mixed fruit chips\n2. Wholesale price per kg\n3. Minimum order quantity\n4. Factory/importer pricing\n5. Product pictures",
  "We will answer these with each supplier quote. To get accurate prices, could you tell us:",
  "- Your target price per kg\n- Packaging you need (bag size, retail pack or bulk carton)\n- Delivery terms and port (for example CIF Chittagong)\n- When you need the goods",
  "You will see each quote in your Vexim Trade account. Just reply to this email with any details.",
].join("\n\n"), "approved 24/11/2026 wording");
assert.doesNotMatch(letter.body, /service arm|Your part is only|Best regards|—/, "no old outreach copy, no signature, no em dash");

const full = buildSourcingReplyLetter({ recipientName: null, rfqCode: "RFQ-1", product: "Cashew W320", quantity: null, destinationCountry: null, buyerText: "Cashew W320", has: { targetPrice: true, packaging: true, deliveryTerms: true, neededBy: true } });
assert.match(full.body, /^Dear Sir or Madam,\n\nThank you for your request for Cashew W320\. /);
assert.doesNotMatch(full.body, /You asked about|could you tell us/, "nothing asked, nothing missing");

assert.match(buildSourcingReplyLetter({ recipientName: "A", rfqCode: "R", product: "Rice", quantity: "500 MT", destinationCountry: "Ghana", buyerText: "", has }).body, /target price per MT[\s\S]*CIF and your nearest port/);

const actions = fs.readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
assert.match(actions, /const reply = await buyerRequestReply\(store, buyer\);/);
assert.match(actions, /reply\?\.kind === "direct"\) return \{ ok: false, info: true, message: reply\.message \}/);
const route = fs.readFileSync(new URL("../lib/mail/buyer-request-reply.ts", import.meta.url), "utf8");
assert.match(route, /rfqChannel\(r\) === "sourcing"/);
assert.match(route, /AI không viết thư báo giá thay/);
assert.doesNotMatch(route, /updateRfq|updateBuyer|addActivity|createMessage/, "read-only");

console.log("✅ Sourcing reply draft: approved letter for sourcing requests, note only for direct RFQs.");
