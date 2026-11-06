import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getBuyerSession } from "@/lib/auth/buyer-session";
import { protectPublicRequest } from "@/lib/auth/abuse-protection";
import { sourcingStore } from "@/lib/sourcing/store";
import { sendSourcingAck } from "@/lib/sourcing/mail";
import { SOURCING_MAX_BODY_BYTES, SOURCING_MAX_FILE_BYTES, SOURCING_MAX_FILES, sourcingMime, sourcingUuid, sourcingFilename } from "@/lib/sourcing/files";
import type { SourcingRequest } from "@/lib/types";

export const runtime = "nodejs";
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const session = await getBuyerSession();
  if (!session) return json({ error: "Please sign in again.", code: "auth" }, 401);
  let sameOrigin = false;
  try { sameOrigin = new URL(request.headers.get("origin") || "").host === request.headers.get("host"); } catch { /* invalid Origin */ }
  if (!sameOrigin) return json({ error: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) return json({ error: "Invalid form." }, 415);
  const vi = request.headers.get("accept-language")?.startsWith("vi");
  const error = (en: string, vn: string, status = 400) => json({ error: vi ? vn : en }, status);
  const staged: string[] = [];
  let store: ReturnType<typeof sourcingStore> | undefined;
  let saving = false;
  try {
    // Bound even chunked uploads, before parsing multipart data.
    if (Number(request.headers.get("content-length")) > SOURCING_MAX_BODY_BYTES) return error("Files are too large.", "Tệp vượt dung lượng cho phép.", 413);
    const reader = request.body?.getReader();
    if (!reader) return error("Empty form.", "Biểu mẫu trống.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > SOURCING_MAX_BODY_BYTES) { await reader.cancel(); return error("Files are too large.", "Tệp vượt dung lượng cho phép.", 413); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let form: FormData;
    try { form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
    catch { return error("Invalid form.", "Biểu mẫu không hợp lệ."); }
    const content = String(form.get("content") ?? "").trim();
    const key = String(form.get("submission_key") ?? "");
    if (!sourcingUuid(key) || content.length < 1 || content.length > 6000) return error("Please enter your requirement (up to 6,000 characters).", "Vui lòng nhập nhu cầu tìm nguồn (tối đa 6.000 ký tự).");
    const files = form.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
    if (files.length > SOURCING_MAX_FILES || files.some((f) => f.size > SOURCING_MAX_FILE_BYTES)) return error("Attach up to 3 files, 2 MB each.", "Tối đa 3 tệp, mỗi tệp không quá 2 MB.");
    const protection = await protectPublicRequest({ flow: "sourcing-request", headers: request.headers, email: session.email, token: String(form.get("challengeToken") ?? "") });
    if (!protection.ok) return error("Security check failed or request limit reached. Please try again later.", protection.message, protection.status);
    store = sourcingStore();
    const account = await store.getBuyerUserByEmail(session.email);
    if (!account?.verified_at || account.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) return json({ error: vi ? "Vui lòng đăng nhập lại." : "Please sign in again.", code: "auth" }, 401);
    const email = account.email.trim().toLowerCase();
    const previous = await store.findSourcingSubmission(email, key);
    if (previous) return json({ id: previous.id });
    const validated = await Promise.all(files.map(async (f) => {
      const data = new Uint8Array(await f.arrayBuffer()); const mime = sourcingMime(data);
      return { data, mime, name: sourcingFilename(f.name) };
    }));
    if (validated.some((f) => !f.mime)) return error("Only PDF, JPG, PNG and WEBP files are supported.", "Chỉ hỗ trợ tệp PDF, JPG, PNG và WEBP.");
    const id = randomUUID(); const now = new Date().toISOString();
    const row: SourcingRequest = { id, buyer_email: email, submission_key: key, content, attachments: [], status: "new", assigned_to: null, internal_note: null, buyer_reply: null, version: 1, created_at: now, updated_at: now };
    for (const file of validated) {
      const fileId = randomUUID(); const path = `${id}/${fileId}`;
      await store.putSourcingFile(path, file.data, file.mime!); staged.push(path);
      row.attachments.push({ id: fileId, key: path, name: file.name, size: file.data.length, mime: file.mime! });
    }
    saving = true;
    const saved = await store.createSourcingRequest(row);
    saving = false;
    // A concurrent retry won the unique key. Remove only our unused upload keys.
    if (saved.id !== id) await Promise.allSettled(staged.map((path) => store!.deleteSourcingFile(path)));
    // Thư xác nhận chỉ gửi một lần cho yêu cầu mới; lỗi gửi không làm hỏng yêu cầu đã lưu.
    else await sendSourcingAck(store, saved, vi ? "vi" : "en")
      .catch((err) => console.error("[sourcing] acknowledgement email failed", err));
    return json({ id: saved.id }, 201);
  } catch (cause) {
    // An uncertain database insert may already have committed. Never delete its attachments.
    if (store && !saving) await Promise.allSettled(staged.map((path) => store!.deleteSourcingFile(path)));
    console.error("[sourcing] submission unavailable", cause);
    return error("Could not confirm delivery. Your draft is kept; please retry.", "Chưa xác nhận được việc gửi. Nội dung vẫn được giữ; vui lòng thử lại.", 503);
  }
}
