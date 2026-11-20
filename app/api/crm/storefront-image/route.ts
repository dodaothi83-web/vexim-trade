import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getStore } from "@/lib/db";
import { getObject, putObject } from "@/lib/media/storage";
import { extensionFor, validateUpload } from "@/lib/media/validate";
import { isLayoutImagePath } from "@/lib/storefront-layout";
import { activeDesignConsent } from "@/lib/supplier-portal/storefront-design";
import { supplierPlanRules } from "@/lib/supplier-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

/** Nhân viên tải ảnh khi thiết kế hộ: cần quyền suppliers.manage, đồng ý đang hiệu lực và gói Premium/Pro. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "suppliers.manage")) return fail("Không có quyền.", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 4 * 1024 * 1024) return fail("Ảnh tối đa 3 MB.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Chưa tải được ảnh."); }
  const supplierId = String(form.get("supplier_id") ?? "");
  const supplier = /^[0-9a-f-]{36}$/i.test(supplierId) ? await getStore().getSupplier(supplierId) : null;
  if (!supplier) return fail("Không tìm thấy nhà cung cấp.", 404);
  if (!supplierPlanRules(supplier).premiumStorefront) return fail("Nhà cung cấp chưa có gói Premium/Pro còn hiệu lực.", 403);
  if (!(await activeDesignConsent(supplierId))) return fail("Chưa ghi nhận đồng ý thiết kế hộ.", 403);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 3 * 1024 * 1024) return fail("Chọn ảnh JPG, PNG hoặc WebP, tối đa 3 MB.", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload("image", bytes, file.name);
  if (!check.ok || !check.mime || !IMAGE_MIME.has(check.mime)) return fail("Chọn ảnh JPG, PNG hoặc WebP, tối đa 3 MB.");
  const path = `suppliers/${supplierId}/showcase-${randomUUID()}.${extensionFor(check.mime)}`;
  try { await putObject(path, bytes, check.mime); } catch (error) {
    console.error("[crm-storefront-image] upload", error);
    return fail("Chưa tải được ảnh.", 500);
  }
  return NextResponse.json({ ok: true, path });
}

/** Xem trước ảnh trang nhà cung cấp trong CRM (kể cả ảnh bản nháp). */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "suppliers.view")) return new NextResponse("Not found", { status: 404 });
  const url = new URL(request.url);
  const supplierId = url.searchParams.get("supplier") ?? "";
  const path = url.searchParams.get("path") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(supplierId) || !isLayoutImagePath(path, supplierId)) return new NextResponse("Not found", { status: 404 });
  const object = await getObject(path).catch(() => null);
  const mime = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!object || !mime) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(object.data as unknown as BodyInit, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
