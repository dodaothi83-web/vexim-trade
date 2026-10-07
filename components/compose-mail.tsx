"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { saveDraftAction, sendMailAction } from "@/app/actions";
import type { Attachment, Buyer, Supplier } from "@/lib/types";
import { RichEditor } from "@/components/rich-editor";
import { Button, cx } from "@/components/ui";
import { useToast } from "@/components/toast";

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  kind: "buyer" | "supplier";
}

export interface ComposeInitial {
  buyerId?: string | null;
  supplierId?: string | null;
  direction: "buyer" | "supplier";
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyHtml?: string;
  attachments?: Attachment[];
  draftId?: string | null;
}

const MAX_BYTES = 10 * 1024 * 1024;

export function ComposeMail({
  initial,
  contacts,
  buyer,
  signature,
}: {
  initial: ComposeInitial;
  contacts: Contact[];
  buyer?: (Buyer & { supplier?: Pick<Supplier, "id" | "name"> | null }) | null;
  signature: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Mở từ hồ sơ buyer/NCC thì người nhận bị khoá; mở trống thì suy ra từ địa chỉ nhập
  const locked = Boolean(initial.buyerId || initial.supplierId);
  const [direction, setDirection] = useState<"buyer" | "supplier">(initial.direction);
  const [to, setTo] = useState<string[]>(initial.to ?? []);
  const [cc, setCc] = useState<string[]>(initial.cc ?? []);
  const [bcc, setBcc] = useState<string[]>(initial.bcc ?? []);
  const [showCc, setShowCc] = useState(Boolean(initial.cc?.length));
  const [showBcc, setShowBcc] = useState(Boolean(initial.bcc?.length));
  const [subject, setSubject] = useState(initial.subject ?? "");
  const [body, setBody] = useState(initial.bodyHtml ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(initial.attachments ?? []);
  const [busy, setBusy] = useState(false);
  const [toInput, setToInput] = useState("");

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
    () => (locked ? contacts.filter((c) => c.kind === effectiveDirection) : contacts),
    [contacts, locked, effectiveDirection],
  );

  const totalSize = attachments.reduce((s, a) => s + a.size, 0);

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

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (totalSize + next.reduce((s, a) => s + a.size, 0) + file.size > MAX_BYTES) {
        toast.push({ kind: "error", title: `Bỏ qua "${file.name}" — vượt quá 10MB tổng dung lượng.` });
        continue;
      }
      const content = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      next.push({ name: file.name, size: file.size, type: file.type, content });
    }
    setAttachments((prev) => [...prev, ...next]);
  }

  function payload() {
    return {
      buyerId: initial.buyerId ?? null,
      supplierId: initial.supplierId ?? null,
      direction: effectiveDirection,
      to,
      cc,
      bcc,
      subject,
      bodyHtml: body,
      attachments,
    };
  }

  async function send() {
    setBusy(true);
    const res = await sendMailAction(payload());
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    setBusy(false);
    if (res.ok) router.push("/mail");
  }

  async function saveAsDraft() {
    setBusy(true);
    const res = await saveDraftAction(payload());
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    setBusy(false);
    if (res.ok) router.push("/mail");
  }

  return (
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
          {attachments.map((a, i) => (
            <span
              key={i}
              className="flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-[12px]"
            >
              <FileText className="h-3.5 w-3.5 text-ink-500" />
              <span className="max-w-[180px] truncate font-medium text-ink-800">{a.name}</span>
              <span className="text-ink-400">{(a.size / 1024).toFixed(0)}KB</span>
              <button
                type="button"
                onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
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
        <Button variant="primary" disabled={busy} onClick={() => void send()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Gửi
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void saveAsDraft()}>
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
          onClick={() => setBody((b) => (b ? b : "") + signature)}
          title="Chèn chữ ký"
        >
          <Sparkles className="h-4 w-4" />
          Chữ ký
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
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
          {attachments.length > 0 && (
            <span className={cx(totalSize > MAX_BYTES && "font-semibold text-red-600")}>
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
