#!/usr/bin/env node
// node scripts/check-platform-legal-strip.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

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

const company = {
  legalName: "VEXIM GLOBAL CO., LTD",
  address: "Số 25/6 Ngõ 51 Ngoạ Long, Tây Tựu, Hà Nội, Việt Nam",
  addressEn: "No. 25/6, Alley 51, Ngoạ Long, Tây Tựu, Hanoi, Vietnam",
  contactEmail: "contact@veximglobal.com",
  phone: "+84373685634",
  phoneDisplay: "+84 373 685 634",
  taxCode: "0111040294",
  registrationDate: "29/04/2025",
  legalRepresentative: "Lương Văn Học",
  platformResponsible: "Lương Văn Học",
  platformRulesEffectiveDate: "18/10/2026",
};

function renderStrip(lang) {
  const exports = {};
  const code = ts.transpileModule(strip, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mocks = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) },
    "next/navigation": { useSearchParams: () => ({ get: (key) => key === "lang" ? lang : null }) },
    "@/lib/config": { COMPANY: company },
  };
  vm.runInNewContext(code, {
    exports, module: { exports }, Date,
    require: (key) => {
      assert.ok(key in mocks, `Unexpected import: ${key}`);
      return mocks[key];
    },
  });
  return renderToStaticMarkup(React.createElement(exports.PlatformLegalStrip));
}

const english = renderStrip(undefined);
for (const text of [
  'lang="en"',
  "Enterprise Registration Certificate No. 0111040294, first issued on 29/04/2025.",
  "Legal representative: Mr. Lương Văn Học",
  "Person responsible for the e-commerce platform: Mr. Lương Văn Học",
  "The Platform Operating Regulations are effective from 18/10/2026.",
  "Please credit “veximtrade.com” when republishing information from this website.",
  "Platform Regulations",
  "Platform Owner Information",
  "Complaints and Violation Reports",
  "Terms of Service",
  "Privacy Policy",
  company.addressEn,
]) assert.ok(english.includes(text), `English footer includes: ${text}`);
assert.ok(!english.includes("Giấy chứng nhận đăng ký doanh nghiệp"), "Default footer does not mix Vietnamese legal copy into English");

const vietnamese = renderStrip("vi");
for (const text of [
  'lang="vi"',
  "Giấy chứng nhận đăng ký doanh nghiệp số 0111040294, cấp lần đầu ngày 29/04/2025.",
  "Người đại diện theo pháp luật: Ông Lương Văn Học",
  "Chịu trách nhiệm sàn giao dịch thương mại điện tử: Ông Lương Văn Học",
  "Quy chế hoạt động có hiệu lực từ ngày 18/10/2026.",
  "Ghi rõ nguồn “veximtrade.com” khi phát hành lại thông tin từ website này.",
  "Quy định của nền tảng",
  "Thông tin chủ quản",
  "Khiếu nại và báo cáo vi phạm",
  "Điều khoản sử dụng",
  "Chính sách bảo mật",
  company.address,
]) assert.ok(vietnamese.includes(text), `Vietnamese footer includes: ${text}`);
assert.ok(!vietnamese.includes("Enterprise Registration Certificate"), "Vietnamese footer does not retain English legal copy");
for (const href of ["/thong-tin-chu-quan", "/quy-che-hoat-dong", "/khieu-nai", "/dieu-khoan-su-dung", "/chinh-sach-bao-mat"]) {
  assert.ok(english.includes(`href="${href}"`) && vietnamese.includes(`href="${href}"`), `Both languages preserve ${href}`);
}

console.log("✅ Platform legal strip, responsible person, bilingual content and footer placement.");
