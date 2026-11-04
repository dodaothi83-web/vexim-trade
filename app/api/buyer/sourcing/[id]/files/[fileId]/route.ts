import { getBuyerSession } from "@/lib/auth/buyer-session";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { sourcingStore } from "@/lib/sourcing/store";
import { sourcingFilename, sourcingUuid } from "@/lib/sourcing/files";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const failure = (status: number) => new Response("File unavailable", { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  if (!sourcingUuid(id) || !sourcingUuid(fileId)) return failure(404);
  const [buyer, staff] = await Promise.all([getBuyerSession(), getSession()]);
  if (!buyer && !staff) return failure(401);
  try {
    const store = sourcingStore();
    const row = await store.getSourcingRequest(id);
    const own = !!buyer && row?.buyer_email === buyer.email.trim().toLowerCase();
    const account = own ? await store.getBuyerUserByEmail(buyer!.email) : null;
    if (!row || (!(own && account?.verified_at) && !(staff && hasPermission(staff.role, "rfq.view")))) return failure(404);
    const file = row.attachments.find((f) => f.id === fileId && f.key === `${id}/${fileId}`);
    if (!file) return failure(404);
    const bytes = await store.getSourcingFile(file.key);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": file.mime, "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(sourcingFilename(file.name)).replace(/'/g, "%27")}`,
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Security-Policy": "sandbox",
    } });
  } catch (cause) { console.error("[sourcing] file unavailable", cause); return failure(503); }
}
