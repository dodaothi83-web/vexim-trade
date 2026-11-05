"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2 } from "lucide-react";
import { cx } from "@/components/ui";

type Status = { kind: "ok" | "error"; text: string } | null;

/**
 * Trạng thái đang gửi của form tự quản. Không dùng prop `action` của form vì React
 * tự xoá chữ đã nhập sau mỗi lần chạy, kể cả khi lưu lỗi.
 */
const PendingContext = createContext<boolean | null>(null);

/** Gửi form bằng onSubmit: giữ nguyên chữ đã nhập, chỉ xoá khi được yêu cầu. */
export function useActionSubmit(action: (fd: FormData) => Promise<unknown>, handlers: {
  onSuccess: (form: HTMLFormElement) => void;
  onError: (error: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      try {
        await action(fd);
        handlers.onSuccess(form);
      } catch (error) {
        handlers.onError(error);
      }
    });
  };
  return { pending, onSubmit };
}

export function PendingProvider({ pending, children }: { pending: boolean; children: ReactNode }) {
  return <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>;
}

/** Đang gửi: ưu tiên form tự quản, không có thì đọc trạng thái form thường. */
export function usePending(): boolean {
  const own = useContext(PendingContext);
  const { pending } = useFormStatus();
  return own ?? pending;
}

/**
 * Lỗi máy chủ ở bản production bị che nội dung; khi đó hiện câu chung thay vì
 * câu tiếng Anh khó hiểu. Ở bản phát triển vẫn hiện đúng lỗi để dễ sửa.
 */
export function actionErrorText(error: unknown, fallback = "Chưa lưu được. Hãy thử lại."): string {
  const message = error instanceof Error ? error.message : "";
  if (!message || /server components render|digest|unexpected response/i.test(message)) return fallback;
  return message;
}

/**
 * Form gọi server action và báo kết quả ngay dưới nút: "Đang lưu…" khi chờ,
 * "Đã lưu" khi xong, câu lỗi khi hỏng. Không chuyển sang trang lỗi, không mất chữ đã nhập.
 * Quyền và kiểm tra dữ liệu vẫn nằm ở server action.
 */
export function ActionForm({ action, children, className, wrapperClassName, successText = "Đã lưu", resetOnSuccess = false }: {
  action: (fd: FormData) => Promise<unknown>;
  children: ReactNode;
  className?: string;
  wrapperClassName?: string;
  successText?: string;
  resetOnSuccess?: boolean;
}) {
  const [status, setStatus] = useState<Status>(null);
  useEffect(() => {
    if (status?.kind !== "ok") return;
    const timer = window.setTimeout(() => setStatus(null), 3000);
    return () => window.clearTimeout(timer);
  }, [status]);
  const { pending, onSubmit } = useActionSubmit(action, {
    onSuccess: (form) => { if (resetOnSuccess) form.reset(); setStatus({ kind: "ok", text: successText }); },
    onError: (error) => setStatus({ kind: "error", text: actionErrorText(error) }),
  });
  return <div className={wrapperClassName}>
    <form className={className} onSubmit={(event) => { setStatus(null); onSubmit(event); }} aria-busy={pending}>
      <PendingProvider pending={pending}>{children}</PendingProvider>
    </form>
    <ActionStatus status={status} />
  </div>;
}

export function ActionStatus({ status }: { status: Status }) {
  return <p role="status" aria-live="polite" className={cx("min-h-0 text-[12px] leading-5", status ? "mt-1" : "sr-only",
    status?.kind === "error" ? "text-red-700" : "text-emerald-700")}>
    {status?.kind === "ok" && <Check className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />}
    {status?.text ?? ""}
  </p>;
}

/** Nút gửi form: khoá lại và hiện vòng quay trong lúc server đang xử lý. */
export function PendingButton({ children, pendingText, className, variant = "ghost", title }: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  variant?: "primary" | "ghost" | "soft" | "danger";
  title?: string;
}) {
  const pending = usePending();
  return <button type="submit" disabled={pending} aria-busy={pending} title={title}
    className={cx("btn px-2.5 py-1.5 text-[13px] disabled:cursor-wait disabled:opacity-70", `btn-${variant}`, className)}>
    {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
    {pending ? pendingText ?? "Đang lưu…" : children}
  </button>;
}
