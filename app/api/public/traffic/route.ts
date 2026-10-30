import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { listPublicCategoryProducts } from "@/lib/public/product-catalog";
import { getStore } from "@/lib/db";
import { recordPageView, verifyTrafficToken } from "@/lib/traffic/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try { sameOrigin = !!origin && new URL(origin).host === request.headers.get("host"); } catch { /* Invalid Origin. */ }
  if (!sameOrigin ||
      !request.headers.get("content-type")?.startsWith("application/json") ||
      Number(request.headers.get("content-length") || 0) > 1200) {
    return new NextResponse(null, { status: 403 });
  }
  const ua = request.headers.get("user-agent") || "";
  if (!ua || /bot|crawler|spider|preview|lighthouse|headless|curl|wget/i.test(ua)) return new NextResponse(null, { status: 204 });
  if (await getSession()) return new NextResponse(null, { status: 204 }); // exclude staff/supplier self-views
  let token: unknown;
  try {
    const body = await request.text();
    if (body.length > 1200) return new NextResponse(null, { status: 413 });
    token = JSON.parse(body).token;
  } catch { return new NextResponse(null, { status: 400 }); }
  const page = verifyTrafficToken(token);
  if (!page) return new NextResponse(null, { status: 400 });
  try {
    if (page.kind === "profile") {
      const supplier = await getStore().getSupplier(page.supplierId);
      if (!supplier || supplier.status !== "published" ||
          (supplier.slug || supplier.id) !== page.slug || isSyntheticSupplier(supplier)) return new NextResponse(null, { status: 204 });
    } else {
      const category = await getStore().getCategoryBySlug(page.slug);
      if (!category || category.status !== "published" || !category.is_published) return new NextResponse(null, { status: 204 });
      const card = (await listPublicCategoryProducts(category)).find((p) => p.id === page.resourceId);
      if (!card || card.supplierId !== page.supplierId || card.isDemo) return new NextResponse(null, { status: 204 });
      const supplier = await getStore().getSupplier(page.supplierId);
      if (!supplier || isSyntheticSupplier(supplier)) return new NextResponse(null, { status: 204 });
    }
    await recordPageView(page);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("supplier traffic collection unavailable", error);
    return new NextResponse(null, { status: 503 });
  }
}
