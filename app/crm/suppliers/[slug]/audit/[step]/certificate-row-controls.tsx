"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";

import {
  approveCertificateAction,
  rescanCertificateAction,
  toggleCertificateHiddenAction,
} from "./certificate-actions";

export function CertificateRowControls({
  supplierId,
  certificateId,
  hasFile,
  staffHidden,
  published,
  canInspect,
  canPublish,
}: {
  supplierId: string;
  certificateId: string;
  hasFile: boolean;
  staffHidden: boolean;
  /** AI đã duyệt và đang hiện trên trang người mua. */
  published: boolean;
  canInspect: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"scan" | "hide" | "approve" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onRescan() {
    setBusy("scan");
    setMsg(null);
    const res = await rescanCertificateAction(supplierId, certificateId);
    setBusy(null);
    setMsg({ ok: res.ok, text: res.message });
    if (res.ok) router.refresh();
  }

  async function onApprove() {
    setBusy("approve");
    setMsg(null);
    const res = await approveCertificateAction(supplierId, certificateId);
    setBusy(null);
    setMsg({ ok: res.ok, text: res.message });
    if (res.ok) router.refresh();
  }

  async function onToggleHide() {
    setBusy("hide");
    setMsg(null);
    const res = await toggleCertificateHiddenAction(supplierId, certificateId, !staffHidden);
    setBusy(null);
    setMsg({ ok: res.ok, text: res.message });
    if (res.ok) router.refresh();
  }

  if (!canInspect && !canPublish) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canInspect && hasFile && (
        <button
          type="button"
          onClick={onRescan}
          disabled={busy !== null}
          className="btn btn-ghost btn-sm text-xs"
          title="Chạy AI quét lại đơn vị đứng tên và ngày hết hạn từ tệp gốc"
        >
          {busy === "scan" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Quét lại AI
        </button>
      )}
      {canPublish && !published && (
        <button
          type="button"
          onClick={onApprove}
          disabled={busy !== null}
          className="btn btn-ghost btn-sm text-xs"
          title="Đối chiếu tệp gốc rồi cho chứng nhận hiện trên trang người mua"
        >
          {busy === "approve" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <BadgeCheck className="h-3.5 w-3.5" />
          )}
          Duyệt đăng
        </button>
      )}
      {canPublish && (
        <button
          type="button"
          onClick={onToggleHide}
          disabled={busy !== null}
          className="btn btn-ghost btn-sm text-xs"
          title={
            staffHidden
              ? "Bỏ ẩn để chứng nhận hiển thị lại trên trang công khai"
              : "Phanh an toàn: ẩn nhãn chứng nhận khỏi trang người mua"
          }
        >
          {busy === "hide" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : staffHidden ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
          {staffHidden ? "Hiện lại" : "Ẩn công khai"}
        </button>
      )}
      {msg && (
        <span className={`text-[11px] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
