"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw, Undo2 } from "lucide-react";

/**
 * Hành động của nhân viên với hồ sơ NCC tự gửi.
 *
 * "Nhận vào đợt kiểm" KHÔNG duyệt huy hiệu: nó tạo đợt kiểm `verifications`
 * (người nhận là inspector) và sao bằng chứng sang đó. Nhân sự đủ quyền có thể
 * tự hoàn tất sau xác nhận; reviewer độc lập là lựa chọn thêm.
 */
export function SubmissionReviewActions({ submissionId, level, partner = false, status, canReview, verificationHref }: {
  submissionId: string;
  level: 2 | 3;
  partner?: boolean;
  status: string;
  canReview: boolean;
  verificationHref: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "accept" | "return">("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [newVerificationHref, setNewVerificationHref] = useState<string | null>(null);
  const decidable = canReview && (status === "pending_review" || status === "returned");

  async function decide(decision: "accept" | "return") {
    if (busy) return;
    if (decision === "return" && note.trim().length < 8) {
      setMessage({ ok: false, text: "Hãy ghi rõ lý do trả hồ sơ để nhà cung cấp bổ sung đúng thứ (tối thiểu 8 ký tự)." });
      return;
    }
    if (decision === "accept" && !window.confirm(
      `Nhận hồ sơ L${level} này vào đợt kiểm của bạn? Hệ thống sẽ tạo đợt kiểm mới và sao toàn bộ bằng chứng sang. Nhân sự có quyền vẫn phải đối chiếu và quyết định duyệt riêng.`,
    )) return;
    setBusy(decision); setMessage(null);
    try {
      const response = await fetch(`/api/submission-review/${encodeURIComponent(submissionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const data = await response.json() as { ok?: boolean; message?: string; href?: string };
      setMessage({ ok: Boolean(response.ok && data.ok), text: data.message ?? "Không xử lý được." });
      if (response.ok && data.ok) {
        setNote("");
        if (decision === "accept" && data.href?.startsWith("/crm/suppliers/") && data.href.includes("/audit/")) setNewVerificationHref(data.href);
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: "Không kết nối được máy chủ." });
    } finally { setBusy(""); }
  }

  return <div className="rounded-xl border border-ink-200 bg-white p-4">
    <h2 className="text-sm font-bold text-ink-900">Quyết định của nhân viên Vexim</h2>
    {!canReview && <p className="mt-2 text-xs text-ink-600">Tài khoản của bạn chỉ xem và đối chiếu; cần quyền kiểm tra xác minh để nhận/trả hồ sơ.</p>}
    {decidable && <>
      <p className="mt-2 text-xs text-ink-600">
        Nhận hồ sơ sẽ tạo một <strong>đợt kiểm của nhân viên</strong> kèm toàn bộ bằng chứng. Duyệt hay không là bước sau,
        do người có quyền duyệt quyết định — hồ sơ nhà cung cấp tự gửi không bao giờ tự thành huy hiệu.
      </p>
      <label className="mt-3 block text-xs font-semibold text-ink-700">Ghi chú / lý do (bắt buộc khi trả hồ sơ)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1200} className="input mt-1"
          placeholder={status === "returned"
            ? partner ? "Ví dụ: hợp đồng chưa thể hiện rõ doanh nghiệp và nhà máy đối tác." : level === 3 ? "Ví dụ: chứng từ chưa thể hiện vai trò của doanh nghiệp trong lô hàng." : "Ví dụ: ảnh cổng nhà máy không thấy biển tên; cần chụp lại đúng mã VX-..."
            : "Ghi chú chuyển cho người kiểm tiếp theo (không hiển thị cho nhà cung cấp)"} />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy !== ""} onClick={() => void decide("accept")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:bg-ink-200">
          {busy === "accept" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Nhận vào đợt kiểm
        </button>
        <button type="button" disabled={busy !== ""} onClick={() => void decide("return")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 disabled:opacity-50">
          {busy === "return" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Trả hồ sơ để bổ sung
        </button>
      </div>
    </>}
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
      <p className="w-full text-[11px] text-ink-600">Không cần AI. Nhân viên tự kiểm tra và có thể tải thêm bằng chứng trong đợt kiểm.</p>
      {(newVerificationHref || verificationHref) && <Link href={(newVerificationHref || verificationHref)!} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:border-brand-400">
        <RotateCcw className="h-3.5 w-3.5" /> Mở đợt kiểm đã tạo
      </Link>}
    </div>
    {message && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${message.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>{message.text}</p>}
  </div>;
}
