"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Mail,
  MailX,
  Send,
  Users,
} from "lucide-react";

import { changeStageAction } from "@/app/actions";
import { STAGES, getStage, type StageKey } from "@/lib/pipeline";
import { Button, cx } from "@/components/ui";
import { useToast } from "@/components/toast";

export interface StageTarget {
  id: string;
  company: string;
  stage: string;
  buyerEmail: string | null;
  buyerCc: string | null;
  supplierName: string | null;
  supplierEmail: string | null;
  owner: string | null;
}

export function StageDot({ stage, className }: { stage: string; className?: string }) {
  return (
    <span
      className={cx("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: getStage(stage).color }}
    />
  );
}

export function StageBadge({ stage, className }: { stage: string; className?: string }) {
  const s = getStage(stage);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap",
        className,
      )}
      style={{ backgroundColor: `${s.color}14`, color: s.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  );
}

interface Props {
  target: StageTarget;
  size?: "sm" | "lg";
  autoSend?: boolean;
  onAutoSendChange?: (v: boolean) => void;
  className?: string;
}

export function StageSelect({
  target,
  size = "sm",
  autoSend = false,
  className,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<StageKey | null>(null);
  const [confirming, setConfirming] = useState<StageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [localStage, setLocalStage] = useState(target.stage);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setLocalStage(target.stage), [target.stage]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(stage: StageKey, sendEmail: boolean, note?: string) {
    setBusy(true);
    setLocalStage(stage);
    setOpen(false);
    setConfirming(null);
    try {
      const res = await changeStageAction(target.id, stage, {
        sendEmail,
        note: note?.trim() || null,
      });
      toast.push({
        kind: res.ok ? (sendEmail ? "success" : "info") : "error",
        title: res.message,
        lines: res.details,
      });
    } catch (err) {
      toast.push({
        kind: "error",
        title: "Không cập nhật được trạng thái",
        lines: [err instanceof Error ? err.message : String(err)],
      });
      setLocalStage(target.stage);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  function pick(stage: StageKey) {
    if (stage === target.stage) {
      setOpen(false);
      return;
    }
    const silent = getStage(stage).silent;
    if (autoSend || silent) {
      void run(stage, !silent);
    } else {
      setConfirming(stage);
      setOpen(false);
    }
  }

  const current = getStage(localStage);

  return (
    <>
      <div ref={ref} className={cx("relative inline-block text-left", className)}>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
          className={cx(
            "inline-flex w-full items-center gap-2 rounded-lg border font-semibold transition",
            size === "lg"
              ? "px-3.5 py-2.5 text-sm"
              : "px-2.5 py-1.5 text-[12px] whitespace-nowrap",
            "border-transparent",
            open && "ring-2 ring-brand-500/25",
            busy && "opacity-60",
          )}
          style={{ backgroundColor: `${current.color}14`, color: current.color }}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: current.color }}
            />
          )}
          <span className="truncate">{current.label}</span>
          <ChevronDown
            className={cx("h-3.5 w-3.5 shrink-0 transition", open && "rotate-180")}
          />
        </button>

        {open && (
          <div
            role="listbox"
            className="animate-pop absolute right-0 z-40 mt-1.5 w-72 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop"
          >
            <p className="border-b border-ink-100 bg-ink-50 px-3 py-2 text-[11px] font-bold tracking-wide text-ink-500 uppercase">
              Chuyển trạng thái
            </p>
            <ul className="max-h-[340px] overflow-y-auto py-1">
              {STAGES.map((s) => {
                const active = s.key === localStage;
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => pick(s.key)}
                      className={cx(
                        "flex w-full items-start gap-2.5 px-3 py-2 text-left transition hover:bg-ink-50",
                        active && "bg-ink-50/70",
                      )}
                    >
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-ink-800">
                            {s.label}
                          </span>
                          {s.silent && (
                            <span className="rounded bg-red-50 px-1.5 py-px text-[10px] font-semibold text-red-600">
                              không gửi mail
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">
                          {s.hint}
                        </span>
                      </span>
                      {active && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-brand-600" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmSheet
          target={target}
          stage={confirming}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={(sendEmail, note) => void run(confirming, sendEmail, note)}
        />
      )}
    </>
  );
}

/** Hook dùng chung để đổi trạng thái + gửi email (dùng cho cả kéo-thả ở board) */
export function useStageChange() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(target: StageTarget, stage: StageKey, sendEmail: boolean, note?: string) {
    setBusy(true);
    try {
      const res = await changeStageAction(target.id, stage, {
        sendEmail,
        note: note?.trim() || null,
      });
      toast.push({
        kind: res.ok ? (sendEmail ? "success" : "info") : "error",
        title: res.message,
        lines: res.details,
      });
    } catch (err) {
      toast.push({
        kind: "error",
        title: "Không cập nhật được trạng thái",
        lines: [err instanceof Error ? err.message : String(err)],
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return { run, busy };
}

export function ConfirmSheet({
  target,
  stage,
  busy,
  onCancel,
  onConfirm,
}: {
  target: StageTarget;
  stage: StageKey;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (sendEmail: boolean, note: string) => void;
}) {
  const def = getStage(stage);
  const from = getStage(target.stage);
  const [sendBuyer, setSendBuyer] = useState(Boolean(target.buyerEmail));
  const [sendSupplier, setSendSupplier] = useState(Boolean(target.supplierEmail));
  const [note, setNote] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
        onConfirm(sendBuyer || sendSupplier, note);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm, sendBuyer, sendSupplier, note]);

  const anyRecipient = sendBuyer || sendSupplier;

  return (
    <div className="animate-fade fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-[2px]">
      <div className="animate-pop w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-pop">
        <div className="border-b border-ink-200 px-5 py-4">
          <h3 className="text-base font-bold text-ink-900">Cập nhật tiến độ đơn hàng</h3>
          <p className="mt-0.5 text-xs text-ink-500">{target.company}</p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center gap-3 rounded-xl bg-ink-50 px-4 py-3">
            <StageBadge stage={from.key} />
            <ArrowRight className="h-4 w-4 shrink-0 text-ink-400" />
            <StageBadge stage={def.key} />
          </div>

          <div>
            <p className="label mb-2">Email cập nhật sẽ gửi tới</p>
            <div className="space-y-2">
              <RecipientRow
                checked={sendBuyer}
                disabled={!target.buyerEmail}
                onChange={setSendBuyer}
                icon={<Mail className="h-4 w-4" />}
                title="Buyer (tiếng Anh)"
                detail={target.buyerEmail ?? "Chưa có email buyer"}
                extra={target.buyerCc ? `cc: ${target.buyerCc}` : undefined}
              />
              <RecipientRow
                checked={sendSupplier}
                disabled={!target.supplierEmail}
                onChange={setSendSupplier}
                icon={<Users className="h-4 w-4" />}
                title="Nhà cung cấp (tiếng Việt)"
                detail={
                  target.supplierEmail
                    ? `${target.supplierName} · ${target.supplierEmail}`
                    : target.supplierName
                      ? `${target.supplierName} · chưa có email`
                      : "Chưa gắn nhà cung cấp — chỉ gửi buyer"
                }
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="stage-note">
              Ghi chú thêm vào email <span className="font-normal text-ink-400">(không bắt buộc)</span>
            </label>
            <textarea
              id="stage-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="VD: Báo giá có hiệu lực đến 25/10. Vui lòng xác nhận trước thứ Sáu."
              className="input resize-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-200 bg-ink-50 px-5 py-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Huỷ
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onConfirm(false, "")}
            title="Chỉ đổi trạng thái trong hệ thống"
          >
            <MailX className="h-4 w-4" />
            Không gửi email
          </Button>
          <Button
            variant="primary"
            disabled={busy || !anyRecipient}
            onClick={() => onConfirm(true, note)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Cập nhật &amp; gửi email
          </Button>
        </div>
        <p className="bg-ink-50 px-5 pb-3 text-[11px] text-ink-400">
          Phím tắt: <kbd className="rounded bg-white px-1 ring-1 ring-ink-200">Ctrl</kbd> +{" "}
          <kbd className="rounded bg-white px-1 ring-1 ring-ink-200">Enter</kbd> để gửi.
        </p>
      </div>
    </div>
  );
}

function RecipientRow({
  checked,
  disabled,
  onChange,
  icon,
  title,
  detail,
  extra,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  title: string;
  detail: string;
  extra?: string;
}) {
  return (
    <label
      className={cx(
        "flex items-start gap-3 rounded-xl border px-3.5 py-2.5 transition",
        disabled
          ? "cursor-not-allowed border-ink-200 bg-ink-50 opacity-70"
          : checked
            ? "border-brand-300 bg-brand-50/60"
            : "cursor-pointer border-ink-200 hover:border-ink-300",
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#0f766e] disabled:cursor-not-allowed"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-800">
          {icon}
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-ink-500">{detail}</span>
        {extra && <span className="block text-[11px] text-ink-400">{extra}</span>}
      </span>
    </label>
  );
}
