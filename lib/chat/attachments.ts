import "server-only";

import { createHash } from "node:crypto";

import type { DataStore } from "@/lib/db/types";
import { deleteObject, inspectObject, presignedDownload, presignedUpload, putObject } from "@/lib/media/storage";
import { effectiveSupplierPlan } from "@/lib/supplier-plans";
import type { ChatAttachment, ChatConversation, ChatSender } from "@/lib/types";
import {
  CHAT_FILES_PER_MESSAGE, CHAT_SERVER_UPLOAD_MAX_BYTES, CHAT_UNSENT_TTL_HOURS, CHAT_UPLOADS_PER_HOUR,
  chatFileType, chatQuotaBytes, chatStorageKey, checkChatFile, contentMatchesKind, fileExtension, isSha256Hex,
  opensInline, withinChatQuota, type ChatFileKind, type ChatQuotaPlan,
} from "./attachments-core";

/**
 * Tệp đính kèm chat: tải lên (link có chữ ký, tệp không qua máy chủ), kiểm tra nội dung thật,
 * gắn vào tin, link xem/tải có hạn ngắn và việc dọn tệp. Quyền luôn kiểm theo cuộc trò chuyện:
 * chỉ hai bên của cuộc và nhân viên Vexim có quyền xem tin nhắn mới mở được tệp.
 */

export class ChatAttachmentError extends Error {
  constructor(public code: "type" | "size" | "name" | "hash" | "quota" | "rate_limited" | "not_found" | "missing" | "content" | "too_large") { super(code); }
}

export type ChatUploader = { side: "buyer"; email: string; store: DataStore } | { side: "supplier"; supplierId: string; store: DataStore };

export function uploaderKey(viewer: ChatUploader): string {
  return viewer.side === "supplier" ? `supplier:${viewer.supplierId}` : `buyer:${viewer.email.trim().toLowerCase()}`;
}

/** Thư mục trên kho của một bên: mã băm, không để lộ email hay mã nhà cung cấp trong đường dẫn. */
function storageScope(key: string): string {
  return createHash("sha256").update(`vexim-chat:${key}`).digest("hex").slice(0, 24);
}

async function quotaPlan(viewer: ChatUploader): Promise<ChatQuotaPlan> {
  if (viewer.side === "buyer") return "buyer";
  const supplier = await viewer.store.getSupplier(viewer.supplierId).catch(() => null);
  return supplier ? effectiveSupplierPlan(supplier) : "basic";
}

/** Dung lượng một bên đang dùng: mỗi tệp trên kho tính một lần dù gửi nhiều nơi. */
export async function chatStorageUsed(store: DataStore, key: string): Promise<number> {
  const rows = await store.listChatAttachmentUsage(key);
  const sizes = new Map<string, number>();
  for (const row of rows) sizes.set(row.storage_key, Math.max(sizes.get(row.storage_key) ?? 0, row.size_bytes));
  let total = 0;
  for (const size of sizes.values()) total += size;
  return total;
}

export interface ChatUploadTicket {
  attachment: { id: string; name: string; size: number; kind: ChatFileKind };
  /** null: tệp giống hệt đã có, không cần tải lên nữa. */
  upload: { url: string; method: "PUT"; headers: Record<string, string>; direct: boolean } | null;
  /** Đường tải qua máy chủ khi trình duyệt không tải thẳng lên kho được (chỉ cho tệp tới 4 MB). */
  fallbackUrl: string | null;
}

function attachmentPath(conversationId: string, id: string, side: ChatSender) {
  return `/api/chat/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(id)}?side=${side}`;
}

