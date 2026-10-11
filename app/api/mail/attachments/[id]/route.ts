import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import {
  SIGNED_URL_TTL,
  createAttachmentSignedUrl,
  getAttachmentObject,
  removeAttachmentObject,
} from "@/lib/mail/attachments";
import type { EmailAttachment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Access = { ok: true; row: EmailAttachment } | { ok: false; status: number; message: string };

/**
 * Ai được chạm vào tệp này?
 *  - Tệp chưa gắn email (pending/uploaded): người tải lên, hoặc quản trị.
 *  - Tệp của email nháp: người tạo nháp, hoặc quản trị.
 *  - Tệp của email đã gửi: người có quyền `mail.view`.
 */
async function loadForAccess(id: string, session: SessionUser): Promise<Access> {
  const store = getStore();
  const row = await store.getAttachment(id);
  if (!row || row.status === "deleted") {
    return { ok: false, status: 404, message: "Không tìm thấy tệp đính kèm." };
  }

  const isAdmin = session.role === "admin";
  const mine = Boolean(row.created_by && row.created_by.toLowerCase() === session.email.toLowerCase());

  if (!row.message_id) {
    if (!mine && !isAdmin) {
      return { ok: false, status: 403, message: "Bạn không có quyền mở tệp này." };
    }
    return { ok: true, row };
  }

  const msg = await store.getMessage(row.message_id);
  if (!msg) return { ok: false, status: 404, message: "Email của tệp này không còn tồn tại." };

  if (msg.status === "draft") {
    const owner = msg.created_by ?? "";
    if (!isAdmin && owner.toLowerCase() !== session.email.toLowerCase()) {
      return { ok: false, status: 403, message: "Bản nháp này không phải của bạn." };
    }
    return { ok: true, row };
  }

  if (!hasPermission(session.role, "mail.view")) {
    return { ok: false, status: 403, message: "Tài khoản của bạn không có quyền xem email." };
  }
  return { ok: true, row };
}

/**
 * Tải tệp đính kèm.
 * Mặc định: chuyển hướng tới URL có chữ ký (hết hạn sau 2 phút, không có URL công khai).
 * Khi kho là thư mục local (chưa cấu hình Supabase): phục vụ tệp trực tiếp sau khi đã kiểm tra quyền.
 * `?format=json` trả về URL có chữ ký dạng JSON (dùng cho kiểm thử / xem trước).
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
      { status: 401 },
    );
  }

  const { id } = await ctx.params;
  const access = await loadForAccess(id, session);
  if (!access.ok) {
    return NextResponse.json({ ok: false, message: access.message }, { status: access.status });
  }
  const row = access.row;

  const url = new URL(request.url);
  const wantsJson = url.searchParams.get("format") === "json";

  const signed = await createAttachmentSignedUrl(row.storage_path, SIGNED_URL_TTL, {
    download: row.file_name,
  });

  if (signed) {
    if (wantsJson) {
      return NextResponse.json(
        { ok: true, url: signed, expiresIn: SIGNED_URL_TTL, name: row.file_name, size: row.size_bytes },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return new NextResponse(null, {
      status: 302,
      headers: { location: signed, "cache-control": "no-store" },
    });
  }

  // Kho local: đã kiểm tra quyền ở trên mới đọc tệp
  const found = await getAttachmentObject(row.storage_path);
  if (!found) {
    return NextResponse.json(
      { ok: false, message: "Tệp không còn trong kho lưu trữ." },
      { status: 404 },
    );
  }
  if (wantsJson) {
    return NextResponse.json(
      {
        ok: true,
        url: null,
        driver: found.driver,
        expiresIn: null,
        name: row.file_name,
        size: row.size_bytes,
      },
      { headers: { "cache-control": "no-store" } },
    );
  }
  return new NextResponse(new Uint8Array(found.bytes), {
    status: 200,
    headers: {
      "content-type": row.mime_type || "application/octet-stream",
      "content-length": String(found.bytes.byteLength),
      "content-disposition": `attachment; filename="${row.file_name.replace(/["\\\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      "cache-control": "no-store",
    },
  });
}

/**
 * Xoá tệp đính kèm: xoá cả tệp trong Storage lẫn dòng metadata.
 * Email đã gửi rồi thì chỉ quản trị được xoá (giữ dấu vết của email).
 * Bản nháp: xoá luôn tham chiếu trong email để không còn liên kết hỏng.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
      { status: 401 },
    );
  }
  if (!hasPermission(session.role, "mail.send")) {
    return NextResponse.json(
      { ok: false, message: "Tài khoản của bạn không có quyền xoá tệp đính kèm." },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;
  const store = getStore();
  const row = await store.getAttachment(id);
  if (!row || row.status === "deleted") {
    return NextResponse.json({ ok: false, message: "Không tìm thấy tệp đính kèm." }, { status: 404 });
  }

  const isAdmin = session.role === "admin";
  const mine = Boolean(row.created_by && row.created_by.toLowerCase() === session.email.toLowerCase());
  if (!mine && !isAdmin) {
    return NextResponse.json(
      { ok: false, message: "Tệp này do người khác tải lên, bạn không thể xoá." },
      { status: 403 },
    );
  }

  const msg = row.message_id ? await store.getMessage(row.message_id) : null;
  if (msg && msg.status !== "draft" && !isAdmin) {
    return NextResponse.json(
      { ok: false, message: "Email đã gửi — chỉ quản trị viên được xoá tệp đính kèm." },
      { status: 403 },
    );
  }

  try {
    await removeAttachmentObject(row.storage_path);
    await store.deleteAttachment(row.id);

    // Bỏ tham chiếu trong email (bản nháp hoặc email đã gửi) để không còn liên kết hỏng
    if (msg) {
      const kept = (msg.attachments ?? []).filter((a) => a.id !== row.id);
      await store.updateMessage(msg.id, { attachments: kept }).catch(() => null);
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Không xoá được tệp." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, message: `Đã xoá tệp "${row.file_name}".` });
}
