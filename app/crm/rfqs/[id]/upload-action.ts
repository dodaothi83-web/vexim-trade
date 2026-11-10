"use server";

import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";

import { guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { assertStaffMayProcessRfq } from "@/lib/rfq/staff-access";

const UPLOAD_DIR = path.join(process.cwd(), "data", "rfq-files");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Upload attachment cho RFQ (chỉ dùng trong local dev / MVP).
 * Với Supabase mode thì sau này thay bằng storage.from("rfq-attachments").upload().
 */
export async function uploadRfqAttachmentAction(fd: FormData): Promise<void> {
  const g = await guard("rfq.manage");
  if (g) return;
  const rfqId = String(fd.get("rfq_id") || "");
  const file = fd.get("file");
  // rfq_id đi thẳng vào đường dẫn đĩa, nên phải chặn "../" trước khi ghép path.
  if (!UUID_RE.test(rfqId)) return;
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > 10 * 1024 * 1024) return;

  await assertStaffMayProcessRfq(getStore(), rfqId);
  const rfqDir = path.join(UPLOAD_DIR, rfqId);
  if (!path.resolve(rfqDir).startsWith(path.resolve(UPLOAD_DIR) + path.sep)) return;
  await mkdir(rfqDir, { recursive: true });
  const id = randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const storagePath = `${id}-${safeName}`;
  const abs = path.join(rfqDir, storagePath);
  if (!path.resolve(abs).startsWith(path.resolve(rfqDir) + path.sep)) return;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(abs, buf);

  const store = getStore();
  await store.createRfqAttachment({
    id,
    rfq_id: rfqId,
    bucket: "local",
    storage_path: storagePath,
    file_name: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: buf.length,
    uploaded_by: null,
  });

  revalidatePath(`/crm/rfqs/${rfqId}`);
}