/** Bước 1: kiểm tra và cấp link tải lên. */
export async function beginChatUpload(input: {
  conversation: ChatConversation; viewer: ChatUploader; name: unknown; size: unknown; sha256: unknown;
}): Promise<ChatUploadTicket> {
  const { conversation, viewer } = input;
  const store = viewer.store;
  const checked = checkChatFile({ name: String(input.name ?? ""), size: Number(input.size) });
  if (!checked.ok) throw new ChatAttachmentError(checked.error);
  if (!isSha256Hex(input.sha256)) throw new ChatAttachmentError("hash");
  const sha256 = input.sha256;
  const key = uploaderKey(viewer);
  const size = Number(input.size);

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  if (await store.countChatAttachmentsSince(key, since) >= CHAT_UPLOADS_PER_HOUR) throw new ChatAttachmentError("rate_limited");

  // Cùng bên đã có tệp giống hệt (cùng nội dung, cùng loại): dùng lại, không tải lần nữa.
  const twin = await store.findReadyChatAttachment(key, sha256, size);
  if (twin && twin.content_type === checked.mime) {
    const row = await store.createChatAttachment({
      conversation_id: conversation.id, message_id: null, uploader: viewer.side, uploader_key: key,
      file_name: checked.name, content_type: checked.mime, size_bytes: size, sha256, storage_key: twin.storage_key,
      status: "ready", uploaded_at: new Date().toISOString(), expires_at: null,
    });
    return { attachment: { id: row.id, name: row.file_name, size, kind: checked.kind }, upload: null, fallbackUrl: null };
  }

  const used = await chatStorageUsed(store, key);
  if (!withinChatQuota(used, size, await quotaPlan(viewer))) throw new ChatAttachmentError("quota");

  const storageKey = chatStorageKey(storageScope(key), sha256, fileExtension(checked.name));
  const row = await store.createChatAttachment({
    conversation_id: conversation.id, message_id: null, uploader: viewer.side, uploader_key: key,
    file_name: checked.name, content_type: checked.mime, size_bytes: size, sha256, storage_key: storageKey,
    status: "pending", uploaded_at: null, expires_at: null,
  });
  const serverPath = attachmentPath(conversation.id, row.id, viewer.side);
  const direct = await presignedUpload(storageKey, checked.mime).catch((error) => {
    console.error("[chat-attachments] presign failed", error);
    return null;
  });
  const fallbackUrl = size <= CHAT_SERVER_UPLOAD_MAX_BYTES ? serverPath : null;
  if (!direct && !fallbackUrl) {
    await store.deleteChatAttachment(row.id);
    throw new ChatAttachmentError("too_large");
  }
  return {
    attachment: { id: row.id, name: row.file_name, size, kind: checked.kind },
    upload: direct
      ? { url: direct, method: "PUT", headers: { "Content-Type": checked.mime }, direct: true }
      : { url: fallbackUrl!, method: "PUT", headers: { "Content-Type": checked.mime }, direct: false },
    fallbackUrl: direct ? fallbackUrl : null,
  };
}

/** Dòng tệp của chính người đang tải, chưa gửi đi. */
async function ownPendingRow(conversation: ChatConversation, viewer: ChatUploader, id: string): Promise<ChatAttachment> {
  const row = /^[0-9a-f-]{8,64}$/i.test(id) ? await viewer.store.getChatAttachment(id) : null;
  if (!row || row.conversation_id !== conversation.id || row.uploader_key !== uploaderKey(viewer) || row.message_id || row.status === "deleted") {
    throw new ChatAttachmentError("not_found");
  }
  return row;
}

/** Đường dự phòng: trình duyệt gửi tệp (tới 4 MB) qua máy chủ, máy chủ ghi lên kho. */
export async function receiveChatUpload(input: { conversation: ChatConversation; viewer: ChatUploader; id: string; data: Uint8Array }): Promise<void> {
  const row = await ownPendingRow(input.conversation, input.viewer, input.id);
  if (row.status !== "pending") return;
  if (input.data.byteLength !== row.size_bytes || row.size_bytes > CHAT_SERVER_UPLOAD_MAX_BYTES) throw new ChatAttachmentError("size");
  const type = chatFileType(row.file_name);
  if (!type || !contentMatchesKind(type.kind, type.mime, input.data.slice(0, 4096))) throw new ChatAttachmentError("content");
  await putObject(row.storage_key, input.data, row.content_type);
}

/** Xoá tệp trên kho khi không còn dòng nào khác dùng nó. */
async function releaseObject(store: DataStore, row: Pick<ChatAttachment, "id" | "storage_key">, alsoExcluding: string[] = []): Promise<void> {
  const refs = await store.countChatAttachmentRefs(row.storage_key, [row.id, ...alsoExcluding]);
  if (refs === 0) await deleteObject(row.storage_key).catch((error) => console.error("[chat-attachments] delete failed", row.storage_key, error));
}

/** Bước 2: tệp đã lên kho; kiểm tra dung lượng và nội dung thật trước khi cho gửi. */
export async function finishChatUpload(input: { conversation: ChatConversation; viewer: ChatUploader; id: string }): Promise<{ id: string }> {
  const { viewer } = input;
  const row = await ownPendingRow(input.conversation, viewer, input.id);
  if (row.status === "ready") return { id: row.id };
  const object = await inspectObject(row.storage_key);
  if (!object) throw new ChatAttachmentError("missing");
  const type = chatFileType(row.file_name);
  const valid = object.size === row.size_bytes && type && contentMatchesKind(type.kind, type.mime, object.head);
  if (!valid) {
    await viewer.store.deleteChatAttachment(row.id);
    await releaseObject(viewer.store, row);
    throw new ChatAttachmentError(object.size === row.size_bytes ? "content" : "size");
  }
  await viewer.store.updateChatAttachment(row.id, { status: "ready", uploaded_at: new Date().toISOString() });
  return { id: row.id };
}

/** Bỏ một tệp khỏi tin đang soạn. */
export async function discardChatUpload(input: { conversation: ChatConversation; viewer: ChatUploader; id: string }): Promise<void> {
  const row = await ownPendingRow(input.conversation, input.viewer, input.id).catch(() => null);
  if (!row) return;
  await input.viewer.store.deleteChatAttachment(row.id);
  await releaseObject(input.viewer.store, row);
}

