"use client";

import { useActionState } from "react";

import { allowResendAction, type AllowResendResult } from "./actions";

const initial: AllowResendResult = { ok: false, message: "" };

export function AllowResendButton({ email }: { email: string }) {
  const [result, action, pending] = useActionState(allowResendAction, initial);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="email" value={email} />
      <button className="btn btn-ghost btn-sm" disabled={pending}>
        {pending ? "Đang gỡ..." : "Cho gửi lại"}
      </button>
      {result.message && (
        <span role={result.ok ? "status" : "alert"} className={result.ok ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>
          {result.message}
        </span>
      )}
    </form>
  );
}
