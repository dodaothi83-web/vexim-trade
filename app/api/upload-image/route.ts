import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { guard } from "@/lib/auth/session";
import { putObject } from "@/lib/media/storage";
import { validateUpload } from "@/lib/media/validate";
import { optimizeBlogImage } from "@/lib/media/blog-image";
import { BLOG_IMAGE_MAX_BYTES, blogImageTooLargeMessage } from "@/lib/blog/image-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/**
 * Tải ảnh cho bài viết (ảnh bìa và ảnh trong nội dung khối).
 * Ảnh được chuyển sang WebP, cạnh dài tối đa 1600px trước khi lưu (lib/media/blog-image.ts).
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
  // Giới hạn chung với trình soạn thảo (lib/blog/image-limits.ts): chặn ảnh quá nặng từ đầu.
  if (file.size > BLOG_IMAGE_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: blogImageTooLargeMessage(file.size) }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload("image", bytes, file.name);
  if (!check.ok || !check.mime) {
    return NextResponse.json({ ok: false, error: check.message ?? "Tệp không phải ảnh hợp lệ." }, { status: 400 });
  }

  let image: Awaited<ReturnType<typeof optimizeBlogImage>>;
  try {
    image = await optimizeBlogImage(bytes, check.mime);
  } catch {
    return NextResponse.json({ ok: false, error: "Không đọc được ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP khác." }, { status: 400 });
  }

  const rel = `blog/${randomUUID()}.${image.ext}`;
  try {
    await putObject(rel, image.data, image.mime);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Không lưu được ảnh." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, url: `/blog-media/${rel}` });
}
