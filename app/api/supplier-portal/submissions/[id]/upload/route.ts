import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { supplierSubmissionAccess } from "@/lib/supplier-portal/submission-access";
import { mergeFlags } from "@/lib/media/image-integrity";
import { readiness } from "@/lib/verification-submission";
import { saveSubmissionEvidence, submissionSizeGate } from "@/lib/supplier-portal/submission-evidence";
import { maxBytesFor } from "@/lib/supplier-portal/submission-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Ảnh gốc từ điện thoại có thể lớn; cho phép body tới 32 MB.
export const maxDuration = 60;

interface UploadResponse {
  ok: boolean;
  message: string;
  itemId?: string;
  flags?: { flag: string; severity: string; detail: string | null }[];
  readiness?: ReturnType<typeof readiness>;
}

function json(body: UploadResponse, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Đọc toạ độ trình duyệt gửi kèm; không tin tuyệt đối, chỉ dùng để đối chiếu EXIF. */
function readCapture(form: FormData) {
  const num = (key: string) => {
    const raw = String(form.get(key) ?? "").trim();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const lat = num("lat");
  const lng = num("lng");
  const accuracy = num("accuracy");
  const capturedRaw = String(form.get("capturedAt") ?? "").trim();
  const captured = capturedRaw && !Number.isNaN(Date.parse(capturedRaw)) ? new Date(capturedRaw).toISOString() : null;
  return {
    lat: lat != null && lat >= -90 && lat <= 90 ? lat : null,
    lng: lng != null && lng >= -180 && lng <= 180 ? lng : null,
    accuracy_m: accuracy != null && accuracy >= 0 && accuracy <= 100000 ? accuracy : null,
    captured_at: captured,
  };
}

/**
 * NCC tự tải bằng chứng cho hồ sơ L2/L3 của CHÍNH doanh nghiệp mình.
 * Tệp được giữ nguyên bytes. Từ 21/10/2026 không bắt buộc ảnh gốc: ảnh điện thoại,
 * kể cả ảnh đã qua Zalo/Facebook, đều nhận; EXIF/GPS chỉ ghi chú cho người duyệt.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await supplierSubmissionAccess(id);
  if (!access) return json({ ok: false, message: "Không mở được hồ sơ của doanh nghiệp bạn." }, 403);
  const { submission } = access;

  const gate = submissionSizeGate(submission.target_level, Number(request.headers.get("content-length") ?? 0) || null);
  if (!gate.ok) return json({ ok: false, message: gate.message ?? "Tệp quá lớn." }, 413);

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ ok: false, message: "Không đọc được dữ liệu tải lên." }, 400); }

  const key = String(form.get("checklistKey") ?? "").trim();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, message: "Thiếu tệp ảnh." }, 400);
  if (file.size > maxBytesFor(submission.target_level)) {
    return json({ ok: false, message: `Tệp vượt giới hạn ${Math.round(maxBytesFor(submission.target_level) / 1024 / 1024)} MB.` }, 413);
  }

  try {
    const capture = readCapture(form);
    const saved = await saveSubmissionEvidence({
      store: access.store, submission, key, file, capture, createdBy: access.userId,
    });
    // Ghi GPS của trình duyệt lên hồ sơ nếu đây là lần tải đầu tiên có toạ độ.
    if (capture.lat != null && capture.lng != null && submission.device_lat == null) {
      await access.store.updateSubmission(submission.id, {
        device_lat: capture.lat,
        device_lng: capture.lng,
        device_accuracy_m: capture.accuracy_m,
        device_captured_at: capture.captured_at,
      });
    }
    const items = await access.store.listSubmissionItems(submission.id);
    const fresh = (await access.store.getSubmission(submission.id)) ?? submission;
    await access.store.updateSubmission(submission.id, { flags: mergeFlags(items.map((i) => i.flags ?? [])) });
    await access.store.addAuditLog({
      actor_id: access.userId, actor_email: access.userEmail,
      entity: "supplier", entity_id: submission.supplier_id,
      action: `supplier.submission.upload.l${submission.target_level}`,
      before: null,
      after: {
        submission_id: submission.id, item_id: saved.item.id, checklist_key: key,
        has_exif: saved.item.has_exif, gps: saved.item.exif_lat != null,
        flags: saved.flags.map((f) => f.flag), replaced: saved.replaced,
      },
    });
    revalidatePath("/supplier/portal/verification");
    revalidatePath(`/crm/verifications/submissions/${submission.id}`);
    return json({
      ok: true,
      message: saved.replaced
        ? `Đã thay ảnh cũ của mục này (giữ tối đa vài bản). ${saved.flags.length ? "Có điểm cần lưu ý bên dưới." : ""}`
        : saved.flags.length
          ? "Đã tải ảnh. Có vài điểm ghi chú bên dưới, không ảnh hưởng việc nộp."
          : "Đã tải ảnh.",
      itemId: saved.item.id,
      flags: saved.flags.map((f) => ({ flag: f.flag, severity: f.severity, detail: f.detail })),
      readiness: readiness({ submission: fresh, items }),
    });
  } catch (error) {
    console.error("[submission-upload] lỗi", error);
    const message = error instanceof Error ? error.message : "Không lưu được tệp.";
    return json({ ok: false, message }, 400);
  }
}
