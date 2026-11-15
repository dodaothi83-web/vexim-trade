import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { fill } from "@/lib/i18n/format";
import { getPortalMessages } from "@/lib/i18n/server";
import { deleteObject, getObject, putObject } from "@/lib/media/storage";
import { extensionFor, validateUpload } from "@/lib/media/validate";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierPlanRules } from "@/lib/supplier-plans";
import {
  normalizeShowcaseBlocks, SHOWCASE_BODY_MAX, SHOWCASE_MAX_BLOCKS, SHOWCASE_TITLE_MAX, showcaseTextProblem,
} from "@/lib/supplier-showcase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thêm một khối nội dung hình ảnh (ảnh + tiêu đề + mô tả) vào trang nhà cung cấp.
 * supplier_id lấy từ phiên đăng nhập; chỉ gói Premium/Pro còn hiệu lực mới thêm được.
 */
export async function POST(request: Request) {
  const { m } = await getPortalMessages();
  const e = m.showcase.errors;
  const access = await supplierPortalAccess().catch(() => null);
  if (!access || !portalApproved(access.supplier)) return NextResponse.json({ ok: false, message: e.signIn }, { status: 403 });
  const { store, supplier } = access;
  if (!supplierPlanRules(supplier).premiumStorefront) return NextResponse.json({ ok: false, message: e.plan }, { status: 403 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ ok: false, message: e.failed }, { status: 400 }); }
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const problem = showcaseTextProblem(title, body);
  if (problem) {
    const message = problem === "titleTooLong" ? fill(e.titleTooLong, { max: SHOWCASE_TITLE_MAX })
      : problem === "bodyTooLong" ? fill(e.bodyTooLong, { max: SHOWCASE_BODY_MAX }) : e[problem];
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
  const current = normalizeShowcaseBlocks(supplier.showcase_blocks);
  if (current.length >= SHOWCASE_MAX_BLOCKS) return NextResponse.json({ ok: false, message: fill(e.full, { max: SHOWCASE_MAX_BLOCKS }) }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, message: e.image }, { status: 400 });
  if (file.size > 3 * 1024 * 1024) return NextResponse.json({ ok: false, message: e.imageInvalid }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload("image", bytes, file.name);
  if (!check.ok || !check.mime) return NextResponse.json({ ok: false, message: e.imageInvalid }, { status: 400 });

  const path = `suppliers/${supplier.id}/showcase-${randomUUID()}.${extensionFor(check.mime)}`;
  try {
    await putObject(path, bytes, check.mime);
    const block = { id: randomUUID(), image_path: path, title, body };
    try {
      await store.updateSupplier(supplier.id, { showcase_blocks: [...current, block] });
    } catch (error) {
      await deleteObject(path).catch(() => null);
      throw error;
    }
    await store.addAuditLog({
      actor_id: access.user.id, actor_email: access.user.email, entity: "supplier", entity_id: supplier.id,
      action: "supplier.showcase_added", before: null, after: { block_id: block.id, title },
    }).catch((error) => console.error("[showcase] audit", error));
    return NextResponse.json({ ok: true, block });
  } catch (error) {
    console.error("[showcase] add failed", error);
    return NextResponse.json({ ok: false, message: e.failed }, { status: 500 });
  }
}

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" };

/**
 * Bản xem trước ảnh khối nội dung cho chính nhà cung cấp, kể cả khi hồ sơ chưa đăng hoặc
 * gói đã hết hạn (trang công khai khi đó không phục vụ ảnh). Chỉ đọc ảnh trong thư mục
 * của chính tài khoản đang đăng nhập.
 */
export async function GET(request: Request) {
  const access = await supplierPortalAccess().catch(() => null);
  if (!access) return new NextResponse("Not found", { status: 404 });
  const path = new URL(request.url).searchParams.get("path") ?? "";
  const prefix = `suppliers/${access.supplier.id}/showcase-`;
  if (!path.startsWith(prefix) || path.includes("..") || path.slice(prefix.length).includes("/")) return new NextResponse("Not found", { status: 404 });
  const object = await getObject(path).catch(() => null);
  if (!object) return new NextResponse("Not found", { status: 404 });
  const mime = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!mime) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(object.data as unknown as BodyInit, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
