"use client";

import type { ReactNode } from "react";

/** Nút submit hỏi xác nhận trước các thao tác gửi email hoặc khó hoàn tác. Form và quyền vẫn xử lý ở server. */
export function ConfirmSubmitButton({ message, className = "btn btn-soft btn-sm", title, children }: {
  message: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      title={title}
      onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}
    >
      {children}
    </button>
  );
}
