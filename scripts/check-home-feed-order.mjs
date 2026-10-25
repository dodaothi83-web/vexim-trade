#!/usr/bin/env node
// node --experimental-strip-types --no-warnings scripts/check-home-feed-order.mjs
//
// Kiểm bốn thứ: thứ tự render cố định, tối đa tám danh mục, phân trang 15 sản
// phẩm trên desktop, và ô tìm kiếm vẫn trỏ vào lưới danh mục.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";

import {
  arrangeSupplierProducts,
  HOME_FEED_PER_PAGE,
  HOME_FEED_PER_PAGE_WIDE,
  HOME_FEED_WIDE_QUERY,
  feedPerPage,
  HOME_FEED_PER_SUPPLIER,
} from "../lib/public/supplier-product-order.ts";

/* ---------------- 1. Giới hạn nhà cung cấp ---------------- */

const many = (suppliers, perSupplier) =>
  Array.from({ length: suppliers * perSupplier }, (_, i) => ({ supplierId: `s${i % suppliers}` }));

assert.equal(HOME_FEED_PER_SUPPLIER, 2, "Two products per supplier, so one company cannot fill the homepage");
const cappedForOneSeller = arrangeSupplierProducts(many(1, 20), HOME_FEED_PER_SUPPLIER).shown;
assert.equal(cappedForOneSeller.length, HOME_FEED_PER_SUPPLIER, "The existing per-supplier cap stays unchanged");
assert.equal(arrangeSupplierProducts([], HOME_FEED_PER_SUPPLIER).shown.length, 0, "Empty input stays empty");

/* ---------------- 2. Render thật ---------------- */

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");

function compile(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (key) => {
      if (!(key in mocks)) throw new Error(`Unexpected import: ${key}`);
      return mocks[key];
    },
    process,
    console,
    Date,
    Intl,
    Set,
    Map,
    React,
  });
  return exports;
}

const category = {
  id: "c-pepper",
  slug: "pepper",
  name_i18n: { en: "Pepper" },
  intro_i18n: { en: "Vietnamese pepper" },
  status: "published",
  is_published: true,
  active_on_homepage: true,
  public_page_ready: true,
};

const offer = (id, supplierId) => ({
  id,
  name: `Pepper lot ${id}`,
  grade: "550 g/L",
  attributes: {},
  moq: "1 MT",
  price: null,
  pricePoint: null,
  isDemoSupplier: false,
  province: "Dak Lak",
  verificationCount: 2,
  verificationSteps: [],
  supplierName: `Supplier ${supplierId}`,
  supplierId,
  supplierSlug: `supplier-${supplierId}`,
  leadTimeDays: 14,
  incoterm: "FOB",
  oem: false,
  odm: false,
  samples: true,
  isDemo: false,
  imagePaths: [],
  cardImagePath: null,
});

async function renderHome(offers, categoryItems = [category]) {
  const { default: HomeContent } = compile("../app/(public)/home.tsx", {
    "react/jsx-runtime": jsx,
    "next/image": { default: ({ src, alt }) => React.createElement("img", { src, alt }) },
    "next/link": { default: ({ href, children, ...rest }) => React.createElement("a", { href, ...rest }, children) },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/lib/db": { getStore: () => ({ listCategories: async () => categoryItems, listSuppliers: async () => [] }) },
    "@/lib/blog/queries": { listPublishedNews: async () => [] },
    "@/lib/public/product-catalog": { listPublicCategoryProducts: async () => offers },
    "@/lib/public/supplier-product-order": {
      arrangeSupplierProducts,
      HOME_FEED_PER_PAGE,
      HOME_FEED_PER_SUPPLIER,
    },
    "@/lib/public/popular-searches": { buildPopularSearches: () => [] },
    "@/lib/public/meta-copy": { HOME_HERO_LINE: "Verified Vietnamese suppliers" },
    "@/components/public-product-card": {
      PublicProductCard: ({ name }) => React.createElement("div", { "data-product": name }, name),
    },
    "@/components/home-product-feed": {
      // Bản thay thế dựng trang đầu ở desktop (15 thẻ) để kiểm thứ tự render.
      HomeProductFeed: ({ items }) => {
        const size = feedPerPage(true);
        return React.createElement(
          "div",
          {},
          items.slice(0, size).map((p) => React.createElement("div", { "data-product": p.name, key: p.id }, p.name)),
          items.length > size ? React.createElement("p", { key: "pager" }, `1/${Math.ceil(items.length / size)}`) : null,
        );
      },
    },
    "@/components/service-registration-section": { ServiceRegistrationSection: () => null },
    "@/components/cookie-consent": { CookieSettingsButton: () => null },
    "@/components/brand-logo": { Logo: () => null },
    "@/components/platform-legal-strip": { PlatformLegalStrip: () => null },
    "@/components/social-links": { SocialLinks: () => null },
  });
  return renderToStaticMarkup(await HomeContent());
}

