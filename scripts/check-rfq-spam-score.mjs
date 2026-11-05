// node scripts/check-rfq-spam-score.mjs
// Người gửi RFQ đã đăng nhập bằng email xác minh: Gmail chỉ là tín hiệu yếu (+5), và RFQ gửi từ
// trang sản phẩm / nhà cung cấp đã xác thực không bị phạt vì không gõ thêm. Bot (thiếu challenge,
// honeypot, link) vẫn bị giữ lại.
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import dns from "node:dns";
import vm from "node:vm";
import ts from "typescript";

const file = new URL("../lib/rfq/index.ts", import.meta.url);
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { module: mod, exports: mod.exports, require: (id) => ({ "node:crypto": crypto, "node:dns": dns })[id] ?? assert.fail(`Unexpected ${id}`) });
const { scoreSpam } = mod.exports;

const NEW = 40, SPAM = 100;
const buyer = { name: "Anna", email: "anna@gmail.com", company: "Anna Foods", phone: "", message: "", productText: "", challengeOk: true };

// Gmail, gửi từ trang sản phẩm, không gõ gì, không số điện thoại → thẳng tới nhà cung cấp.
const fromProduct = scoreSpam({ ...buyer, hasVerifiedContext: true });
assert.equal(fromProduct.score, 15);
assert.ok(fromProduct.score < NEW, "Gmail buyer from a product page is delivered directly");
assert.ok(!fromProduct.flags.includes("too_short"), "verified product context is not 'too short'");

// Form /rfq chung, nội dung ngắn: vẫn bị ghi cờ nhưng không còn bị giữ vì riêng Gmail.
const general = scoreSpam(buyer);
assert.equal(general.score, 35);
assert.ok(general.flags.includes("too_short") && general.flags.includes("webmail_domain"));
assert.ok(general.score < NEW);

// Email công ty, đủ thông tin.
assert.equal(scoreSpam({ ...buyer, email: "anna@annafoods.com", phone: "+31 20 123 4567", hasVerifiedContext: true }).score, 0);

// Tín hiệu bot vẫn giữ lại / cách ly.
assert.ok(scoreSpam({ ...buyer, challengeOk: false, hasVerifiedContext: true }).score >= NEW, "missing challenge still held for review");
assert.ok(scoreSpam({ ...buyer, challengeOk: false }).score >= NEW);
assert.ok(scoreSpam({ ...buyer, honeypot: "x", hasVerifiedContext: true }).score >= SPAM, "honeypot still quarantined");
assert.ok(scoreSpam({ ...buyer, message: "cheap deal https://spam.example", challengeOk: false }).score >= NEW);

// Thứ tự trong submitRfq: chỉ chấm điểm sau khi sản phẩm / nhà cung cấp đã được xác thực ở server.
const submit = fs.readFileSync(new URL("../lib/rfq/submit.ts", import.meta.url), "utf8");
assert.ok(submit.indexOf("const sourceProduct = publishedSource") < submit.indexOf("scoreSpam({"), "context is verified before scoring");
assert.match(submit, /hasVerifiedContext: Boolean\(sourceProduct\) \|\| preferredIds\.length > 0/);

console.log("✅ RFQ spam score: verified Gmail buyers from product pages go direct; bots still held or quarantined.");
