import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { getObject } from "@/lib/media/storage";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = () => new NextResponse("Không tìm thấy ảnh", { status: 404, headers: { "Cache-Control": "private, no-store" } });

/** Staged photos have no media_assets row and are never served by public-media. */
export async function GET(_request: Request, { params }: { params: Promise<{ productId: string; imageId: string }> }) {
  const { productId, imageId } = await params;
  if (!UUID.test(productId) || !UUID.test(imageId)) return missing();
  try {
    const db = getSupabaseClient();
    const session = await getSession();
    if (!db || !session) return missing();
    const actor = await supabaseStore.getUser(session.uid);
    if (!actor?.is_active || actor.role !== session.role || actor.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) return missing();
    const product = await supabaseStore.getProduct(productId);
    if (!product) return missing();
    const { data: image, error } = await db.from("product_form_staged_images")
      .select("id,product_id,supplier_id,created_by,storage_path,mime")
      .eq("id", imageId).eq("product_id", productId).maybeSingle();
    if (error || !image || image.supplier_id !== product.supplier_id || image.product_id !== product.id || image.id !== imageId.toLowerCase()) return missing();
    if (session.role === "supplier") {
      const access = await supplierPortalAccess(supabaseStore);
      if (!access || !portalApproved(access.supplier) || access.user.id !== actor.id ||
          access.supplier.id !== product.supplier_id || image.created_by !== actor.id) return missing();
    } else if (!hasPermission(actor.role, "products.manage") || !hasPermission(actor.role, "media.internal")) return missing();
    const expected = `products/${productId.toLowerCase()}/${imageId.toLowerCase()}.webp`;
    if (image.storage_path !== expected || image.mime !== "image/webp") return missing();
    const object = await getObject(expected);
    if (!object) return missing();
    return new NextResponse(object.data as unknown as BodyInit, { status: 200, headers: {
      "Content-Type": "image/webp", "Content-Length": String(object.data.byteLength),
      "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    console.error("[product-form] private image read", error);
    return missing();
  }
}