/* Có hàng: lưới sản phẩm luôn đứng trước danh mục và lấy 15 thẻ ở trang đầu. */
const full = await renderHome(many(10, 2).map((p, i) => offer(`p${i}`, p.supplierId)));
const feedAt = full.indexOf('aria-labelledby="home-products-title"');
const categoriesAt = full.indexOf('id="categories"');

assert.ok(feedAt > -1, "A populated feed renders the product section");
assert.ok(categoriesAt > -1, "The category grid is still on the page");
assert.ok(feedAt < categoriesAt, "The feed sits above the categories");
assert.ok(full.includes("Featured Marketplace Offers"), "The feed keeps its label");
assert.equal(full.match(/data-product=/g).length, 15, "Desktop page one renders 15 products in three rows of five");
assert.ok(full.includes("1/2"), "Products after the first 15 remain available on page two");

assert.ok(full.includes("images.pexels.com/photos/30658831"), "The homepage uses the real Pexels coffee-production photo");
assert.match(full, /fm=webp(?:&amp;|&)w=960(?:&amp;|&)q=72 960w/, "The responsive srcset requests a compressed 960px WebP");
assert.ok(full.includes("1920w"), "The srcset also covers wide screens without using the original stock file");
assert.match(full, /loading="eager"/, "The LCP hero loads immediately");
assert.match(full, /fetchPriority="high"/i, "The LCP hero keeps high fetch priority");
const homeSource = readFileSync(new URL("../app/(public)/home.tsx", import.meta.url), "utf8");
assert.doesNotMatch(homeSource, /loader=\{homeHeroLoader\}/, "The server homepage does not pass a loader function to a Client Component");
assert.match(homeSource, /srcSet=\{HOME_HERO_SRCSET\}/, "The hero uses static responsive URLs instead of a function prop");

/* Ít hàng cũng giữ cùng vị trí, không còn ngưỡng chuyển xuống dưới. */
const thin = await renderHome([offer("a1", "A"), offer("a2", "A")]);
const thinFeedAt = thin.indexOf('aria-labelledby="home-products-title"');
const thinCategoriesAt = thin.indexOf('id="categories"');

assert.ok(thinFeedAt > -1, "Two products still render, so nothing is lost while the catalogue is small");
assert.ok(thinFeedAt > -1 && thinFeedAt < thinCategoriesAt, "A thin feed also stays above the category grid");
assert.deepEqual(thin.match(/data-product=/g), ["data-product=", "data-product="], "Both real offers are shown");

/* Không có hàng: không render khối nào. */
const empty = await renderHome([]);
assert.ok(!empty.includes('aria-labelledby="home-products-title"'), "No products means no empty section at all");
assert.ok(empty.includes('id="categories"'), "The category grid carries the page on its own");

