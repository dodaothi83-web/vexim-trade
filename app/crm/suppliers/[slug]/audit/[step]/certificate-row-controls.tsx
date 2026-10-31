"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";

import { CERTIFICATE_SCHEMES } from "@/lib/certificate-scheme";
import {
  approveCertificateAction,
  rescanCertificateAction,
  setCertificateSchemeAction,
  toggleCertificateHiddenAction,
} from "./certificate-actions";

export function CertificateRowControls({
  supplierId,
  certificateId,
  hasFile,
  staffHidden,
  published,
  scheme,
  canInspect,
  canPublish,
}: {
  supplierId: string;
  certificateId: string;
  hasFile: boolean;
  staffHidden: boolean;
  /** AI đã duyệt và đang hiện trên trang người mua. */
  published: boolean;
  /** Loại chứng nhận dùng cho bộ lọc người mua; null = chưa phân loại. */
  scheme: string | null;
  canInspect: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"scan" | "hide" | "approve" | "scheme" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onRescan() {
    setBusy("scan");
    setMsg(null);
    const res = await rescanCertificateAction(supplierId, certificateId);
    setBusy(null);
    setMsg({ ok: res.ok, text: res.message });
    if (res.ok) router.refresh();
  }

  async function onScheme(value: string) {
    setBusy("scheme");
    setMsg(null);
    const res = await setCertificateSchemeAction(supplierId, certificateId, value);
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
      {canInspect && (
        <label className="flex items-center gap-1 text-[11px] font-semibold text-ink-600">
          Loại
          <select
            value={scheme ?? ""}
            disabled={busy !== null}
            onChange={(e) => void onScheme(e.target.value)}
            className="input h-7 py-0 text-[11px]"
            title="Loại chứng nhận dùng cho bộ lọc người mua; để trống nghĩa là chưa phân loại"
          >
            <option value="">Chưa phân loại</option>
            {CERTIFICATE_SCHEMES.map((item) => <option key={item.code} value={item.code}>{item.vi}</option>)}
          </select>
        </label>
      )}
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
