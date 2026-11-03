"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FilePicker } from "@/components/file-picker";
import type { PortalMessages } from "@/lib/i18n/portal";

/**
 * Mỗi mục giấy tờ L1 có ô tải riêng ngay trong thẻ của nó, thay vì bắt người
 * dùng chọn mục ở một ô select rồi mới chọn tệp. Tải lên xong thì làm mới trang
 * để thẻ hiện đúng tệp mới nhất; không có bước nào tự duyệt.
 */
export function L1DocUpload({ checklistKey, hasFile, copy }: {
  checklistKey: string;
  hasFile: boolean;
  copy: PortalMessages["documents"]["l1Upload"];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("checklistKey", checklistKey);
      form.set("file", file);
      const response = await fetch("/api/supplier-portal/evidence", { method: "POST", body: form });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      const ok = response.ok && payload.ok !== false;
      setMessage({ ok, text: payload.message ?? (ok ? copy.ok : copy.fail) });
      if (ok) router.refresh();
    } catch {
      setMessage({ ok: false, text: copy.offline });
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-2">
    <FilePicker
      compact
      busy={busy}
      accept=".pdf,image/jpeg,image/png,image/webp"
      title={hasFile ? copy.replace : copy.upload}
      hint={copy.hint}
      onPick={upload}
    />
    {message && <p role="status" className={`mt-1 text-[10.5px] leading-4 ${message.ok ? "text-emerald-800" : "text-rose-700"}`}>
      {message.text}
    </p>}
  </div>;
}
