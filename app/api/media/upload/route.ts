import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { getStore } from "@/lib/db";
import { guard } from "@/lib/auth/session";
import { extensionFor, validateUpload } from "@/lib/media/validate";
import { putObject } from "@/lib/media/storage";
import type { MediaAudience, MediaInput, MediaKind, MediaOwnerType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: MediaKind[] = ["image", "catalogue", "certificate", "document"];

interface UploadResult {
  name: string;
  ok: boolean;
  message: string;
}

/**
 * Tải tệp lên hồ sơ sản phẩm / hồ sơ NCC. Yêu cầu quyền `media.manage`.
 *
 * Ảnh được NÉN NGAY Ở TRÌNH DUYỆT trước khi tới đây (xem lib/media/client-image.ts),
 * server chỉ kiểm tra magic bytes – định dạng – dung lượng rồi lưu vào kho media.
 * Riêng video không tải tệp lên, chỉ lưu link (server action riêng).
 */
export async function POST(request: Request) {
  const gate = await guard("media.manage");
  if (gate) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Không đọc được dữ liệu tải lên." }, { status: 400 });
  }

  const ownerType = String(form.get("ownerType") ?? "") as MediaOwnerType;
  const ownerId = String(form.get("ownerId") ?? "").trim();
  const kind = String(form.get("kind") ?? "image") as MediaKind;
  const captionRaw = String(form.get("caption") ?? "").trim();
  const expiresRaw = String(form.get("expiresOn") ?? "").trim();
  let audience = String(form.get("audience") ?? "") as MediaAudience;

  if (ownerType !== "product" && ownerType !== "supplier") {
    return NextResponse.json({ ok: false, message: "Đối tượng lưu tệp không hợp lệ." }, { status: 400 });
  }
  if (!ownerId) {
    return NextResponse.json({ ok: false, message: "Thiếu hồ sơ cần gắn tệp." }, { status: 400 });
  }
  if (!KINDS.includes(kind)) {
    return NextResponse.json(
      { ok: false, message: "Loại tệp không hợp lệ (video chỉ nhận link)." },
      { status: 400 },
    );
  }

  const store = getStore();

  // Xác thực hồ sơ tồn tại để không tạo tệp mồ côi
  if (ownerType === "product") {
    const product = await store.getProduct(ownerId);
    if (!product) {
      return NextResponse.json({ ok: false, message: "Không tìm thấy sản phẩm." }, { status: 404 });
    }
    const supplierId = String(form.get("supplierId") ?? "").trim();
    if (supplierId && supplierId !== product.supplier_id) {
      return NextResponse.json(
        { ok: false, message: "Sản phẩm không thuộc nhà cung cấp này." },
        { status: 400 },
      );
    }
  } else {
    const supplier = await store.getSupplier(ownerId);
    if (!supplier) {
      return NextResponse.json({ ok: false, message: "Không tìm thấy nhà cung cấp." }, { status: 404 });
    }
  }

  // Giấy tờ nội bộ (giấy phép, xác minh NCC) luôn chỉ nội bộ, không chia sẻ buyer
  if (kind === "document") audience = "internal";
  if (audience !== "buyer" && audience !== "internal") {
    audience = ownerType === "supplier" ? "internal" : "buyer";
  }
  // Chỉ người có quyền xem tài liệu nội bộ mới được tạo tệp nội bộ
  if (audience === "internal") {
    const docGate = await guard("media.internal");
    if (docGate) {
      return NextResponse.json(
        { ok: false, message: "Bạn không có quyền thêm giấy tờ nội bộ." },
        { status: 403 },
      );
    }
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) {
    return NextResponse.json({ ok: false, message: "Chưa chọn tệp nào." }, { status: 400 });
  }

  const prefix = ownerType === "product" ? `products/${ownerId}` : `suppliers/${ownerId}`;
  const results: UploadResult[] = [];
  const created: string[] = [];

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateUpload(kind, bytes, file.name);
    if (!check.ok || !check.mime) {
      results.push({ name: file.name, ok: false, message: check.message ?? "Tệp không hợp lệ." });
      continue;
    }

    const id = randomUUID();
    const ext = extensionFor(check.mime);
    const mainPath = `${prefix}/${id}.${ext}`;

    try {
      await putObject(mainPath, bytes, check.mime);

      // Ảnh: lưu kèm bản xem trước do trình duyệt gửi lên
      let thumbPath: string | null = null;
      const thumb = form.get(`thumb:${file.name}`);
      if (kind === "image" && thumb instanceof File && thumb.size > 0) {
        const thumbBytes = new Uint8Array(await thumb.arrayBuffer());
        const thumbCheck = validateUpload("image", thumbBytes, `${file.name} (ảnh nhỏ)`);
        if (thumbCheck.ok && thumbCheck.mime) {
          thumbPath = `${prefix}/${id}-thumb.${extensionFor(thumbCheck.mime)}`;
          await putObject(thumbPath, thumbBytes, thumbCheck.mime);
        }
      }

      const widthRaw = Number(form.get(`width:${file.name}`) ?? 0);
      const heightRaw = Number(form.get(`height:${file.name}`) ?? 0);

      const input: MediaInput = {
        owner_type: ownerType,
        product_id: ownerType === "product" ? ownerId : null,
        supplier_id: ownerType === "supplier" ? ownerId : null,
        kind,
        audience,
        status: "unverified",
        expires_on: expiresRaw || null,
        caption: captionRaw || file.name,
        storage_path: mainPath,
        thumb_path: thumbPath,
        external_url: null,
        mime: check.mime,
        bytes: bytes.byteLength,
        width: kind === "image" && widthRaw > 0 ? widthRaw : null,
        height: kind === "image" && heightRaw > 0 ? heightRaw : null,
        sort_order: 0,
        created_by: String(form.get("createdBy") ?? "").trim() || null,
      };

      const row = await store.createMedia(input);
      created.push(row.id);
      results.push({ name: file.name, ok: true, message: "Đã tải lên — trạng thái: chưa xác minh." });
    } catch (err) {
      results.push({
        name: file.name,
        ok: false,
        message: err instanceof Error ? err.message : "Lỗi khi lưu tệp.",
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json(
    {
      ok: okCount > 0,
      created,
      results,
      message:
        okCount === results.length
          ? `Đã tải lên ${okCount} tệp.`
          : okCount === 0
            ? "Không tải lên được tệp nào."
            : `Tải lên ${okCount}/${results.length} tệp.`,
    },
    { status: okCount > 0 ? 200 : 400 },
  );
}
