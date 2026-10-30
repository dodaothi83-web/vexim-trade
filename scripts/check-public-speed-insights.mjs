import assert from "node:assert/strict";
import { filterPublicSpeedInsight } from "../lib/public/speed-insights.ts";

for (const path of [
  "/",
  "/blog",
  "/blog/market-report",
  "/cashew",
  "/compare",
  "/for-suppliers",
  "/how-we-verify",
  "/rfq",
  "/products/cashew",
  "/products/cashew/product-123",
  "/suppliers/example",
  "/suppliers/example/products/product-123",
]) {
  const event = { type: "vital", url: `https://www.veximtrade.com${path}?token=private#secret`, route: path };
  const result = filterPublicSpeedInsight(event);
  assert.deepEqual(result, { ...event, url: `https://www.veximtrade.com${path}` });
  assert.match(event.url, /token=private/, "the input should not be mutated");
}

for (const path of [
  "/rfq/status/private-token",
  "/crm/dashboard",
  "/supplier/portal",
  "/supplier/apply",
  "/login",
  "/api/supplier-signup",
  "/blog/a/extra",
  "/products/a/b/extra",
  "/suppliers/a/products/b/extra",
]) {
  assert.equal(filterPublicSpeedInsight({ url: `https://www.veximtrade.com${path}` }), null, path);
}
assert.equal(filterPublicSpeedInsight({ url: "not-a-url" }), null);
console.log("Public Speed Insights filtering passed");