/* Tối đa tám danh mục, bốn cột trên desktop và hai cột ở màn nhỏ. */
const tenCategories = Array.from({ length: 10 }, (_, i) => ({
  ...category,
  id: `c-${i + 1}`,
  slug: `category-${i + 1}`,
  name_i18n: { en: `Category ${i + 1}` },
  sort_order: i + 1,
}));
const categoryPage = await renderHome([], tenCategories);
const categoryStart = categoryPage.indexOf('id="categories"');
const categoryHtml = categoryPage.slice(categoryStart, categoryPage.indexOf("</section>", categoryStart));
assert.equal((categoryHtml.match(/<h3/g) ?? []).length, 8, "Only eight category cards render from ten active categories");
assert.ok(!categoryHtml.includes("Category 9"), "The ninth category moves off the homepage rather than creating a partial third row");
assert.match(categoryHtml, /grid-cols-2[^"\n]*lg:grid-cols-4/, "Categories use two columns on phones and four on desktop");
assert.match(categoryHtml, /hidden text-\[13\.5px\][^"\n]*sm:line-clamp-3/, "Category introductions stay on desktop and are hidden on phones");
assert.match(categoryHtml, /mt-5 hidden border-t[^"\n]*sm:block/, "The Browse products footer stays on desktop and is hidden on phones");

/* ---------------- 2b. Chia trang lưới sản phẩm ---------------- */

const feedModule = compile("../components/home-product-feed.tsx", {
  react: React,
  "react/jsx-runtime": jsx,
  "lucide-react": new Proxy({}, { get: () => () => null }),
  "@/lib/public/supplier-product-order": { HOME_FEED_PER_PAGE, HOME_FEED_WIDE_QUERY, feedPerPage },
  "@/components/public-product-card": {
    PublicProductCard: ({ name }) => React.createElement("div", { "data-product": name }, name),
  },
});

const renderFeed = (items, perPage) =>
  renderToStaticMarkup(React.createElement(feedModule.HomeProductFeed, { items, perPage, isVi: false }));

assert.equal(HOME_FEED_PER_PAGE, 6, "Điện thoại một cột và máy tính bảng ba cột: sáu thẻ vẫn là số lượng mobile và tablet");
assert.equal(HOME_FEED_PER_PAGE_WIDE, 15, "Desktop năm cột: 15 thẻ là ba hàng đầy");
assert.equal(feedPerPage(false), 6, "Dưới 1024px dùng sáu thẻ");
assert.equal(feedPerPage(true), 15, "Từ 1024px dùng 15 thẻ");
assert.equal(HOME_FEED_WIDE_QUERY, "(min-width: 1024px)", "Mốc năm cột khớp với lg: của lưới");

const nineOffers = Array.from({ length: 9 }, (_, i) => offer(`n${i}`, `S${i}`));
const firstOfTwo = renderFeed(nineOffers);
assert.equal(firstOfTwo.match(/data-product=/g).length, 6, "Only one page of cards is rendered at a time");
assert.ok(firstOfTwo.includes("1/2"), "The counter reads page one of two");
assert.match(firstOfTwo, /disabled="" aria-label="Previous page"/, "The previous button is inert on the first page");
assert.ok(!firstOfTwo.includes('disabled="" aria-label="Next page"'), "The next button is live on the first page");

const singlePage = renderFeed(Array.from({ length: 6 }, (_, i) => offer(`f${i}`, `T${i}`)));
assert.equal(singlePage.match(/data-product=/g).length, 6);
assert.ok(!singlePage.includes("<nav"), "Six products fill exactly one page, so no pager is shown");

const twentyOffers = Array.from({ length: 20 }, (_, i) => offer(`w${i}`, `U${i}`));
assert.ok(renderFeed(twentyOffers).includes("1/4"), "Twenty products split into four pages of six");

/* Desktop: 15 thẻ mỗi trang, phần còn lại nằm nguyên ở trang sau. */
const wideOffers = Array.from({ length: 22 }, (_, i) => offer(`x${i}`, `V${i % 3}`));
const wideFirst = renderFeed(wideOffers, HOME_FEED_PER_PAGE_WIDE);
assert.equal(wideFirst.match(/data-product=/g).length, 15, "Trang đầu ở desktop đủ 15 thẻ");
assert.ok(wideFirst.includes("1/2"), "Hai mươi hai sản phẩm chia hai trang: 15 và 7");
const wideItems = Array.from({ length: 22 }, (_, i) => ({ id: `y${i}` }));
const wideLast = feedModule.pageSlice(wideItems, 2, HOME_FEED_PER_PAGE_WIDE);
assert.equal(wideLast.shown.length, 7, "Trang cuối giữ đủ bảy sản phẩm còn lại");
const wideSeen = [
  ...feedModule.pageSlice(wideItems, 1, HOME_FEED_PER_PAGE_WIDE).shown,
  ...wideLast.shown,
];
assert.equal(new Set(wideSeen.map((item) => item.id)).size, 22, "Pagination neither drops nor duplicates products");

/* Bốn trang thật: đủ 24 thẻ thì mỗi trang đầy sáu, không trùng, không sót. */
const twentyFour = Array.from({ length: 24 }, (_, i) => ({ id: `d${i}` }));
const pages = [1, 2, 3, 4].map((n) => feedModule.pageSlice(twentyFour, n));
assert.equal(pages.map((p) => p.shown.length).join(","), "6,6,6,6", "Four pages of six");
assert.equal(pages[3].pageCount, 4);
const seenIds = pages.flatMap((p) => p.shown.map((item) => item.id));
assert.equal(new Set(seenIds).size, 24, "Every product appears exactly once across the pages");
assert.equal(feedModule.pageSlice(twentyFour, 0).current, 1, "Page zero clamps to the first page");
assert.equal(feedModule.pageSlice(twentyFour, 9).current, 4, "A page past the end clamps to the last page");
assert.equal(feedModule.pageSlice([], 3).shown.length, 0, "An empty list has one empty page, not NaN");

/* Tự chuyển trang: chỉ khi lưới đã khuất, và mỗi điều kiện dừng đều chặn được. */
const allowed = {
  pageCount: 4,
  seen: true,
  stopped: false,
  tabHidden: false,
  onScreen: false,
  reducedMotion: false,
};
const { autoAdvanceAllowed, nextAutoPage } = feedModule;
assert.equal(autoAdvanceAllowed(allowed), true, "A grid that has been seen and is now off-screen may advance");
for (const [key, label] of [
  ["seen", "The visitor has not seen the grid yet, so it must start at page one"],
  ["stopped", "A click stops the rotation for good"],
  ["tabHidden", "A hidden tab does not rotate"],
  ["onScreen", "Never rotate while the cards are on screen"],
  ["reducedMotion", "Reduced motion turns the rotation off entirely"],
]) {
  assert.equal(autoAdvanceAllowed({ ...allowed, [key]: !allowed[key] }), false, label);
}
assert.equal(autoAdvanceAllowed({ ...allowed, pageCount: 1 }), false, "One page needs no rotation");
assert.equal(nextAutoPage(1, 4), 2);
assert.equal(nextAutoPage(3, 4), 4);
assert.equal(nextAutoPage(4, 4), 1, "After the last page it starts over instead of getting stuck");

/* ---------------- 3. Ô tìm kiếm vẫn trỏ vào lưới danh mục ---------------- */

const home = readFileSync(new URL("../app/(public)/home.tsx", import.meta.url), "utf8");
assert.ok(
  home.includes('action="/#categories"'),
  "Submitting the hero search still lands on the category grid, even when the feed is above it",
);
assert.ok(
  !home.includes('action="/#home-products-title"'),
  "Search results are never redirected into the product feed",
);
assert.ok(
  !home.includes("shouldPromoteProductFeed") && !home.includes("promoteFeed"),
  "The old catalogue-size placement rule is gone",
);
assert.equal((home.match(/\{productFeedSection\}/g) ?? []).length, 1, "The single feed has one fixed render position");
assert.ok(
  !/arrangeSupplierProducts\(offers, 2\)/.test(home),
  "The per-supplier cap comes from the shared constant, not a literal",
);
assert.ok(
  full.indexOf('id="categories"') < full.indexOf("home-news-title"),
  "The blog block stays last, below both the feed and the categories",
);

const feedSource = readFileSync(new URL("../components/home-product-feed.tsx", import.meta.url), "utf8");
assert.ok(feedSource.includes("prefers-reduced-motion"), "The rotation respects the reduced-motion setting");
assert.ok(feedSource.includes("visibilitychange"), "The rotation pauses when the tab is hidden");
assert.ok(feedSource.includes("IntersectionObserver"), "The rotation is driven by whether the grid is on screen");
assert.ok(feedSource.includes('wide ? " lg:grid-cols-5" : ""'), "Desktop switches to five columns with the 15-card page size");

console.log("check-home-feed-order: fixed section order, eight categories, 15-card desktop pages, and search anchor passed");
