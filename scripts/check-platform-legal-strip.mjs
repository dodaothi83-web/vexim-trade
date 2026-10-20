#!/usr/bin/env node
// node scripts/check-platform-legal-strip.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const strip = read("components/platform-legal-strip.tsx");
const config = read("lib/config.ts");
const ownerPage = read("app/(legal)/thong-tin-chu-quan/page.tsx");
const legalLayout = read("app/(legal)/layout.tsx");
const home = read("app/(public)/home.tsx");
const simpleFooter = read("app/(public)/simple-footer.tsx");
const siteFooter = read("components/site-footer.tsx");

assert.match(config, /platformResponsible:.*Lương Văn Học/, "Platform responsible person defaults to Lương Văn Học");
assert.match(config, /platformRulesEffectiveDate:.*18\/10\/2026/, "Platform rules effective date is configured");

for (const text of [
  "Copyright ©",
  "Vexim Trade",
  "veximtrade.com",
  "Giấy chứng nhận đăng ký doanh nghiệp số",
  "Người đại diện theo pháp luật: Ông",
  "Chịu trách nhiệm sàn giao dịch thương mại điện tử: Ông",
  "Quy chế hoạt động có hiệu lực từ ngày",
  "Ghi rõ nguồn “veximtrade.com” khi phát hành lại thông tin từ website này.",
  "Thông tin chủ quản",
  "Quy chế hoạt động",
  "Khiếu nại và báo cáo vi phạm",
  "Điều khoản sử dụng",
  "Chính sách bảo mật",
]) {
  assert.ok(strip.includes(text), `Platform legal strip includes: ${text}`);
}
assert.doesNotMatch(strip, /—/, "Platform legal strip must not use an em dash");
assert.doesNotMatch(strip, /VeximTrade/, "Platform legal strip writes the brand as Vexim Trade or veximtrade.com");
assert.ok(strip.includes("md:grid-cols-[0.95fr_1.5fr_0.75fr]"), "Platform legal strip gives the legal column more width than the menu column");
assert.ok(strip.includes("md:pl-6 lg:pl-10"), "Platform legal strip pushes the menu column to the right");

assert.ok(ownerPage.includes("Người chịu trách nhiệm sàn giao dịch thương mại điện tử"), "Owner page labels the platform responsible person");
assert.ok(ownerPage.includes("COMPANY.platformResponsible"), "Owner page reads the platform responsible person from config");

assert.ok(legalLayout.includes("<PlatformLegalStrip"), "Legal layout renders the platform legal strip");
assert.doesNotMatch(legalLayout, /aria-label="Legal pages"/, "Legal header no longer carries the Vietnamese legal menu");

for (const [name, file] of [
  ["home", home],
  ["simple footer", simpleFooter],
  ["site footer", siteFooter],
]) {
  assert.ok(file.includes("<PlatformLegalStrip"), `${name} renders the platform legal strip`);
  assert.doesNotMatch(file, /href="\/thong-tin-chu-quan"/, `${name} does not duplicate the Vietnamese operator link above the strip`);
  assert.doesNotMatch(file, /href="\/quy-che-hoat-dong"/, `${name} does not duplicate the Vietnamese rules link above the strip`);
  assert.doesNotMatch(file, /href="\/khieu-nai"/, `${name} does not duplicate the Vietnamese complaints link above the strip`);
}

console.log("✅ Platform legal strip, responsible person and footer placement.");
