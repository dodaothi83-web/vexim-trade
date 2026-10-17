import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { getStore } from "@/lib/db";
import { guard } from "@/lib/auth/session";
import { validateUpload, extensionFor } from "@/lib/media/validate";
import { deleteObject, putObject } from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload ảnh đại diện / ảnh bìa cho NCC.
 *
 * Ảnh được nén ở client trước khi gửi; server validate magic bytes, lưu vào
 * storage và ghi storage_path vào supplier.profile_image (field cover=1 → cover_image).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await guard("suppliers.manage");
  if (gate) return NextResponse.json({ ok: false, message: gate.message }, { status: 403 });
  const { id } = await params;
  const store = getStore();
  const sup = await store.getSupplier(id);
  if (!sup) return NextResponse.json({ ok: false, message: "Không tìm thấy NCC." }, { status: 404 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ ok: false, message: "Không đọc được dữ liệu." }, { status: 400 }); }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, message: "Chưa chọn ảnh." }, { status: 400 });
  }
  if (file.size > 3 * 1024 * 1024) {
    return NextResponse.json({ ok: false, message: "Ảnh vượt quá 3 MB sau khi nén." }, { status: 413 });
  }
  const kind = form.get("kind") === "cover" ? "cover" : "profile";

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload("image", bytes, file.name);
  if (!check.ok || !check.mime) {
    return NextResponse.json({ ok: false, message: check.message ?? "Ảnh không hợp lệ." }, { status: 400 });
  }
  const ext = extensionFor(check.mime);
  const path = `suppliers/${id}/${kind}-${randomUUID()}.${ext}`;
  try {
    await putObject(path, bytes, check.mime);
    const patch = kind === "cover" ? { cover_image: path } : { profile_image: path };
    try {
      await store.updateSupplier(id, patch);
    } catch (error) {
      // Don't leave a new orphaned file behind if a DB column/migration is missing.
      await deleteObject(path).catch(() => null);
      throw error;
    }
    return NextResponse.json({ ok: true, path });
  } catch (error) {
    console.error("[supplier-image] upload failed:", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Không lưu được ảnh." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await guard("suppliers.manage");
  if (gate) return NextResponse.json({ ok: false, message: gate.message }, { status: 403 });
  const { id } = await params;
  const store = getStore();
  const sup = await store.getSupplier(id);
  if (!sup) return NextResponse.json({ ok: false, message: "Không tìm thấy NCC." }, { status: 404 });
  const q = new URL(_request.url).searchParams;
  const kind = q.get("kind") === "cover" ? "cover" : "profile";
  const patch: Record<string, null> = {};
  patch[kind === "cover" ? "cover_image" : "profile_image"] = null;
  try {
    await store.updateSupplier(id, patch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[supplier-image] delete failed:", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Không xoá được ảnh." }, { status: 500 });
  }
}
