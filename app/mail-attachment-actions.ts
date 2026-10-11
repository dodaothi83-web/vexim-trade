"use server";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import {
  AttachmentError,
  ATTACHMENT_BUCKET,
  buildStoragePath,
  extensionOf,
  putAttachmentObject,
  sanitizeFileName,
  toRef,
  validateUpload,
} from "@/lib/mail/attachments";
import { getObject } from "@/lib/media/storage";
import { isExpired } from "@/lib/media/readiness";
import type { AttachmentRef } from "@/lib/types";

/**
 * Đính kèm một tệp "chia sẻ buyer" từ hồ sơ sản phẩm vào email đang soạn.
 *
 * Tệp được SAO CHÉP sang kho đính kèm email (bucket email-attachments) để luồng
 * gửi/nháp có sẵn dùng lại nguyên vẹn. Chỉ cho phép: ảnh hoặc catalogue, audience
 * "buyer", chưa hết hạn. Tệp nội bộ / chứng nhận / video không bao giờ được gửi qua đây.
 */
export async function attachProductMediaAction(
  mediaId: string,
): Promise<{ ok: true; ref: AttachmentRef } | { ok: false; message: string }> {
  const gate = await guard("mail.send");
  if (gate) return gate;
  const session = await getSession();
  if (!session) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };

  try {
    const store = getStore();
    const media = await store.getMedia(mediaId);
    if (!media || media.owner_type !== "product" || !media.product_id) {
      return { ok: false, message: "Không tìm thấy tệp sản phẩm." };
    }
    if (media.audience !== "buyer") {
      return { ok: false, message: "Tệp này chỉ dùng nội bộ, không gửi cho buyer." };
    }
    if (media.kind !== "image" && media.kind !== "catalogue") {
      return { ok: false, message: "Chỉ đính kèm được ảnh hoặc catalogue sản phẩm." };
    }
    if (isExpired(media)) {
      return { ok: false, message: "Tệp đã hết hạn, cần cập nhật trong hồ sơ sản phẩm trước." };
    }
    if (!media.storage_path) {
      return { ok: false, message: "Tệp chưa có nội dung trong kho." };
    }

    const product = await store.getProduct(media.product_id);
    if (!product) return { ok: false, message: "Không tìm thấy sản phẩm." };

    const stored = await getObject(media.storage_path);
    if (!stored) return { ok: false, message: "Không đọc được tệp từ kho lưu trữ." };

    const ext = extensionOf(media.storage_path) || extensionOf(media.caption ?? "");
    const label = media.caption?.trim() || (media.kind === "catalogue" ? "Catalogue" : "Ảnh");
    const rawName = sanitizeFileName(`${product.name} - ${label}${ext ? `.${ext}` : ""}`);

    // Dùng cùng bộ kiểm tra với tệp tải lên: giới hạn dung lượng, định dạng, MIME
    const check = validateUpload(rawName, media.mime ?? "", stored.data);

    const storagePath = buildStoragePath(check.ext);
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
    return { ok: true, ref: toRef(row) };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof AttachmentError || err instanceof Error ? err.message : "Không đính kèm được tệp.",
    };
  }
}
