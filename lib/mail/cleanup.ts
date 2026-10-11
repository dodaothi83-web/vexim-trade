import "server-only";

import { getStore } from "@/lib/db";
import { ORPHAN_TTL_MS, removeAttachmentObject } from "@/lib/mail/attachments";

/**
 * Tệp mồ côi = đã tải lên Storage nhưng chưa gắn vào email nào (hoặc email gửi hỏng)
 * và đã cũ. Dọn cả tệp trong Storage lẫn dòng metadata để không tốn dung lượng,
 * nhưng chỉ dọn những tệp thực sự không còn dùng được.
 */

const globalForCleanup = globalThis as unknown as { __veximAttachCleanupAt?: number };
const MIN_INTERVAL_MS = 10 * 60 * 1000;

export interface CleanupResult {
  scanned: number;
  removed: number;
  errors: string[];
}

export async function cleanupOrphanAttachments(): Promise<CleanupResult> {
  const olderThan = new Date(Date.now() - ORPHAN_TTL_MS).toISOString();
  const store = getStore();
  const rows = await store.listOrphanAttachments(olderThan);
  const result: CleanupResult = { scanned: rows.length, removed: 0, errors: [] };

  for (const row of rows) {
    try {
      await removeAttachmentObject(row.storage_path);
      await store.deleteAttachment(row.id);
      result.removed += 1;
    } catch (err) {
      result.errors.push(
        `${row.file_name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return result;
}

/** Dọn tệp mồ côi nhưng không quá 1 lần/10 phút cho mỗi tiến trình */
export async function cleanupOrphanAttachmentsThrottled(): Promise<void> {
  const last = globalForCleanup.__veximAttachCleanupAt ?? 0;
  if (Date.now() - last < MIN_INTERVAL_MS) return;
  globalForCleanup.__veximAttachCleanupAt = Date.now();
  try {
    const res = await cleanupOrphanAttachments();
    if (res.removed) {
      console.info(`[mail] Đã dọn ${res.removed}/${res.scanned} tệp đính kèm mồ côi.`);
    }
  } catch (err) {
    console.warn("[mail] Dọn tệp mồ côi thất bại:", err);
  }
}
