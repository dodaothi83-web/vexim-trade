import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import {
  ATTACHMENT_BUCKET,
  MAX_FILE_BYTES,
  MAX_FILES_PER_MAIL,
  MAX_TOTAL_BYTES,
  buildStoragePath,
  putAttachmentObject,
  sanitizeFileName,
  validateUpload,
} from "@/lib/mail/attachments";
import { cleanupOrphanAttachmentsThrottled } from "@/lib/mail/cleanup";
import type { EmailAttachment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UploadedRef {
  id: string;
  name: string;
  size: number;
  type: string;
  status: EmailAttachment["status"];
}

interface UploadResult {
  name: string;
  ok: boolean;
  message: string;
}

/**
 * Tải tệp đính kèm email lên kho RIÊNG (bucket private `email-attachments`).
 *
 * - Chỉ người có quyền `mail.send` (kiểm tra qua phiên đăng nhập ở cookie HttpOnly).
 * - Khoá service_role chỉ tồn tại ở server; trình duyệt không bao giờ thấy khoá này.
 * - Trả về metadata (id, tên, dung lượng, MIME). Nội dung tệp KHÔNG đi vào DB.
 * - Tệp vừa tải lên có trạng thái "pending"; khi gửi/lưu nháp mới gắn vào email.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
      { status: 401 },
    );
  }
  if (session.role === "viewer") {
    return NextResponse.json(
      { ok: false, message: "Tài khoản của bạn không có quyền gửi email." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // Thân request quá lớn hoặc không phải multipart
    return NextResponse.json(
      {
        ok: false,
        message: `Không đọc được tệp tải lên. Mỗi tệp tối đa ${Math.round(
          MAX_FILE_BYTES / 1024 / 1024,
        )}MB.`,
      },
      { status: 413 },
    );
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) {
    return NextResponse.json({ ok: false, message: "Chưa chọn tệp nào." }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_MAIL) {
    return NextResponse.json(
      { ok: false, message: `Chỉ được tải lên tối đa ${MAX_FILES_PER_MAIL} tệp mỗi lần.` },
      { status: 400 },
    );
  }

  const existingIds = String(form.get("messageId") ?? "").trim();
  const store = getStore();
  const attached: UploadedRef[] = [];
  const results: UploadResult[] = [];
  let totalBytes = 0;

  for (const file of files) {
    const rawName = sanitizeFileName(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());

    let check;
    try {
      check = validateUpload(rawName, file.type, bytes);
    } catch (err) {
      results.push({
        name: rawName,
        ok: false,
        message: err instanceof Error ? err.message : "Tệp không hợp lệ.",
      });
      continue;
    }
    totalBytes += check.bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      results.push({
        name: check.fileName,
        ok: false,
        message: `Tổng dung lượng vượt quá ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB.`,
      });
      continue;
    }

    const storagePath = buildStoragePath(check.ext);
    try {
      await putAttachmentObject(storagePath, check.bytes, check.mimeType);
      const row = await store.createAttachment({
        message_id: null,
        bucket: ATTACHMENT_BUCKET,
        storage_path: storagePath,
        file_name: check.fileName,
        mime_type: check.mimeType,
        size_bytes: check.bytes.byteLength,
        status: "pending",
        last_error: null,
        created_by: session.email,
      });
      attached.push({
        id: row.id,
        name: row.file_name,
        size: row.size_bytes,
        type: row.mime_type,
        status: row.status,
      });
      results.push({
        name: row.file_name,
        ok: true,
        message: `Đã tải lên (${Math.round(row.size_bytes / 1024)}KB).`,
      });
    } catch (err) {
      results.push({
        name: check.fileName,
        ok: false,
        message: err instanceof Error ? err.message : "Không lưu được tệp.",
      });
    }
  }

  // Dọn tệp mồ côi (không quá 1 lần/10 phút) — chạy nền, không chặn phản hồi
  if (attached.length) {
    void cleanupOrphanAttachmentsThrottled();
  }

  const okCount = attached.length;
  return NextResponse.json(
    {
      ok: okCount > 0,
      files: attached,
      results,
      messageId: existingIds || null,
      message:
        okCount === files.length
          ? `Đã tải lên ${okCount} tệp.`
          : okCount === 0
            ? "Không tải lên được tệp nào."
            : `Tải lên ${okCount}/${files.length} tệp.`,
    },
    { status: okCount > 0 ? 200 : 400 },
  );
}
