import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { extensionFor, validateUpload } from "@/lib/media/validate";
import { putObject } from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024; // 3MB sau khi nén ở client

/**
 * Upload ảnh hero cho category (lưu dưới categories/<uuid>.<ext>).
 * Client-side đã nén về 1600px / JPEG 0.85 qua prepareImage(),
 * server chỉ kiểm tra magic bytes rồi lưu.
 *
 * Yêu cầu quyền `suppliers.manage`.
 * Trả về { url } để lưu vào category.hero_image (dạng /public-media/categories/<file>).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await guard("categories.manage");
  if (gate) return NextResponse.json({ ok: false, error: gate.message }, { status: 403 });

  const { id } = await params;
  const store = getStore();
  const cat = await store.getCategory(id);
  if (!cat) return NextResponse.json({ ok: false, error: "Danh mục không tồn tại." }, { status: 404 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ ok: false, error: "Không đọc được dữ liệu tải lên." }, { status: 400 }); }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Chưa chọn ảnh nào." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Ảnh vượt quá 3MB." }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload("image", bytes, file.name);
  if (!check.ok || !check.mime) {
    return NextResponse.json({ ok: false, error: check.message ?? "Tệp không phải ảnh hợp lệ." }, { status: 400 });
  }

  const rel = `categories/${randomUUID()}.${extensionFor(check.mime)}`;
  try { await putObject(rel, bytes, check.mime); }
  catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Không lưu được ảnh." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, url: `/public-media/${rel}` });
}
