"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  CircleStop,
  RefreshCw,
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

import { generateFirstTouchDraftAction, saveDraftAction, sendMailAction } from "@/app/actions";
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

/**
 * Chuyển dấu * đậm/nghiêng của Markdown thành thẻ HTML sau khi đã escape.
 * Quy tắc:
 *   ***...*** → <strong><em>...</em></strong>
 *   **...**  → <strong>...</strong>
 *   *...*   → <em>...</em>
 * Áp dụng cho khung thư cố định (first-touch); người soạn vẫn gõ được * bình thường
 * vì RichEditor không phát sinh dấu * thô trong bodyHtml (nó dùng thẻ <strong>/<em>).
 */
function renderInlineMarks(htmlEscaped: string): string {
  // ***bold+italic*** trước rồi mới đến **bold** và *italic* — tránh nuốt nhau.
  // Dùng ký tự phân cách không xung đột với nội dung đã escape.
  const B = "\u0002";
  const I = "\u0003";
  let out = htmlEscaped;
  out = out.replace(/\*\*\*([^*\n][^*\n]*?)\*\*\*/g, `${B}${B}${I}$1${I}${B}${B}`);
  out = out.replace(/\*\*([^*\n][^*\n]*?)\*\*/g, `${B}${B}$1${B}${B}`);
  out = out.replace(/(^|[^*])\*([^*\n][^*\n]*?)\*/g, (_m, pre, inner) => `${pre}${I}${inner}${I}`);
  out = out
    .split(B + B)
    .map((chunk, i) => (i % 2 === 1 ? `<strong>${chunk}</strong>` : chunk))
    .join("");
  out = out
    .split(I)
    .map((chunk, i) => (i % 2 === 1 ? `<em>${chunk}</em>` : chunk))
    .join("");
  return out;
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
  senderAddress = null,
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
  /**
   * Địa chỉ thật sẽ hiện trong header From (dung@veximtrade.com). Thư gửi từ địa chỉ
   * mang tên người đáng tin hơn address chức năng (sales@) — xem lib/email/sender.ts.
   */
  senderAddress?: string | null;
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
  /**
   * id bản nháp đang mở. Lưu bao nhiêu lần cũng chỉ ghi đè lên đúng bản này (một lần soạn
   * = một dòng "Nháp", như Gmail) nên không còn cảnh mỗi lần bấm Lưu là một bản khác nhau.
   */
  const [draftId, setDraftId] = useState<string | null>(initial.draftId ?? null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [toInput, setToInput] = useState("");

  // ---- AI viết email tiếp cận đầu tiên (chỉ chiều buyer) ----
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [aiHasDraft, setAiHasDraft] = useState(false);
  /** Chỗ AI không tìm thấy dữ liệu — giữ nguyên placeholder để nhân viên điền tay */
  const [aiMissing, setAiMissing] = useState<string[]>([]);
  const [aiNote, setAiNote] = useState<string | null>(null);
  /** Bấm lần hai khi khung đang có nội dung mới ghi đè — khỏi mất bài người soạn viết dở */
  const [aiOverwriteArmed, setAiOverwriteArmed] = useState(false);
  const typing = useRef<{ timer: number | null; finish: (() => void) | null }>({ timer: null, finish: null });
  /** Bản nháp AI vừa chèn — người soạn chưa sửa gì thì bấm "Viết lại" không cần xác nhận ghi đè */
  const aiBodyRef = useRef<string | null>(null);

  // Chữ ký cá nhân kiểu Gmail/Zoho: sửa & lưu từ hộp thoại, áp dụng cho thư soạn mới
  const [mySig, setMySig] = useState(signature);
  const [sigCustom, setSigCustom] = useState(Boolean(signatureCustom));
  const [sigOpen, setSigOpen] = useState(false);
  const [sigDraft, setSigDraft] = useState("");
  const [sigBusy, setSigBusy] = useState(false);

  useEffect(() => () => {
    if (typing.current.timer) window.clearTimeout(typing.current.timer);
  }, []);

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
      draftId,
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

  /** Văn bản thuần -> <p>…</p>, cùng cách escape mà mẫu tiếp cận đang dùng.
   *  Hỗ trợ tối thiểu Markdown inline theo đúng quy ước của mẫu thư cố định:
   *    ***chữ*** → <strong><em>chữ</em></strong>  (câu hỏi kêu hành động)
   *    **chữ**  → <strong>chữ</strong>            (tên thương hiệu)
   *    *chữ*   → <em>chữ</em>                    (dòng opt-out)
   *  Không hỗ trợ link, gạch đầu dòng, tiêu đề — mẫu thư không dùng chúng.
   */
  function plainToParagraphs(text: string): string {
    return text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const escaped = escapeTemplateHtml(block).replace(/\n/g, "<br/>");
        const withMarks = renderInlineMarks(escaped);
        return `<p>${withMarks}</p>`;
      })
      .join("");
  }

  function stopTyping() {
    if (typing.current.timer) window.clearTimeout(typing.current.timer);
    typing.current.timer = null;
    setAiTyping(false);
  }

  /**
   * Gõ dần bản nháp vào khung nội dung cho giống người thật đang viết (mỗi chữ một
   * nhịp, nghỉ lâu hơn sau dấu chấm), chữ ký nối vào sau cùng.
   * "Dừng lại" = chèn ngay phần còn lại, không mất chữ nào.
   */
  function typeIntoEditor(text: string) {
    const flat: { p: number; word: string }[] = [];
    text
      .split(/\n{2,}/)
      .map((block) => block.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .forEach((block, pIndex) => {
        block.split(" ").forEach((word) => flat.push({ p: pIndex, word: escapeTemplateHtml(word) }));
      });
    const finalBody = `${plainToParagraphs(text)}${mySig ? `<p><br/></p>${mySig}` : ""}`;
    const finish = () => {
      stopTyping();
      typing.current.finish = null;
      aiBodyRef.current = finalBody;
      setBody(finalBody);
    };
    typing.current.finish = finish;

    const htmlUpTo = (count: number) => {
      const out: string[] = [];
      let paragraph = -1;
      for (let i = 0; i < count; i += 1) {
        const item = flat[i];
        if (item.p !== paragraph) {
          if (out.length) out.push("</p>");
          out.push("<p>");
          paragraph = item.p;
        } else if (i > 0) {
          out.push(" ");
        }
        out.push(item.word);
      }
      if (out.length) out.push("</p>");
      // Render **/***/* thành <strong>/<em> cả khi đang gõ để dấu * không hiện thô
      // cho đến khi cặp dấu hoàn chỉnh thì chữ lập tức lên đậm/nghiêng.
      return renderInlineMarks(out.join(""));
    };

    let i = 0;
    setAiTyping(true);
    const step = () => {
      const current = flat[i];
      i += 1;
      setBody(htmlUpTo(i));
      if (i >= flat.length) {
        finish();
        return;
      }
      const pause = /[.!?…:]$/.test(current.word.replace(/<[^>]*>/g, "")) ? 160 : 16 + Math.random() * 28;
      typing.current.timer = window.setTimeout(step, pause);
    };
    typing.current.timer = window.setTimeout(step, 80);
  }

  /** Bỏ chữ ký + lời chào ra khỏi nội dung để biết người soạn đã tự viết gì chưa */
  function hasOwnDraft(html: string): boolean {
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const sig = (mySig ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const stripped = sig && text.endsWith(sig) ? text.slice(0, -sig.length).trim() : text;
    return stripped.replace(/^(?:dear|kính gửi|chào)\b[^.]{0,60}$/i, "").trim().length > 40;
  }

  async function askAi(forceRescan = false) {
    if (aiBusy || aiTyping) return;
    const untouchedByHuman = aiBodyRef.current !== null && body === aiBodyRef.current;
    const overwriteNeeded = !untouchedByHuman && hasOwnDraft(body) && !aiOverwriteArmed;
    if (overwriteNeeded) {
      setAiOverwriteArmed(true);
      setAiNote("Khung đang có nội dung bạn viết dở — bấm lại lần nữa để AI ghi đè.");
      return;
    }
    setAiOverwriteArmed(false);
    aiBodyRef.current = null;
    setAiBusy(true);
    setAiNote(
      forceRescan
        ? "AI đang mở lại website buyer và đọc ảnh sản phẩm (~30 giây)…"
        : "AI đang đọc hồ sơ + website buyer (lần đầu mất ~30 giây vì phải tải trang và ảnh)…",
    );
    try {
      const res = await generateFirstTouchDraftAction({
        buyerId: initial.buyerId ?? (activeContext?.kind === "buyer" ? activeContext.id : null),
        prospectId: initial.prospectId ?? null,
        email: to[0] ?? null,
        refresh: forceRescan,
      });
      setAiBusy(false);
      if (!res.ok || !res.body) {
        toast.push({ kind: "error", title: res.message });
        setAiNote(res.message);
        return;
      }
      setSubject(res.subject ?? "");
      setAiHasDraft(true);
      setAiMissing(Array.isArray(res.missing) ? res.missing : []);
      setAiNote(res.message);
      typeIntoEditor(res.body);
    } catch {
      setAiBusy(false);
      setAiNote("Không gọi được AI — kiểm tra OPENAI_API_KEY ở máy chủ rồi thử lại.");
      toast.push({ kind: "error", title: "Không kết nối được với dịch vụ AI." });
    }
  }

  async function send() {
    if (typing.current.finish) typing.current.finish();
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
    setBusy(false);
    if (res.ok) {
      // Ở lại trang soạn thư để viết tiếp (Gmail cũng làm vậy). Nhảy về Hộp thư sau mỗi
      // lần lưu khiến người dùng bấm soạn lại từ đầu và sinh thêm bản nháp trùng nội dung.
      if (res.id) {
        setDraftId(res.id);
        const params = new URLSearchParams(window.location.search);
        params.set("draft", res.id);
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      }
      setSavedAt(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
    }
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
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
          <span className="text-[13px] font-bold text-ink-900">
            {draftId ? "Bản nháp" : "Soạn thư mới"}
          </span>
          {savedAt ? (
            <span
              className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700"
              title="Lưu nháp ghi đè lên chính bản nháp này — mỗi lần soạn chỉ có một bản"
            >
              <Check className="h-3 w-3" /> Đã lưu lúc {savedAt}
            </span>
          ) : null}
        </div>

        {/* Người nhận */}
        <div className="divide-y divide-ink-100">
          {senderAddress && (
            <div className="flex items-center gap-3 px-3">
              <span className="w-12 shrink-0 text-[12.5px] font-semibold text-ink-500">Từ</span>
              <span className="min-w-0 flex-1 truncate py-2.5 text-[13px] text-ink-700" title={senderAddress}>
                {senderAddress}
              </span>
              <button
                type="button"
                onClick={() => router.push("/settings/profile")}
                className="shrink-0 text-[11.5px] font-semibold text-brand-700 transition hover:text-brand-800"
                title="Đổi địa chỉ gửi trong hồ sơ cá nhân"
              >
                Đổi
              </button>
            </div>
          )}
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

        {/* ---- AI viết email tiếp cận đầu tiên ----
             Chỉ bật ở chiều buyer: đây là thư tiếp cận bằng tiếng Anh dựa trên hồ sơ.
             AI không tự gửi và không ghi gì vào DB — bản nháp hiện vào khung, người soạn
             sửa tuỳ ý rồi hãy bấm Gửi (vẫn qua đủ bước kiểm tra tệp + bảo mật như thư thường). */}
        {isBuyerDir && (
          <div className="flex flex-wrap items-center gap-2 border-t border-ink-200 bg-ink-50/60 px-3 py-2.5">
            <button
              type="button"
              onClick={() => {
                if (aiTyping) {
                  typing.current.finish?.();
                  return;
                }
                void askAi(false);
              }}
              disabled={aiBusy}
              className="btn btn-ghost px-2.5 text-[12px]"
              title="AI đọc hồ sơ buyer — tự phân tích công ty nếu hồ sơ chưa có — rồi viết bản nháp 80-120 từ"
            >
              {aiTyping ? (
                <CircleStop className="h-4 w-4" />
              ) : aiBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
              {aiBusy ? "AI đang đọc website buyer…" : aiTyping ? "Chèn nốt" : aiHasDraft ? "Viết lại" : "AI viết tiếp cận"}
            </button>
            {aiHasDraft && !aiBusy && (
              <button
                type="button"
                onClick={() => void askAi(true)}
                className="btn btn-ghost px-2 py-1 text-[11.5px] text-ink-500"
                title="Bỏ bản đã lưu, mở lại website buyer và đọc lại ảnh sản phẩm"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Quét lại website
              </button>
            )}
            {aiMissing.length > 0 && (
              <span className="w-full rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                Còn {aiMissing.length} chỗ AI không tìm thấy dữ liệu: {aiMissing.join(", ")} — điền tay rồi hãy gửi.
              </span>
            )}
            <span className="text-[11px] text-ink-400" aria-live="polite">
              {aiNote ?? "Thư theo mẫu cố định — AI chỉ điền sản phẩm đọc từ website + ảnh của buyer."}
            </span>
          </div>
        )}

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

        {/* Nội dung. Khi AI đang gõ thì khoá tương tác để không xung đột với từng nhịp chèn chữ */}
        <div className="border-t border-ink-200 p-3">
          <div className={aiTyping ? "pointer-events-none select-none" : undefined} aria-busy={aiTyping}>
            <RichEditor
              value={body}
              onChange={setBody}
              placeholder="Viết nội dung email…"
              minHeight={320}
            />
          </div>
          {aiTyping && (
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-brand-700">
              <Bot className="h-3.5 w-3.5 shrink-0" />
              AI đang gõ… bấm “Chèn nốt” để lấy toàn bộ phần còn lại ngay.
            </p>
          )}
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