/** Kiểm tra danh sách tệp gửi kèm một tin: tối đa 5, đã tải xong, của đúng bên và đúng cuộc. */
export async function readyAttachmentsFor(store: DataStore, conversation: ChatConversation, key: string, raw: unknown): Promise<ChatAttachment[]> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ChatAttachmentError("not_found");
  const ids = [...new Set(raw.filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{8,64}$/i.test(v)))];
  if (ids.length !== raw.length || ids.length > CHAT_FILES_PER_MESSAGE) throw new ChatAttachmentError("not_found");
  const rows = await Promise.all(ids.map((id) => store.getChatAttachment(id)));
  return rows.map((row) => {
    if (!row || row.conversation_id !== conversation.id || row.uploader_key !== key || row.status !== "ready" || row.message_id) throw new ChatAttachmentError("missing");
    return row;
  });
}

export interface ChatAttachmentView {
  id: string;
  name: string;
  size: number;
  kind: ChatFileKind;
  /** Đã quá 6 tháng và đã xoá: chỉ còn tên. */
  expired: boolean;
  /** Đường mở/tải qua máy chủ (kiểm quyền rồi chuyển sang link có hạn ngắn). */
  url: string | null;
}

export function attachmentView(row: ChatAttachment, side: ChatSender | "staff"): ChatAttachmentView {
  const type = chatFileType(row.file_name);
  const expired = row.status === "deleted";
  return {
    id: row.id, name: row.file_name, size: row.size_bytes, kind: type?.kind ?? "doc", expired,
    url: expired ? null : side === "staff"
      ? `/api/crm/chat-attachments/${encodeURIComponent(row.id)}`
      : attachmentPath(row.conversation_id, row.id, side),
  };
}

export async function attachmentsByMessage(store: DataStore, messageIds: string[], side: ChatSender | "staff"): Promise<Map<string, ChatAttachmentView[]>> {
  const out = new Map<string, ChatAttachmentView[]>();
  if (!messageIds.length || typeof store.listChatAttachmentsForMessages !== "function") return out;
  const rows = await store.listChatAttachmentsForMessages(messageIds).catch((error) => {
    console.error("[chat-attachments] list failed", error);
    return [] as ChatAttachment[];
  });
  for (const row of rows) {
    if (!row.message_id) continue;
    const list = out.get(row.message_id) ?? [];
    list.push(attachmentView(row, side));
    out.set(row.message_id, list);
  }
  return out;
}

/** Tiêu đề tải xuống: tên ASCII dự phòng + tên gốc có dấu (RFC 6266). */
export function contentDisposition(name: string, inline: boolean): string {
  const ascii = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Cách phát một tệp đã kiểm quyền: link có hạn ngắn (R2) hoặc nội dung tệp (kho khác). Excel,
 * Word, CSV luôn tải về; ảnh và PDF mở ngay trừ khi người xem bấm "Tải về".
 */
export async function attachmentDelivery(row: ChatAttachment, wantDownload: boolean): Promise<{ redirect: string } | { headers: Record<string, string>; data: Uint8Array } | null> {
  if (row.status !== "ready") return null;
  const type = chatFileType(row.file_name);
  const inline = !wantDownload && Boolean(type && opensInline(type.kind));
  const disposition = contentDisposition(row.file_name, inline);
  const url = await presignedDownload(row.storage_key, { contentType: row.content_type, disposition });
  if (url) return { redirect: url };
  const { getObject } = await import("@/lib/media/storage");
  const object = await getObject(row.storage_key);
  if (!object) return null;
  return { data: object.data, headers: { "Content-Type": row.content_type, "Content-Disposition": disposition } };
}

/**
 * Việc dọn (cron chat-notify, 5 phút/lần): tệp không gửi quá 24 giờ thì xoá hẳn; tệp đã gửi quá
 * 6 tháng thì xoá khỏi kho, dòng giữ lại với trạng thái đã xoá để tin hiện "tệp đã hết hạn".
 */
export async function cleanChatAttachments(store: DataStore, now = new Date(), limit = 100): Promise<{ unsent: number; expired: number }> {
  if (typeof store.listChatAttachmentsToClean !== "function") return { unsent: 0, expired: 0 };
  const unsentBefore = new Date(now.getTime() - CHAT_UNSENT_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { unsent, expired } = await store.listChatAttachmentsToClean({ unsentBefore, now: now.toISOString(), limit });
  const batch = [...unsent, ...expired];
  const batchIds = batch.map((row) => row.id);
  // Đánh dấu trước, rồi mới xoá tệp không còn ai dùng (tính cả các dòng cùng lượt).
  for (const row of unsent) await store.deleteChatAttachment(row.id);
  for (const row of expired) await store.updateChatAttachment(row.id, { status: "deleted", deleted_at: now.toISOString() });
  const keys = new Map<string, ChatAttachment>();
  for (const row of batch) keys.set(row.storage_key, row);
  for (const row of keys.values()) await releaseObject(store, row, batchIds);
  return { unsent: unsent.length, expired: expired.length };
}

export { chatQuotaBytes };
