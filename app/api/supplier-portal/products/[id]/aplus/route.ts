import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { getPortalMessages } from "@/lib/i18n/server";
import { getObject, putObject } from "@/lib/media/storage";
import { extensionFor, validateUpload } from "@/lib/media/validate";
import { canEditAplus, isAplusImagePath } from "@/lib/products/aplus";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Cloudflare Stream: cần CLOUDFLARE_ACCOUNT_ID và CLOUDFLARE_STREAM_API_TOKEN (quyền Stream:Edit). */
function streamConfig(): { account: string; token: string } | null {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN?.trim();
  return account && token ? { account, token } : null;
}

/**
 * Tải lên cho nội dung A+ của một sản phẩm. `kind=image` lưu ảnh và trả đường dẫn; `kind=video`
 * xin Cloudflare một đường tải lên một lần để trình duyệt gửi thẳng tệp video tới Cloudflare,
 * máy chủ Vexim không nhận tệp video. Nội dung chỉ đổi khi nhà cung cấp bấm Lưu.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { m } = await getPortalMessages();
  const e = m.aplus.errors;
  const access = await supplierPortalAccess().catch(() => null);
  if (!access || !portalApproved(access.supplier)) return fail(e.noAccess, 403);
  const { id } = await params;
  const product = await access.store.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id || !canEditAplus(product)) return fail(e.noAccess, 403);
  if (!supplierPlanRules(access.supplier, new Date(), await readPlanCatalog()).richContent) return fail(e.plan, 403);
  if (Number(request.headers.get("content-length") ?? 0) > 4 * 1024 * 1024) return fail(e.image, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail(e.upload); }

  if (form.get("kind") === "video") {
    const config = streamConfig();
    if (!config) return fail(e.videoUnavailable, 503);
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.account)}/stream/direct_upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ maxDurationSeconds: 900, creator: access.supplier.id, meta: { name: `vexim-aplus-${id}`, product_id: id } }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json().catch(() => null) as { success?: boolean; result?: { uploadURL?: string; uid?: string } } | null;
      const uploadURL = data?.result?.uploadURL, uid = data?.result?.uid;
      if (!res.ok || !data?.success || typeof uploadURL !== "string" || !/^https:\/\//.test(uploadURL) || typeof uid !== "string" || !/^[a-f0-9]{32}$/i.test(uid)) {
        console.error("[aplus] stream direct upload failed", res.status, data);
        return fail(e.upload, 502);
      }
      return NextResponse.json({ ok: true, uploadURL, uid: uid.toLowerCase() });
    } catch (error) {
      console.error("[aplus] stream direct upload", error);
      return fail(e.upload, 502);
    }
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 3 * 1024 * 1024) return fail(e.image, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload("image", bytes, file.name);
  if (!check.ok || !check.mime || !IMAGE_MIME.has(check.mime)) return fail(e.image);
  const path = `aplus/${access.supplier.id}/${id}/${randomUUID()}.${extensionFor(check.mime)}`;
  try {
    await putObject(path, bytes, check.mime);
  } catch (error) {
    console.error("[aplus] image upload", error);
    return fail(e.upload, 500);
  }
  return NextResponse.json({ ok: true, path });
}

/** Xem trước ảnh A+ cho chính nhà cung cấp, kể cả khi sản phẩm chưa đăng. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await supplierPortalAccess().catch(() => null);
  if (!access) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!isAplusImagePath(path, access.supplier.id, id)) return new NextResponse("Not found", { status: 404 });
  const object = await getObject(path).catch(() => null);
  const mime = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!object || !mime) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(object.data as unknown as BodyInit, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
