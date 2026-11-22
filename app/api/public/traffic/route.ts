import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { listPublicCategoryProducts } from "@/lib/public/product-catalog";
import { getStore } from "@/lib/db";
import { recordCountryView, recordPageView, verifyTrafficToken } from "@/lib/traffic/server";

export const runtime = "nodejs";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function readProductRef(value: unknown): { slug: string; productId: string } | null {
  if (!value || typeof value !== "object") return null;
  const { slug, productId } = value as { slug?: unknown; productId?: unknown };
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,119}$/i.test(slug)) return null;
  if (typeof productId !== "string" || !UUID.test(productId)) return null;
  return { slug, productId };
}

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
  let parsed: { token?: unknown; product?: unknown };
  try {
    const body = await request.text();
    if (body.length > 1200) return new NextResponse(null, { status: 413 });
    parsed = JSON.parse(body) ?? {};
  } catch { return new NextResponse(null, { status: 400 }); }
  const productRef = parsed.product === undefined ? null : readProductRef(parsed.product);
  if (parsed.product !== undefined && !productRef) return new NextResponse(null, { status: 400 });
  const signed = productRef ? null : verifyTrafficToken(parsed.token);
  if (!productRef && !signed) return new NextResponse(null, { status: 400 });
  try {
    let page = signed;
    if (productRef) {
      // Trang sản phẩm là bản dựng sẵn (ISR), không mang mã ký có hạn: mọi dữ kiện được tra lại ở đây,
      // nhà cung cấp lấy từ chính thẻ sản phẩm công khai chứ không tin dữ liệu trình duyệt gửi.
      const category = await getStore().getCategoryBySlug(productRef.slug);
      if (!category || category.status !== "published" || !category.is_published) return new NextResponse(null, { status: 204 });
      const card = (await listPublicCategoryProducts(category)).find((p) => p.id === productRef.productId);
      if (!card || card.isDemo) return new NextResponse(null, { status: 204 });
      const supplier = await getStore().getSupplier(card.supplierId);
      if (!supplier || isSyntheticSupplier(supplier)) return new NextResponse(null, { status: 204 });
      page = { kind: "product", supplierId: card.supplierId, resourceId: card.id, slug: productRef.slug, exp: Date.now() };
    } else if (signed?.kind === "profile") {
      const supplier = await getStore().getSupplier(signed.supplierId);
      if (!supplier || supplier.status !== "published" ||
          (supplier.slug || supplier.id) !== signed.slug || isSyntheticSupplier(supplier)) return new NextResponse(null, { status: 204 });
    } else if (signed) {
      const category = await getStore().getCategoryBySlug(signed.slug);
      if (!category || category.status !== "published" || !category.is_published) return new NextResponse(null, { status: 204 });
      const card = (await listPublicCategoryProducts(category)).find((p) => p.id === signed.resourceId);
      if (!card || card.supplierId !== signed.supplierId || card.isDemo) return new NextResponse(null, { status: 204 });
      const supplier = await getStore().getSupplier(signed.supplierId);
      if (!supplier || isSyntheticSupplier(supplier)) return new NextResponse(null, { status: 204 });
    }
    if (!page) return new NextResponse(null, { status: 400 });
    await recordPageView(page);
    // Quốc gia người xem: chỉ mã quốc gia Vercel gắn sẵn, không đọc hay lưu IP.
    await recordCountryView(page.supplierId, request.headers.get("x-vercel-ip-country")).catch(() => null);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("supplier traffic collection unavailable", error);
    return new NextResponse(null, { status: 503 });
  }
}
