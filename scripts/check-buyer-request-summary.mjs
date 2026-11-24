// CRM "Mặt hàng" shows a short product title; a buyer's whole letter goes to "Quy cách / yêu cầu".
import assert from "node:assert/strict";
import { buyerProductTitle, buyerRequestMessage } from "../lib/buyer/request-summary.ts";

const letter = "Hello, I am looking for wholesale suppliers of Dubai-style mixed tropical fruit chips.\n\nI want to purchase in bulk for resale in Bangladesh.\n\nPlease let me know:\n\n1. Do you have mixed fruit chips?";
assert.equal(buyerProductTitle(letter), "Dubai-style mixed tropical fruit chips");
assert.equal(buyerRequestMessage(letter), letter, "the letter is kept verbatim");

assert.equal(buyerProductTitle("Cashew kernels W320"), "Cashew kernels W320", "a short product name is kept as typed");
assert.equal(buyerRequestMessage("Cashew kernels W320"), null, "a short product name has no separate message");
assert.equal(buyerProductTitle(""), "");
assert.equal(buyerProductTitle(null), "");

assert.equal(buyerProductTitle("Hi,\nWe need 2 containers of black pepper 550 g/l for Dubai market. Please send price."), "2 containers of black pepper 550 g/l for Dubai market");
assert.equal(buyerProductTitle("Dear Sir/Madam, we are interested in buying robusta coffee beans grade 1 screen 18. Please quote CIF Hamburg."), "Robusta coffee beans grade 1 screen 18");
assert.equal(buyerProductTitle("Looking for a reliable supplier of frozen pangasius fillets, 20 tons per month, BRC certified, shipping to Poland every month starting January"), "Frozen pangasius fillets");
assert.equal(buyerProductTitle("Tôi cần mua 5 tấn hạt điều W240 xuất đi Trung Quốc, giao trong tháng 12, thanh toán LC, đóng gói thùng carton 22.68 kg"), "5 tấn hạt điều W240 xuất đi Trung Quốc");

const long = buyerProductTitle(`Hello, ${"very ".repeat(40)}long product name without commas`);
assert.ok(long.length <= 90 && long.endsWith("…"), "titles are clipped to 90 characters");

console.log("✅ Buyer request summary: short product title for CRM and email, full letter kept as the requirement.");
