"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BadgeCheck, Loader2, Plus, Sparkles, X } from "lucide-react";

import { CERTIFICATE_SCHEMES, certificateSchemeKind } from "@/lib/certificate-scheme";
import type { CertificateAiConfidence, CertificateCategorySuggestion } from "@/lib/types";
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
  categoryId?: string | null;
}

const KIND_LABEL: Record<string, string> = {
  legal: "Pháp lý · L1",
  quality: "Chất lượng · gắn phạm vi",
  shipment: "Theo lô · đơn hàng",
  other: "Chưa xếp được",
};

const CONFIDENCE_LABEL: Record<CertificateAiConfidence, string> = {
  high: "Phù hợp cao",
  medium: "Cần đối chiếu",
  low: "Độ tin cậy thấp",
};

export function CertificateRowControls({
  supplierId,
  certificateId,
  hasFile,
  staffHidden,
  published,
  approved = published,
  expiredOn = null,
  scheme,
  scopes = [],
  categories = [],
  categorySuggestions = [],
  requests = [],
  mismatch = null,
  canInspect,
  canPublish,
  partnerHolder = null,
  partnerContracts = [],
  scopeText = null,
}: {
  /** Dòng phạm vi in trên giấy (AI đọc), để nhân viên so với các danh mục đã tích. */
  scopeText?: string | null;
  /** Tên nhà máy đứng tên trên giấy khi giấy không đứng tên nhà cung cấp; null = giấy chính chủ. */
  partnerHolder?: string | null;
  /** Hợp đồng / ủy quyền với nhà máy mà nhà cung cấp đã tải. */
  partnerContracts?: Array<{ id: string; label: string; href: string }>;
  supplierId: string;
  certificateId: string;
  hasFile: boolean;
  staffHidden: boolean;
  /** AI đã duyệt và đang hiện trên trang người mua. */
  published: boolean;
  /** Đã duyệt (công khai hoặc nội bộ). Sau khi duyệt mới hiện công tắc hiển thị và dòng sửa phạm vi. */
  approved?: boolean;
  /** Ngày hết hạn dd/mm/yyyy khi giấy đã hết hạn; null khi còn hạn hoặc chưa ghi hạn. */
  expiredOn?: string | null;
  /** Loại chứng nhận dùng cho bộ lọc người mua; null = chưa phân loại. */
  scheme: string | null;
  /** Phạm vi đã xác nhận của giấy này. */
  scopes?: CertificateScopeChip[];
  /** Danh mục có thể chọn làm phạm vi. */
  categories?: Array<{ id: string; name: string }>;
  /** Gợi ý từ AI; không tạo phạm vi cho tới khi nhân viên chủ động chọn. */
  categorySuggestions?: Array<CertificateCategorySuggestion & { label: string }>;
  /** Nhà cung cấp xin mở rộng phạm vi cho sản phẩm. */
  requests?: Array<{ productId: string; name: string; categoryId?: string | null }>;
  /** Loại giấy lệch mục checklist L1 đã ghi. */
  mismatch?: string | null;
  canInspect: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"scan" | "hide" | "approve" | "scheme" | "scope" | "visibility" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [scopeDraft, setScopeDraft] = useState("");
  const [contractConfirmed, setContractConfirmed] = useState(false);
  // Danh mục tích sẵn khi duyệt: gợi ý AI tin cậy cao + danh mục của sản phẩm nhà cung cấp tải giấy từ đó.
  const applied = new Set(scopes.map((scope) => scope.categoryId).filter(Boolean));
  const known = new Set(categories.map((category) => category.id));
  const [picked, setPicked] = useState<string[]>(() => [...new Set([
    ...categorySuggestions.filter((s) => s.confidence === "high").map((s) => s.category_id),
    ...requests.map((r) => r.categoryId ?? ""),
  ])].filter((id) => id && known.has(id) && !applied.has(id)));
  const [extraCategory, setExtraCategory] = useState("");

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
      {/* Thứ tự theo cách làm việc: xem thông tin giấy (loại, AI đọc) → hết hạn? → duyệt + danh mục → hiển thị. */}
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
      </div>

      {mismatch && <p className="text-[11px] leading-4 text-amber-800">{mismatch}</p>}
      {expiredOn && <div role="status" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11.5px] leading-4 text-rose-900">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p><span className="font-semibold">Giấy hết hạn ngày {expiredOn}.</span> Cần nhà cung cấp tải bản đã gia hạn; giấy hết hạn không hiện cho người mua, kể cả khi đã duyệt.</p>
      </div>}
      {/* Giấy đứng tên nhà máy khác: xem hợp đồng nhà cung cấp tải kèm, đánh dấu rồi mới duyệt đăng. */}
      {canPublish && !approved && !expiredOn && partnerHolder !== null && <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[11.5px] leading-4 text-ink-800">
        <p className="font-semibold">Giấy đứng tên {partnerHolder || "đơn vị khác"}. Xem hợp đồng hoặc giấy ủy quyền giữa nhà cung cấp và nhà máy này trước khi duyệt.</p>
        {partnerContracts.length
          ? <ul className="mt-1.5 space-y-1">{partnerContracts.map((contract) => <li key={contract.id}>
            <a href={contract.href} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">{contract.label}</a>
          </li>)}</ul>
          : <p className="mt-1.5 text-amber-900">Nhà cung cấp chưa tải hợp đồng. Nhờ họ tải kèm ở trang Giấy tờ rồi duyệt.</p>}
        {partnerContracts.length > 0 && <label className="mt-2 flex items-start gap-1.5">
          <input type="checkbox" className="mt-0.5" checked={contractConfirmed} onChange={(e) => setContractConfirmed(e.target.checked)} />
          <span>Đã xem: hợp đồng ghi đúng tên {partnerHolder || "nhà máy trên giấy"} và nhà cung cấp này.</span>
        </label>}
      </div>}
      {/* Một bước duyệt (11/2026): tích danh mục áp dụng rồi bấm một nút. Sản phẩm thuộc
          danh mục đã tích tự có chứng nhận, kể cả sản phẩm đăng sau. Giấy hết hạn thì không mời duyệt. */}
      {canPublish && !approved && !expiredOn && <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-2.5">
        {scopeable ? <>
          <p className="text-[11.5px] font-bold text-ink-900">Áp dụng cho danh mục</p>
          {scopeText && <p className="mt-0.5 text-[11px] leading-4 text-ink-600">Phạm vi in trên giấy: <span className="italic">{scopeText}</span></p>}
          <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
            {[...new Set([...categorySuggestions.map((s) => s.category_id), ...requests.map((r) => r.categoryId ?? ""), ...picked])]
              .filter((id) => id && known.has(id) && !applied.has(id))
              .map((id) => {
                const suggestion = categorySuggestions.find((s) => s.category_id === id);
                const fromProduct = requests.some((r) => r.categoryId === id);
                const name = categories.find((category) => category.id === id)?.name ?? "Danh mục";
                return <li key={id}>
                  <label className="flex items-start gap-1.5 rounded-md bg-white px-2 py-1.5 text-[11.5px] ring-1 ring-ink-200">
                    <input type="checkbox" className="mt-0.5" checked={picked.includes(id)} disabled={busy !== null}
                      onChange={(e) => setPicked((list) => e.target.checked ? [...list, id] : list.filter((item) => item !== id))} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink-900">{name}</span>
                      <span className="block text-[10px] text-ink-500">
                        {[suggestion ? `AI gợi ý · ${CONFIDENCE_LABEL[suggestion.confidence].toLowerCase()}` : "", fromProduct ? "danh mục của sản phẩm nhà cung cấp tải giấy" : ""].filter(Boolean).join(" · ") || "Nhân viên thêm"}
                      </span>
                    </span>
                  </label>
                </li>;
              })}
          </ul>
          {categories.length > 0 && <div className="mt-1.5 flex items-center gap-1.5">
            <select value={extraCategory} onChange={(e) => setExtraCategory(e.target.value)} className="input h-7 py-0 text-[11px]" aria-label="Thêm danh mục khác">
              <option value="">Thêm danh mục khác…</option>
              {categories.filter((category) => !applied.has(category.id) && !picked.includes(category.id)).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm text-[11px]" disabled={!extraCategory || busy !== null}
              onClick={() => { setPicked((list) => [...list, extraCategory]); setExtraCategory(""); }}>
              <Plus className="h-3.5 w-3.5" />Thêm
            </button>
          </div>}
        </> : <p className="text-[11px] leading-4 text-ink-600">{scheme ? "Loại giấy này không gắn danh mục sản phẩm; chỉ hiện ở trang nhà cung cấp." : "Chọn loại giấy ở ô Loại. Giấy chất lượng (HACCP, ISO…) mới gắn được danh mục."}</p>}
        <button type="button" disabled={busy !== null}
          onClick={() => void run("approve", () => approveCertificateAction(supplierId, certificateId, { partnerContractConfirmed: contractConfirmed, categoryIds: scopeable ? picked : [] }))}
          className="btn btn-primary btn-sm mt-2 text-xs" title="Đối chiếu tệp gốc rồi cho chứng nhận hiện cho người mua">
          {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
          {scopeable && picked.length ? `Duyệt và áp dụng cho ${picked.length} danh mục` : "Duyệt đăng"}
        </button>
      </div>}

      {/* Một công tắc thay cho "Nội bộ/Công khai" và "Ẩn công khai": người mua thấy giấy khi
          đã duyệt + công khai + không bị ẩn + còn hạn. Dữ liệu publicly_visible/staff_hidden giữ nguyên. */}
      {canPublish && approved && <label className="flex items-center gap-2 text-[11.5px] text-ink-800">
        <input type="checkbox" role="switch" className="h-4 w-4" checked={published && !staffHidden} disabled={busy !== null}
          onChange={(e) => {
            const show = e.target.checked;
            void run("visibility", async () => {
              if (!show) return setCertificateVisibilityAction(supplierId, certificateId, false);
              if (staffHidden) {
                const unhidden = await toggleCertificateHiddenAction(supplierId, certificateId, false);
                if (!unhidden.ok || published) return unhidden;
              }
              return setCertificateVisibilityAction(supplierId, certificateId, true);
            });
          }} />
        <span className="font-semibold">Hiện cho người mua</span>
        {busy === "visibility" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        {expiredOn && published && !staffHidden && <span className="text-rose-800">· đang ẩn vì hết hạn</span>}
      </label>}
      {/* Sửa phạm vi sau khi duyệt; trước khi duyệt chỉ chọn trong khung "Áp dụng cho danh mục". */}
      {scopeable && (approved || !canPublish) && (scopes.length > 0 || (canInspect && categories.length > 0)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-ink-500">Phạm vi đã áp dụng:</span>
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

      {scopeable && categorySuggestions.length > 0 && (approved || !canPublish) && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <p className="text-[11px] font-bold text-violet-950">AI gợi ý danh mục</p>
            <p className="text-[10px] text-violet-800">Chưa áp dụng · nhân viên đối chiếu nội dung giấy trước khi chọn</p>
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {categorySuggestions.map((suggestion) => {
              const categoryExists = categories.some((category) => category.id === suggestion.category_id);
              const alreadyApplied = scopes.some((scope) => scope.categoryId === suggestion.category_id);
              return (
                <li key={suggestion.category_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/80 px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-ink-900">{suggestion.label}</p>
                    <p className="text-[10px] leading-4 text-ink-600">{suggestion.reason}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[10px] text-violet-800">{CONFIDENCE_LABEL[suggestion.confidence]}</span>
                    {alreadyApplied ? (
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-900">Đã chọn</span>
                    ) : canInspect ? (
                      <button
                        type="button"
                        disabled={busy !== null || !categoryExists}
                        onClick={() => void run("scope", () => addCertificateScopeAction(supplierId, certificateId, { categoryId: suggestion.category_id }))}
                        className="btn btn-ghost btn-sm text-[10px]"
                        title="Chọn gợi ý này làm phạm vi áp dụng cho chứng nhận"
                      >
                        {busy === "scope" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Chọn phạm vi
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
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
