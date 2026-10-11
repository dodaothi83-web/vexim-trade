"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Mail,
  Package,
  Paperclip,
  Send,
  PenLine,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { saveDraftAction, sendMailAction } from "@/app/actions";
import { saveMySignatureAction } from "@/app/auth-actions";
import type { AttachmentRef, Buyer, ProspectOutreachTemplate, Supplier } from "@/lib/types";
import {
  findContextByEmail,
  type ComposeContext,
  type RecentMail,
} from "@/lib/compose-context";
import { RichEditor } from "@/components/rich-editor";
import { ComposeSidebar } from "@/components/compose-sidebar";
import { ProductFilePicker, type ProductFileGroup } from "@/components/product-file-picker";
import { Button, cx } from "@/components/ui";
import { useToast } from "@/components/toast";
import { PROSPECT_OUTREACH_TEMPLATES } from "@/lib/prospects/outreach-templates";

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  kind: "buyer" | "supplier" | "prospect";
}

export interface ComposeInitial {
  buyerId?: string | null;
  supplierId?: string | null;
  prospectId?: string | null;
  prospectCompany?: string | null;
  prospectCompanyIntroduction?: string | null;
  direction: "buyer" | "supplier";
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyHtml?: string;
  attachments?: AttachmentRef[];
  draftId?: string | null;
}

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 10;
/** Định dạng máy chủ chấp nhận (xem lib/mail/attachments.ts) */
const ACCEPT = [
  ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf",
  ".csv", ".txt", ".zip", ".rar", ".7z", ".dwg", ".dxf",
].join(",");

function escapeTemplateHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

