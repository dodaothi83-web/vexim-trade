import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { validateUpload, extensionFor } from "@/lib/media/validate";
import { deleteObject, putObject } from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ảnh đại diện / ảnh bìa do chính nhà cung cấp tải lên từ cổng NCC.
 *
 * Khác với route của CRM (nhân viên sửa hộ), ở đây `supplier_id` lấy từ tài khoản đang
 * đăng nhập, không nhận từ client: NCC chỉ đổi được ảnh của chính mình. Ảnh nén sẵn ở
 * client, server vẫn kiểm magic bytes và dung lượng trước khi ghi vào kho tệp.
 */
export async function POST(request: Request) {
  const access = await supplierPortalAccess().catch(() => null);
  if (!access || !portalApproved(access.supplier)) {
    return NextResponse.json({ ok: false, message: "Cổng nhà cung cấp chưa mở cho tài khoản này." }, { status: 403 });
  }
  const { store, supplier } = access;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Không đọc được dữ liệu tải lên." }, { status: 400 });
  }

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

  const path = `suppliers/${supplier.id}/${kind}-${randomUUID()}.${extensionFor(check.mime)}`;
  try {
    await putObject(path, bytes, check.mime);
    try {
      await store.updateSupplier(supplier.id, kind === "cover" ? { cover_image: path } : { profile_image: path });
    } catch (error) {
      // Không để lại tệp mồ côi nếu cột chưa được migrate.
      await deleteObject(path).catch(() => null);
      throw error;
    }
    return NextResponse.json({ ok: true, path });
  } catch (error) {
    console.error("[supplier-portal] tải ảnh hồ sơ thất bại", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Không lưu được ảnh." }, { status: 500 });
  }
}
