#!/usr/bin/env node
// node scripts/check-how-it-works.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const req = Module.createRequire(import.meta.url);

// Ký tự dạng AI bị cấm tuyệt đối trong nội dung trang /how-it-works
const FORBIDDEN_AI_CHARS = [
  ["em-dash", /\u2014/],
  ["en-dash", /\u2013/],
  ["middle-dot", /\u00B7/],
  ["bullet-char", /\u2022/],
  ["arrow-char", /[\u2190-\u21FF]/],
  ["ellipsis-char", /\u2026/],
  ["curly-quotes", /[\u2018\u2019\u201C\u201D]/],
  ["guillemets", /[\u00AB\u00BB]/],
  ["checkmark-dingbats", /[\u2700-\u27BF]/],
  ["emoji", /\p{Extended_Pictographic}/u],
  ["markdown-bold-or-heading", /(\*\*|^#{1,6}\s)/m],
];

// Thuật ngữ nội bộ / sáo rỗng AI không được xuất hiện trong nội dung trang buyer
const FORBIDDEN_JARGON = [
  /\bL1\b/,
  /\bL2\b/,
  /\bL3\b/,
  /\bSLA\b/,
  /\bshortlist\b/i,
  /\bonboarding\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bempower(?:ing|s)?\b/i,
  /\bstreamline(?:d|s)?\b/i,
  /\bend-to-end\b/i,
  /\bleverag(?:e|ing)\b/i,
];

const pageSource = read("app/(public)/how-it-works/page.tsx");

for (const [label, pattern] of FORBIDDEN_AI_CHARS) {
  assert.doesNotMatch(
    pageSource,
    pattern,
    `app/(public)/how-it-works/page.tsx must not contain ${label}`,
  );
}

for (const pattern of FORBIDDEN_JARGON) {
  assert.doesNotMatch(
    pageSource,
    pattern,
    `app/(public)/how-it-works/page.tsx must stay free of internal jargon or AI buzzwords (${pattern})`,
  );
}

// Render thực tế cả bản EN (mặc định) và bản VI (?lang=vi) để kiểm tra HTML xuất ra
function loadTsx(relPath, mocks = {}) {
  const filename = path.join(root, relPath);
  const source = readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const localRequire = (id) => {
    if (id in mocks) return mocks[id];
    if (id === "next/link") {
      const LinkMock = ({ href, children, ...rest }) =>
        React.createElement("a", { href: String(href), ...rest }, children);
      return { __esModule: true, default: LinkMock };
    }
    if (id.startsWith("@/")) {
      const resolved = id.slice(2);
      return loadTsx(`${resolved}.tsx`, mocks);
    }
    return req(id);
  };
  vm.runInNewContext(
    `(function (exports, require, module, __filename, __dirname) { ${outputText}\n})`,
    {},
    { filename },
  )(mod.exports, localRequire, mod, filename, path.dirname(filename));
  return mod.exports;
}

const pageMod = loadTsx("app/(public)/how-it-works/page.tsx");
assert.equal(pageMod.metadata.alternates.canonical, "/how-it-works");
assert.ok(
  pageMod.metadata.description.length <= 155,
  `Meta description should stay concise (${pageMod.metadata.description.length} chars)`,
);

const enTree = await pageMod.default({ searchParams: Promise.resolve({}) });
const viTree = await pageMod.default({ searchParams: Promise.resolve({ lang: "vi" }) });

const enHtml = renderToStaticMarkup(enTree);
const viHtml = renderToStaticMarkup(viTree);

const stripTags = (html) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

for (const [locale, html] of [
  ["en", enHtml],
  ["vi", viHtml],
]) {
  const visibleText = stripTags(html);
  for (const [label, pattern] of FORBIDDEN_AI_CHARS) {
    assert.doesNotMatch(
      visibleText,
      pattern,
      `Rendered ${locale} visible text must not contain ${label}`,
    );
  }
  for (const href of ["/compare", "/how-we-verify", "/rfq"]) {
    assert.ok(html.includes(`href="${href}"`), `Rendered ${locale} page must link to ${href}`);
  }
}

assert.match(enHtml, /How sourcing works for buyers/);
assert.ok(enHtml.includes('href="/#categories"'), "EN page links to /#categories");
assert.match(viHtml, /Cách mua hàng trên nền tảng/);
assert.ok(viHtml.includes('href="/?lang=vi#categories"'), "VI page preserves ?lang=vi on categories link");

// Kiểm tra không xây Hướng 1 trên thân trang chủ (chỉ gắn link ở footer For Buyers)
const homeSource = read("app/(public)/home.tsx");
const footerStart = homeSource.indexOf("<footer");
assert.ok(footerStart > 0, "Homepage has a <footer> section");
const homeBodyBeforeFooter = homeSource.slice(0, footerStart);
const homeFooter = homeSource.slice(footerStart);

assert.ok(
  !homeBodyBeforeFooter.includes("/how-it-works"),
  "Direction 1 rejected: homepage body before <footer> must not add a /how-it-works section",
);
assert.ok(
  homeFooter.includes('"/how-it-works"') && homeFooter.includes('"/how-it-works?lang=vi"'),
  "Homepage footer For Buyers column links to /how-it-works in both EN and VI",
);

// Kiểm tra Header, SimpleFooter, Sitemap, llms.txt
const headerSource = read("components/public-header-controls.tsx");
assert.equal(
  (headerSource.match(/\/how-it-works/g) ?? []).length >= 2,
  true,
  "Public header controls include /how-it-works in both main nav and Suspense fallback",
);
assert.ok(
  read("app/(public)/simple-footer.tsx").includes('href="/how-it-works"'),
  "SimpleFooter links to /how-it-works",
);
assert.ok(
  read("app/sitemap.ts").includes("`${SITE_URL}/how-it-works`"),
  "Sitemap includes /how-it-works",
);
assert.ok(
  read("app/llms.txt/route.ts").includes("[How it works](${SITE_URL}/how-it-works)"),
  "llms.txt includes /how-it-works",
);

console.log("How it works page (Direction 2), CLEAR copy, zero AI characters, and navigation checks passed.");
