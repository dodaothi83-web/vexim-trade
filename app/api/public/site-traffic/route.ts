import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { getPublishedNewsBySlug } from "@/lib/blog/queries";
import { publicSitePageKey } from "@/lib/traffic/site-path";
import { recordSitePage } from "@/lib/traffic/site";

export const runtime = "nodejs";

/** Count eligible public browser page opens only. This is approximate, not unique visitors. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try { sameOrigin = !!origin && new URL(origin).host === request.headers.get("host"); } catch { /* invalid origin */ }
  if (!sameOrigin || !request.headers.get("content-type")?.startsWith("application/json") ||
    Number(request.headers.get("content-length") || 0) > 250) return new NextResponse(null, { status: 403 });
  const ua = request.headers.get("user-agent") || "";
  if (!ua || /bot|crawler|spider|preview|lighthouse|headless|curl|wget/i.test(ua)) return new NextResponse(null, { status: 204 });
  if (await getSession()) return new NextResponse(null, { status: 204 }); // no staff/supplier self-views
  let path: unknown;
  try {
    const text = await request.text();
    if (text.length > 250) return new NextResponse(null, { status: 413 });
    path = JSON.parse(text).path;
  } catch { return new NextResponse(null, { status: 400 }); }
  const key = publicSitePageKey(path);
  if (!key) return new NextResponse(null, { status: 204 }); // excludes CRM, supplier, RFQ status tokens, product details
  try {
    if (key.startsWith("category:")) {
      const category = await getStore().getCategoryBySlug(key.slice(9));
      if (!category || category.status !== "published" || !category.is_published) return new NextResponse(null, { status: 204 });
    }
    if (key.startsWith("article:") && !await getPublishedNewsBySlug(key.slice(8))) return new NextResponse(null, { status: 204 });
    await recordSitePage(key);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("site traffic collection unavailable", error);
    return new NextResponse(null, { status: 503 });
  }
}
