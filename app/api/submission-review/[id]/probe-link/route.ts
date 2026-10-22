import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { guard } from "@/lib/auth/session";
import { loadStaffSubmission } from "@/lib/supplier-portal/submission-access";
import { probeSourceLink } from "@/lib/verification-submission-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Nhân viên bấm "thử đọc" một link nguồn công khai do NCC khai.
 * Chỉ domain trong allowlist mới được máy chủ truy cập; link lạ trả về
 * `manual` để nhân viên tự mở bằng trình duyệt của mình.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await guard("verifications.inspect");
  if (gate) return NextResponse.json({ ok: false, message: gate.message }, { status: 403 });
  const { id } = await params;
  const access = await loadStaffSubmission(id);
  if (!access) return NextResponse.json({ ok: false, message: "Không tìm thấy hồ sơ." }, { status: 404 });
  let body: { linkId?: unknown };
  try { body = await request.json() as { linkId?: unknown }; } catch { body = {}; }
  const link = access.links.find((l) => l.id === String(body.linkId ?? ""));
  if (!link) return NextResponse.json({ ok: false, message: "Link không thuộc hồ sơ này." }, { status: 404 });

  if (!link.allowed_source) {
    await access.store.updateSubmissionLink(link.id, { fetch_status: "manual", fetch_note: "Ngoài danh sách nguồn công khai; nhân viên tự mở link để đối chiếu.", fetched_at: new Date().toISOString() });
    revalidatePath(`/crm/verifications/submissions/${id}`);
    return NextResponse.json({ ok: true, message: "Link ngoài danh sách nguồn công khai: hệ thống không tự truy cập. Hãy tự mở và đối chiếu." }, { headers: { "Cache-Control": "no-store" } });
  }

  const result = await probeSourceLink({ url: link.url, supplierName: access.supplier.name });
  await access.store.updateSubmissionLink(link.id, {
    fetch_status: result.status,
    fetch_note: result.note.slice(0, 900),
    fetched_at: new Date().toISOString(),
  });
  await access.store.addAuditLog({
    actor_id: access.session.uid, actor_email: access.session.email,
    entity: "supplier", entity_id: access.submission.supplier_id,
    action: "staff.submission.link_probed",
    before: null, after: { submission_id: id, link_id: link.id, status: result.status },
  });
  revalidatePath(`/crm/verifications/submissions/${id}`);
  return NextResponse.json({ ok: true, message: result.note }, { headers: { "Cache-Control": "no-store" } });
}
