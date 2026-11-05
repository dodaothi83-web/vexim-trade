"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

/** Nút submit hỏi xác nhận trước các thao tác gửi email hoặc khó hoàn tác. Form và quyền vẫn xử lý ở server. */
export function ConfirmSubmitButton({ message, className = "btn btn-soft btn-sm", title, children }: {
  message: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  // Trong lúc server xử lý, nút khoá lại và quay để người dùng biết đã bấm, không bấm lặp.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`${className} disabled:cursor-wait disabled:opacity-70`}
      title={title}
      disabled={pending}
      aria-busy={pending}
      onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
