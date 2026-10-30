import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { guard } from "@/lib/auth/session";
import { putObject } from "@/lib/media/storage";
import { extensionFor, validateUpload } from "@/lib/media/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ảnh tối đa cho bài viết (trình soạn khối chặn 5MB ở phía trình duyệt) */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Tải ảnh cho bài viết (ảnh bìa và ảnh trong nội dung khối).
 * Yêu cầu quyền `blog.manage`. Ảnh lưu dưới tiền tố `blog/` và được phục vụ
 * công khai qua /blog-media/... (không dùng kho media riêng tư của NCC).
 *
 * Trả về { url } để trình soạn thảo chèn vào bài.
 */
export async function POST(request: Request) {
  const gate = await guard("blog.manage");
  if (gate) return NextResponse.json({ ok: false, error: gate.message }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Không đọc được dữ liệu tải lên." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Chưa chọn ảnh nào." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Ảnh vượt quá 5MB." }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload("image", bytes, file.name);
  if (!check.ok || !check.mime) {
    return NextResponse.json({ ok: false, error: check.message ?? "Tệp không phải ảnh hợp lệ." }, { status: 400 });
  }

  const rel = `blog/${randomUUID()}.${extensionFor(check.mime)}`;
  try {
    await putObject(rel, bytes, check.mime);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Không lưu được ảnh." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, url: `/blog-media/${rel}` });
}
