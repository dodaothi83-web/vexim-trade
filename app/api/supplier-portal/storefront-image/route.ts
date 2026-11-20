import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { getPortalMessages } from "@/lib/i18n/server";
import { putObject } from "@/lib/media/storage";
import { extensionFor, validateUpload } from "@/lib/media/validate";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierPlanRules } from "@/lib/supplier-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Tải ảnh cho "Thiết kế trang" (banner, ảnh kèm chữ). Ảnh nằm cùng thư mục ảnh khối nội dung
 * (`suppliers/<id>/showcase-<uuid>`): chỉ công khai khi nằm trong bố cục đã áp dụng. Xem trước
 * trong cổng qua /api/supplier-portal/showcase?path=.
 */
export async function POST(request: Request) {
  const { m } = await getPortalMessages();
  const e = m.designer.errors;
  const access = await supplierPortalAccess().catch(() => null);
  if (!access || !portalApproved(access.supplier)) return NextResponse.json({ ok: false, message: m.showcase.errors.signIn }, { status: 403 });
  if (!supplierPlanRules(access.supplier).premiumStorefront) return NextResponse.json({ ok: false, message: m.designer.plan }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 4 * 1024 * 1024) return NextResponse.json({ ok: false, message: e.image }, { status: 413 });
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ ok: false, message: e.upload }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 3 * 1024 * 1024) return NextResponse.json({ ok: false, message: e.image }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload("image", bytes, file.name);
  if (!check.ok || !check.mime || !IMAGE_MIME.has(check.mime)) return NextResponse.json({ ok: false, message: e.image }, { status: 400 });
  const path = `suppliers/${access.supplier.id}/showcase-${randomUUID()}.${extensionFor(check.mime)}`;
  try {
    await putObject(path, bytes, check.mime);
  } catch (error) {
    console.error("[storefront-image] upload", error);
    return NextResponse.json({ ok: false, message: e.upload }, { status: 500 });
  }
  return NextResponse.json({ ok: true, path });
}