export function ComposeMail({
  initial,
  contacts,
  buyer,
  signature,
  autoSignature = "",
  signatureCustom = false,
  contexts = [],
  recent = [],
  outreachTemplates = PROSPECT_OUTREACH_TEMPLATES,
  productFiles = [],
}: {
  initial: ComposeInitial;
  contacts: Contact[];
  buyer?: (Buyer & { supplier?: Pick<Supplier, "id" | "name"> | null }) | null;
  signature: string;
  /** Chữ ký tự động của hệ thống — làm gốc khi người dùng chưa lưu chữ ký riêng */
  autoSignature?: string;
  /** Chữ ký đang dùng là chữ ký tuỳ chỉnh người dùng đã lưu */
  signatureCustom?: boolean;
  /** Ngữ cảnh đơn hàng của buyer / NCC để hiển thị ở cột phải */
  contexts?: ComposeContext[];
  /** Email đã trao đổi (mới nhất trước) để hiển thị ở cột phải */
  recent?: RecentMail[];
  outreachTemplates?: readonly ProspectOutreachTemplate[];
  /** Ảnh/catalogue sản phẩm đã chia sẻ cho buyer, đính kèm nhanh */
  productFiles?: ProductFileGroup[];
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Mở từ hồ sơ buyer/NCC thì người nhận bị khoá; mở trống thì suy ra từ địa chỉ nhập
  const locked = Boolean(initial.buyerId || initial.supplierId || initial.prospectId);
  const [direction, setDirection] = useState<"buyer" | "supplier">(initial.direction);
  const [to, setTo] = useState<string[]>(initial.to ?? []);
  const [cc, setCc] = useState<string[]>(initial.cc ?? []);
  const [bcc, setBcc] = useState<string[]>(initial.bcc ?? []);
  const [showCc, setShowCc] = useState(Boolean(initial.cc?.length));
  const [showBcc, setShowBcc] = useState(Boolean(initial.bcc?.length));
  const [subject, setSubject] = useState(initial.subject ?? "");
  const [body, setBody] = useState(initial.bodyHtml ?? "");
  const [attachments, setAttachments] = useState<AttachmentRef[]>(initial.attachments ?? []);
  const [uploading, setUploading] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toInput, setToInput] = useState("");

  // Chữ ký cá nhân kiểu Gmail/Zoho: sửa & lưu từ hộp thoại, áp dụng cho thư soạn mới
  const [mySig, setMySig] = useState(signature);
  const [sigCustom, setSigCustom] = useState(Boolean(signatureCustom));
  const [sigOpen, setSigOpen] = useState(false);
  const [sigDraft, setSigDraft] = useState("");
  const [sigBusy, setSigBusy] = useState(false);

  const supplierEmails = new Set(
    contacts.filter((c) => c.kind === "supplier").map((c) => (c.email ?? "").toLowerCase()),
  );
  const effectiveDirection: "buyer" | "supplier" = locked
    ? direction
    : to[0] && supplierEmails.has(to[0].toLowerCase())
      ? "supplier"
      : "buyer";
  const isBuyerDir = effectiveDirection === "buyer";

  const buyerSuggestions = useMemo(
    () =>
      locked
        ? contacts.filter((c) =>
            effectiveDirection === "supplier" ? c.kind === "supplier" : c.kind !== "supplier",
          )
        : contacts,
    [contacts, locked, effectiveDirection],
  );

  const totalSize = attachments.reduce((s, a) => s + a.size, 0);
  const [prospectTemplate, setProspectTemplate] = useState("");

  function applyProspectTemplate(templateId: string) {
    setProspectTemplate(templateId);
    const template = outreachTemplates.find((item) => item.id === templateId);
    if (!template) return;
    const contactName = contacts.find((contact) => contact.email?.toLowerCase() === to[0]?.toLowerCase())?.name || "there";
    const plainBody = template.body.replaceAll("{contactName}", contactName);
    const html = plainBody
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeTemplateHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
      .join("");
    setSubject(template.subject.replaceAll("{company}", initial.prospectCompany || "your team"));
    setBody(`${html}${mySig ? `<p><br/></p>${mySig}` : ""}`);
  }

  // Ngữ cảnh người nhận đang soạn: mở từ hồ sơ thì theo id, soạn tự do thì suy ra
  // từ địa chỉ email đầu tiên khớp với danh sách buyer / NCC.
  const contextById = useMemo(() => new Map(contexts.map((c) => [c.id, c])), [contexts]);
  const activeContext = useMemo(() => {
    if (initial.buyerId) {
      return contextById.get(initial.buyerId) ?? findContextByEmail(contexts, to[0]);
    }
    if (initial.supplierId) return contextById.get(initial.supplierId) ?? null;
    return findContextByEmail(contexts, to[0]);
  }, [contextById, contexts, initial.buyerId, initial.supplierId, to]);
  const relatedBuyer = useMemo(
    () => (initial.buyerId ? (contextById.get(initial.buyerId) ?? null) : null),
    [contextById, initial.buyerId],
  );

  function addAddress(list: string[], value: string, setter: (v: string[]) => void) {
    const parts = value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setter(Array.from(new Set([...list, ...parts])));
  }

  function handleKey(
    e: React.KeyboardEvent<HTMLInputElement>,
    list: string[],
    setter: (v: string[]) => void,
    value: string,
    clear: () => void,
  ) {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      addAddress(list, value, setter);
      clear();
    } else if (e.key === "Backspace" && !value && list.length) {
      setter(list.slice(0, -1));
    }
  }

  /**
   * Tệp được tải lên kho riêng NGAY khi chọn (từng tệp một, không nhồi vào form gửi).
   * Nội dung tệp không bao giờ đi qua server action và không bao giờ vào cơ sở dữ liệu;
   * trình duyệt cũng không hề thấy khoá service_role (việc lưu do route phía máy chủ làm).
   */
  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    let total = attachments.reduce((s, a) => s + a.size, 0);
    let count = attachments.length;

    for (const file of Array.from(files)) {
      if (count >= MAX_FILES) {
        toast.push({ kind: "error", title: `Chỉ đính kèm được tối đa ${MAX_FILES} tệp mỗi email.` });
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.push({
          kind: "error",
          title: `Bỏ qua "${file.name}" — mỗi tệp tối đa ${MAX_FILE_BYTES / 1024 / 1024}MB.`,
        });
        continue;
      }
      if (total + file.size > MAX_BYTES) {
        toast.push({ kind: "error", title: `Bỏ qua "${file.name}" — vượt quá 10MB tổng dung lượng.` });
        continue;
      }

      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append("files", file);
        const res = await fetch("/api/mail/attachments", { method: "POST", body: form });
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; files?: AttachmentRef[]; message?: string }
          | null;
        const uploaded = data?.files?.[0];
        if (!res.ok || !uploaded) {
          toast.push({
            kind: "error",
            title: data?.message || `Không tải lên được "${file.name}".`,
          });
        } else {
          setAttachments((prev) => [...prev, uploaded]);
          total += uploaded.size;
          count += 1;
        }
      } catch {
        toast.push({ kind: "error", title: `Không tải lên được "${file.name}" — lỗi kết nối.` });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  /** Gỡ một tệp khỏi email: xoá luôn tệp trong kho để không còn rác */
  async function removeAttachment(ref: AttachmentRef) {
    setAttachments((prev) => prev.filter((a) => a.id !== ref.id));
    try {
      await fetch(`/api/mail/attachments/${ref.id}`, { method: "DELETE" });
    } catch {
      /* đã bỏ khỏi email; tệp mồ côi sẽ được dọn tự động */
    }
  }

  function payload() {
    return {
      buyerId: initial.buyerId ?? null,
      supplierId: initial.supplierId ?? null,
      prospectId: initial.prospectId ?? null,
      direction: effectiveDirection,
      to,
      cc,
      bcc,
      subject,
      bodyHtml: body,
      // chỉ metadata — nội dung tệp đã nằm trong kho riêng, không đi qua server action
      attachments: attachments.map((a) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        type: a.type,
      })),
    };
  }

  async function send() {
    if (uploading > 0) {
      toast.push({ kind: "error", title: "Đang tải tệp lên, vui lòng chờ một chút." });
      return;
    }
    setBusy(true);
    const res = await sendMailAction(payload());
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    setBusy(false);
    if (res.ok) router.push("/mail");
  }

  async function saveSignature() {
    setSigBusy(true);
    const res = await saveMySignatureAction(sigDraft);
    setSigBusy(false);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) {
      // Thay khối chữ ký cũ ngay trong thư đang soạn để thấy kết quả lập tức
      const prev = mySig;
      setBody((b) => {
        if (prev && b.includes(prev)) return b.split(prev).join(sigDraft);
        if (!prev && sigDraft) return (b ? b : "") + sigDraft;
        return b;
      });
      setMySig(sigDraft);
      setSigCustom(true);
      setSigOpen(false);
    }
  }

  async function clearSignature() {
    setSigBusy(true);
    const res = await saveMySignatureAction(null);
    setSigBusy(false);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) {
      const prev = mySig;
      setBody((b) => (prev && b.includes(prev) ? b.split(prev).join(autoSignature) : b));
      setMySig(autoSignature);
      setSigCustom(false);
      setSigOpen(false);
    }
  }

  async function saveAsDraft() {
    setBusy(true);
    const res = await saveDraftAction(payload());
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    setBusy(false);
    if (res.ok) router.push("/mail");
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="card overflow-hidden">
        {/* Thanh tiêu đề kiểu Gmail */}
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-ink-50 px-3 py-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-semibold text-ink-600 transition hover:bg-ink-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại
          </button>
          <span className="text-[13px] font-bold text-ink-900">Soạn thư mới</span>

        </div>

        {/* Người nhận */}
        <div className="divide-y divide-ink-100">
          <AddressRow
            label="Tới"
            values={to}
            inputValue={toInput}
            setInputValue={setToInput}
            onChange={setTo}
            onRemove={(v) => setTo(to.filter((x) => x !== v))}
            onKeyDown={(e) => handleKey(e, to, setTo, toInput, () => setToInput(""))}
            extra={
              <span className="flex shrink-0 gap-2 text-[12px]">
                <button
                  type="button"
                  onClick={() => setShowCc((v) => !v)}
                  className={cx("font-semibold transition", showCc ? "text-brand-700" : "text-ink-500 hover:text-ink-800")}
                >
                  Cc
                </button>
                <button
                  type="button"
                  onClick={() => setShowBcc((v) => !v)}
                  className={cx("font-semibold transition", showBcc ? "text-brand-700" : "text-ink-500 hover:text-ink-800")}
                >
                  Bcc
                </button>
              </span>
            }
            suggestions={buyerSuggestions}
            onPick={(email) => {
              setTo(Array.from(new Set([...to, email])));
              setToInput("");
            }}
          />
          {showCc && (
            <AddressRow
              label="Cc"
              values={cc}
              onChange={setCc}
              onRemove={(v) => setCc(cc.filter((x) => x !== v))}
            />
          )}
          {showBcc && (
            <AddressRow
              label="Bcc"
              values={bcc}
              onChange={setBcc}
              onRemove={(v) => setBcc(bcc.filter((x) => x !== v))}
            />
          )}
          <div className="flex items-center gap-3 px-3">
            <span className="w-12 shrink-0 text-[12.5px] font-semibold text-ink-500">Tiêu đề</span>
            <input
              className="w-full border-0 bg-transparent py-2.5 text-[14px] text-ink-900 outline-none"
              placeholder="Tiêu đề email"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
        </div>

        {initial.prospectId && (
          <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 bg-ink-50/60 px-3 py-2.5">
            <label className="text-[12px] font-semibold text-ink-600" htmlFor="prospect-outreach-template">Mẫu tiếp cận</label>
            <select
              id="prospect-outreach-template"
              className="input max-w-xs py-1.5 text-[12px]"
              value={prospectTemplate}
              onChange={(event) => applyProspectTemplate(event.target.value)}
            >
              <option value="">Tự soạn</option>
              {outreachTemplates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
            </select>
            <span className="text-[11px] text-ink-400">Chọn mẫu chỉ điền bản nháp, không tự gửi.</span>
          </div>
        )}

        {/* Nội dung */}
        <div className="border-t border-ink-200 p-3">
          <RichEditor
            value={body}
            onChange={setBody}
            placeholder="Viết nội dung email…"
            minHeight={320}
          />
        </div>

        {/* Đính kèm */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-ink-200 px-3 py-2.5">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-[12px]"
              >
                <FileText className="h-3.5 w-3.5 text-ink-500" />
                <span className="max-w-[180px] truncate font-medium text-ink-800">{a.name}</span>
                <span className="text-ink-400">{formatSize(a.size)}</span>
                <button
                  type="button"
                  onClick={() => void removeAttachment(a)}
                  className="text-ink-400 transition hover:text-red-600"
                  aria-label={`Gỡ ${a.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Thanh hành động */}
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-200 bg-ink-50 px-3 py-2.5">
          <Button variant="primary" disabled={busy || uploading > 0} onClick={() => void send()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Gửi
          </Button>
          <Button variant="ghost" disabled={busy || uploading > 0} onClick={() => void saveAsDraft()}>
            Lưu nháp
          </Button>
          <button
            type="button"
            className="btn btn-ghost px-2.5"
            onClick={() => fileRef.current?.click()}
            title="Đính kèm tệp"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2.5"
            disabled={busy || !mySig}
            onClick={() => setBody((b) => (b.includes(mySig) ? b : (b ? b : "") + mySig))}
            title="Chèn chữ ký"
          >
            <Sparkles className="h-4 w-4" />
            Chữ ký
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2.5"
            onClick={() => {
              setSigDraft(mySig || autoSignature);
              setSigOpen(true);
            }}
            title="Sửa chữ ký của tôi"
          >
            <PenLine className="h-4 w-4" />
            Sửa chữ ký
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2.5"
            disabled={busy || productFiles.length === 0}
            onClick={() => setPickerOpen(true)}
            title={productFiles.length ? "Đính kèm ảnh/catalogue từ hồ sơ sản phẩm" : "Chưa có sản phẩm nào chia sẻ tệp cho buyer"}
          >
            <Package className="h-4 w-4" />
            Từ sản phẩm
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="ml-auto flex items-center gap-3 text-[11.5px] text-ink-500">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {to.length + cc.length + bcc.length} người nhận
            </span>
            {(uploading > 0 || attachments.length > 0) && (
              <span className={cx(totalSize > MAX_BYTES && "font-semibold text-red-600")}>
                {uploading > 0 ? "Đang tải tệp lên… " : ""}
                {(totalSize / 1024 / 1024).toFixed(2)}MB / 10MB
              </span>
            )}
            <button
              type="button"
              className="flex items-center gap-1 font-semibold text-red-600 transition hover:underline"
              onClick={() => router.push("/mail")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Huỷ
            </button>
          </span>
        </div>
      </div>
      {pickerOpen && (
        <ProductFilePicker
          groups={productFiles}
          currentCount={attachments.length}
          currentBytes={totalSize}
          onAttached={(ref) => setAttachments((prev) => [...prev, ref])}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {sigOpen && (
        <div className="animate-fade fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-[2px]">
          <div className="animate-pop w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-pop">
            <div className="border-b border-ink-200 px-5 py-4">
              <h3 className="text-base font-bold text-ink-900">Chữ ký email của tôi</h3>
              <p className="mt-0.5 text-xs text-ink-500">
                {sigCustom
                  ? "Chữ ký tuỳ chỉnh được chèn sẵn khi soạn thư mới; bạn vẫn sửa được trong từng thư."
                  : "Bạn đang dùng chữ ký tự động. Sửa nội dung rồi bấm Lưu để dùng chữ ký của riêng bạn."}
              </p>
            </div>
            <div className="px-5 py-4">
              <RichEditor
                value={sigDraft}
                onChange={setSigDraft}
                minHeight={180}
                placeholder="Nhập chữ ký của bạn…"
              />
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-ink-200 px-5 py-3">
              <div>
                {sigCustom && (
                  <Button variant="ghost" disabled={sigBusy} onClick={() => void clearSignature()}>
                    <Trash2 className="h-4 w-4" />
                    Xoá chữ ký tuỳ chỉnh
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={sigBusy} onClick={() => setSigOpen(false)}>
                  Huỷ
              </Button>
              <Button disabled={sigBusy} onClick={() => void saveSignature()}>
                {sigBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                Lưu chữ ký
              </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ComposeSidebar
        subject={subject}
        bodyHtml={body}
        direction={effectiveDirection}
        to={to}
        attachmentCount={attachments.length}
        attachmentBytes={totalSize}
        active={activeContext}
        relatedBuyer={relatedBuyer}
        prospectCompanyIntroduction={initial.prospectCompanyIntroduction ?? null}
        recent={recent}
        signature={mySig}
      />
    </div>
  );
}

function AddressRow({
  label,
  values,
  onChange,
  onRemove,
  extra,
  inputValue,
  setInputValue,
  onKeyDown,
  suggestions,
  onPick,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  onRemove: (v: string) => void;
  extra?: React.ReactNode;
  inputValue?: string;
  setInputValue?: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  suggestions?: Contact[];
  onPick?: (email: string) => void;
}) {
  const [local, setLocal] = useState("");
  const value = inputValue ?? local;
  const setValue = setInputValue ?? setLocal;

  function commit() {
    const parts = value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) onChange(Array.from(new Set([...values, ...parts])));
    setValue("");
  }

  return (
    <div className="flex items-start gap-3 px-3 py-1.5">
      <span className="w-12 shrink-0 pt-1.5 text-[12.5px] font-semibold text-ink-500">{label}</span>
      <div className="flex min-h-[38px] flex-1 flex-wrap items-center gap-1.5 py-1">
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 rounded-full bg-ink-100 py-1 pr-1 pl-2.5 text-[12.5px] text-ink-800"
          >
            {v}
            <button
              type="button"
              onClick={() => onRemove(v)}
              className="rounded-full p-0.5 text-ink-400 transition hover:bg-ink-200 hover:text-ink-800"
              aria-label={`Gỡ ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="min-w-[180px] flex-1 border-0 bg-transparent py-1 text-[13.5px] text-ink-900 outline-none"
          placeholder={values.length ? "" : "email@company.com"}
          value={value}
          list={suggestions ? `contacts-${label}` : undefined}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        {suggestions && (
          <datalist id={`contacts-${label}`}>
            {suggestions
              .filter((c) => c.email)
              .map((c) => (
                <option key={c.id} value={c.email as string}>
                  {c.name}
                </option>
              ))}
          </datalist>
        )}
      </div>
      {extra && <div className="shrink-0 pt-1.5">{extra}</div>}
      {onPick && value && suggestions && (
        <div className="hidden">{/* gợi ý hiển thị qua datalist */}</div>
      )}
    </div>
  );
}
