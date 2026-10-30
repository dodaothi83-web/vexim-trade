// Speed Insights records the actual URL as well as the Next.js route. Only send
// metrics for known public pages: RFQ status links contain access tokens, and
// CRM/supplier/auth pages should never be included in performance reporting.
const publicPages = new Set([
  "/",
  "/blog",
  "/cashew",
  "/compare",
  "/for-suppliers",
  "/how-it-works",
  "/how-we-verify",
  "/rfq",
]);

const publicDetailPages = [
  /^\/blog\/[^/]+$/,
  /^\/products\/[^/]+(?:\/[^/]+)?$/,
  /^\/suppliers\/[^/]+(?:\/products\/[^/]+)?$/,
];

export function filterPublicSpeedInsight<T extends { url: string }>(event: T): T | null {
  try {
    const url = new URL(event.url);
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    if (!publicPages.has(pathname) && !publicDetailPages.some((pattern) => pattern.test(pathname))) {
      return null;
    }

    // Query parameters and fragments can contain private information even on
    // public pages (for example, links shared with campaign or referral data).
    return { ...event, url: `${url.origin}${pathname}` };
  } catch {
    // Fail closed if the SDK ever changes the event URL format.
    return null;
  }
}
