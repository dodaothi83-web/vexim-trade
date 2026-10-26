#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PRODUCT_COLUMN_STICKY_TOP, productColumnStickyTop } from "../lib/public/product-column-sticky.ts";

assert.equal(productColumnStickyTop(500, 900), PRODUCT_COLUMN_STICKY_TOP, "A short panel sticks below the public header");
assert.equal(productColumnStickyTop(700, 768), 44, "A nearly full-height panel keeps its bottom inside the viewport");
assert.equal(productColumnStickyTop(900, 768), -156, "A tall panel uses a negative top instead of hiding its bottom permanently");
assert.equal(productColumnStickyTop(900, 768) + 900, 744, "The tall panel bottom, including Supplied by, remains visible with a 24px margin");
assert.equal(productColumnStickyTop(Number.NaN, 768), PRODUCT_COLUMN_STICKY_TOP, "Invalid measurements use the safe header offset");
assert.equal(productColumnStickyTop(500, 0), PRODUCT_COLUMN_STICKY_TOP, "An unavailable viewport uses the safe header offset");

const component = readFileSync(new URL("../components/sticky-product-column.tsx", import.meta.url), "utf8");
assert.match(component, /"use client"/, "Viewport measurement runs only in the browser");
assert.match(component, /lg:sticky/, "Sticky is enabled at the desktop breakpoint only");
assert.match(component, /lg:self-start/, "The grid item can stick instead of stretching to the row height");
assert.match(component, /productColumnStickyTop\(panel\.offsetHeight, window\.innerHeight\)/, "The top offset responds to actual panel and viewport heights");
assert.match(component, /new ResizeObserver\(update\)/, "Image and content resize updates the sticky offset");
assert.match(component, /desktop\.addEventListener\("change", update\)/, "Leaving desktop clears the dynamic sticky offset");
assert.doesNotMatch(component, /addEventListener\("scroll"/, "CSS owns the sticky release boundary without a scroll listener");

const page = readFileSync(new URL("../app/(public)/products/[slug]/[productId]/page.tsx", import.meta.url), "utf8");
assert.match(page, /lg:items-start/, "The two-column grid provides a natural sticky release boundary");
assert.match(page, /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(0,3fr\)\]/, "The gallery and supplier panel takes 40% and product content takes 60% on desktop");
assert.match(page, /<StickyProductColumn>/, "Gallery and supplier content use the sticky left panel");
const stickyEnd = page.indexOf("</StickyProductColumn>");
assert.ok(stickyEnd > page.indexOf("<ProductMediaGallery"), "The sticky panel contains the gallery");
assert.ok(stickyEnd > page.indexOf('id="supplier-card-title"'), "The sticky panel contains Supplied by");
assert.ok(stickyEnd < page.indexOf(">Key terms</h2>"), "The commercial right column remains outside the sticky panel");
assert.ok(page.indexOf('id="full-specifications-heading"') > stickyEnd, "Full specifications stay in the accepted full-width row below both columns");

console.log("✅ Product column sticky: desktop-only offset, tall-panel visibility, natural release and full-width specifications preserved.");
