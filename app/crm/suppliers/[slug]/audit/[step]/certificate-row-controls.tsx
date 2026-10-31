"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Eye, EyeOff, Loader2, Plus, Sparkles, X } from "lucide-react";

import { CERTIFICATE_SCHEMES, certificateSchemeKind } from "@/lib/certificate-scheme";
import {
  addCertificateScopeAction,
  answerCertificateScopeRequestAction,
  removeCertificateScopeAction,
  setCertificateVisibilityAction,
} from "./certificate-scope-actions";
import {
  approveCertificateAction,
  rescanCertificateAction,
  setCertificateSchemeAction,
  toggleCertificateHiddenAction,
} from "./certificate-actions";

export interface CertificateScopeChip {
  id: string;
  label: string;
}

const KIND_LABEL: Record<string, string> = {
  legal: "Pháp lý · L1",
  quality: "Chất lượng · gắn phạm vi",
  shipment: "Theo lô · đơn hàng",
  other: "Chưa xếp được",
};

export function CertificateRowControls({
  supplierId,
  certificateId,
  hasFile,
  staffHidden,
  published,
  scheme,
  scopes = [],
  categories = [],
  requests = [],
  mismatch = null,
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
  /** Phạm vi đã xác nhận của giấy này. */
  scopes?: CertificateScopeChip[];
  /** Danh mục có thể chọn làm phạm vi. */
  categories?: Array<{ id: string; name: string }>;
  /** Nhà cung cấp xin mở rộng phạm vi cho sản phẩm. */
  requests?: Array<{ productId: string; name: string }>;
  /** Loại giấy lệch mục checklist L1 đã ghi. */
  mismatch?: string | null;
  canInspect: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"scan" | "hide" | "approve" | "scheme" | "scope" | "visibility" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [scopeDraft, setScopeDraft] = useState("");

  async function run(
    kind: "scan" | "hide" | "approve" | "scheme" | "scope" | "visibility",
    work: () => Promise<{ ok: boolean; message: string }>,
  ) {
    setBusy(kind);
    setMsg(null);
    const res = await work();
    setBusy(null);
    setMsg({ ok: res.ok, text: res.message });
    if (res.ok) router.refresh();
  }

  if (!canInspect && !canPublish) return null;
  const kind = scheme ? certificateSchemeKind(scheme) : "other";
  const scopeable = kind === "quality";

  return (
    <div className="w-full space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {canInspect && (
          <label className="flex items-center gap-1 text-[11px] font-semibold text-ink-600">
            Loại
            <select
              value={scheme ?? ""}
              disabled={busy !== null}
              onChange={(e) => void run("scheme", () => setCertificateSchemeAction(supplierId, certificateId, e.target.value))}
              className="input h-7 py-0 text-[11px]"
              title="Loại giấy quyết định đường ra: pháp lý (L1), chất lượng (badge + chip) hay theo lô"
            >
              <option value="">Chưa phân loại</option>
              {(["legal", "quality", "shipment", "other"] as const).map((group) => {
                const items = CERTIFICATE_SCHEMES.filter((item) => item.kind === group);
                if (items.length === 0) return null;
                return (
                  <optgroup key={group} label={KIND_LABEL[group]}>
                    {items.map((item) => <option key={item.code} value={item.code}>{item.vi}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </label>
        )}
        {canPublish && (
          <button
            type="button"
            onClick={() => void run("visibility", () => setCertificateVisibilityAction(supplierId, certificateId, !published))}
            disabled={busy !== null || (!published && !canPublish)}
            className="btn btn-ghost btn-sm text-xs"
            title={published ? "Chuyển sang nội bộ: người mua không còn thấy giấy này" : "Công khai cho người mua khi giấy đã duyệt"}
          >
            {busy === "visibility" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {published ? "Công khai" : "Nội bộ"}
          </button>
        )}
        {canInspect && hasFile && (
          <button
            type="button"
            onClick={() => void run("scan", () => rescanCertificateAction(supplierId, certificateId))}
            disabled={busy !== null}
            className="btn btn-ghost btn-sm text-xs"
            title="Chạy AI quét lại đơn vị đứng tên và ngày hết hạn từ tệp gốc"
          >
            {busy === "scan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Quét lại AI
          </button>
        )}
        {canPublish && !published && (
          <button
            type="button"
            onClick={() => void run("approve", () => approveCertificateAction(supplierId, certificateId))}
            disabled={busy !== null}
            className="btn btn-ghost btn-sm text-xs"
            title="Đối chiếu tệp gốc rồi cho chứng nhận hiện trên trang người mua"
          >
            {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
            Duyệt đăng
          </button>
        )}
        {canPublish && (
          <button
            type="button"
            onClick={() => void run("hide", () => toggleCertificateHiddenAction(supplierId, certificateId, !staffHidden))}
            disabled={busy !== null}
            className="btn btn-ghost btn-sm text-xs"
            title={staffHidden ? "Bỏ ẩn để chứng nhận hiển thị lại" : "Phanh an toàn: ẩn nhãn chứng nhận khỏi trang người mua"}
          >
            {staffHidden ? "Hiện lại" : "Ẩn công khai"}
          </button>
        )}
      </div>

      {mismatch && <p className="text-[11px] leading-4 text-amber-800">{mismatch}</p>}

      {scopeable && (scopes.length > 0 || (canInspect && categories.length > 0)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-ink-500">Phạm vi:</span>
          {scopes.map((scope) => (
            <span key={scope.id} className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-900 ring-1 ring-teal-200">
              {scope.label}
              {canInspect && (
                <button
                  type="button"
                  aria-label={`Bỏ phạm vi ${scope.label}`}
                  disabled={busy !== null}
                  onClick={() => void run("scope", () => removeCertificateScopeAction(supplierId, certificateId, scope.id))}
                  className="text-teal-700 hover:text-rose-700"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {canInspect && categories.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <select
                value={scopeDraft}
                onChange={(e) => setScopeDraft(e.target.value)}
                className="input h-7 py-0 text-[11px]"
                aria-label="Thêm phạm vi danh mục"
              >
                <option value="">Thêm danh mục…</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <button
                type="button"
                disabled={busy !== null || !scopeDraft}
                onClick={() => {
                  const categoryId = scopeDraft;
                  setScopeDraft("");
                  void run("scope", () => addCertificateScopeAction(supplierId, certificateId, { categoryId }));
                }}
                className="btn btn-ghost btn-sm text-[11px]"
              >
                {busy === "scope" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Thêm
              </button>
            </span>
          )}
        </div>
      )}

      {requests.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1">
          <span className="text-[11px] font-bold text-amber-900">Xin mở rộng phạm vi:</span>
          {requests.map((request) => (
            <span key={request.productId} className="inline-flex items-center gap-1 text-[11px] text-amber-900">
              {request.name}
              {canInspect && (
                <>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run("scope", () => answerCertificateScopeRequestAction(supplierId, certificateId, request.productId, true))}
                    className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                  >
                    Duyệt
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run("scope", () => answerCertificateScopeRequestAction(supplierId, certificateId, request.productId, false))}
                    className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200"
                  >
                    Từ chối
                  </button>
                </>
              )}
            </span>
          ))}
        </div>
      )}

      {msg && <p className={`text-[11px] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
    </div>
  );
}
