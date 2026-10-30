"use server";

import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";

import { guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

const UPLOAD_DIR = path.join(process.cwd(), "data", "rfq-files");

/**
 * Upload attachment cho RFQ (chỉ dùng trong local dev / MVP).
 * Với Supabase mode thì sau này thay bằng storage.from("rfq-attachments").upload().
 */
export async function uploadRfqAttachmentAction(fd: FormData): Promise<void> {
  const g = await guard("rfq.manage");
  if (g) return;
  const rfqId = String(fd.get("rfq_id") || "");
  const file = fd.get("file");
  if (!rfqId) return;
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > 10 * 1024 * 1024) return;

  const rfqDir = path.join(UPLOAD_DIR, rfqId);
  await mkdir(rfqDir, { recursive: true });
  const id = randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const storagePath = `${id}-${safeName}`;
  const abs = path.join(rfqDir, storagePath);
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
