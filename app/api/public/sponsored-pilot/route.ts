import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { listPublicCategoryProducts } from "@/lib/public/product-catalog";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { eligiblePilotCampaign, readPilotCampaign, recordPilotEvent, sponsoredPilotEnabled, verifyPilotTicket } from "@/lib/sponsored/pilot";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sponsoredPilotEnabled()) return new NextResponse(null, { status: 404 });
  let sameOrigin = false;
  try { sameOrigin = new URL(request.headers.get("origin") || "").host === request.headers.get("host"); }
  catch { /* Invalid Origin. */ }
  if (!sameOrigin || !request.headers.get("content-type")?.startsWith("application/json") ||
    Number(request.headers.get("content-length") || 0) > 1200) return new NextResponse(null, { status: 403 });
  const ua = request.headers.get("user-agent") || "";
  if (!ua || /bot|crawler|spider|preview|lighthouse|headless|curl|wget/i.test(ua) ||
    await getSession()) return new NextResponse(null, { status: 204 });
  let ticket: unknown;
  let event: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1200) return new NextResponse(null, { status: 413 });
    ({ ticket, event } = JSON.parse(raw));
  } catch { return new NextResponse(null, { status: 400 }); }
  if (event !== "impression" && event !== "click") return new NextResponse(null, { status: 400 });
  const verified = verifyPilotTicket(ticket);
  if (!verified) return new NextResponse(null, { status: 400 });
  try {
    const campaign = await readPilotCampaign(verified.campaignId);
    if (!campaign || campaign.category_slug !== verified.categorySlug ||
      campaign.supplier_id !== verified.supplierId || campaign.product_id !== verified.productId) return new NextResponse(null, { status: 204 });
    const store = getStore();
    const category = await store.getCategoryBySlug(verified.categorySlug);
    if (!category || category.status !== "published" || !category.is_published) return new NextResponse(null, { status: 204 });
    const product = (await listPublicCategoryProducts(category)).find((p) => p.id === verified.productId);
    if (!eligiblePilotCampaign(campaign, product, category.slug)) return new NextResponse(null, { status: 204 });
    const supplier = await store.getSupplier(verified.supplierId);
    if (!supplier || isSyntheticSupplier(supplier)) return new NextResponse(null, { status: 204 });
    await recordPilotEvent(campaign.id, event);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("sponsored pilot metric unavailable", error);
    return new NextResponse(null, { status: 503 });
  }
}
