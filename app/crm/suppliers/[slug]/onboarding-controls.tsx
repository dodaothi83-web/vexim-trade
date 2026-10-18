"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decideSupplierOnboardingAction } from "./onboarding-actions";

export function OnboardingControls({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function decide(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const result = await decideSupplierOnboardingAction(new FormData(event.currentTarget));
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    } catch { setMessage({ ok: false, text: "Không kết nối được máy chủ. Vui lòng thử lại." }); }
    finally { setBusy(false); }
  }
  return <div className="mt-4">
    <div className="flex flex-wrap items-end gap-4">
      <form onSubmit={decide}><input type="hidden" name="supplier_id" value={supplierId} /><input type="hidden" name="decision" value="approved" />
        <button type="submit" disabled={busy} className="btn btn-primary">Xác nhận tài khoản · mở cổng NCC</button></form>
      <form onSubmit={decide} className="flex flex-wrap items-end gap-2"><input type="hidden" name="supplier_id" value={supplierId} /><input type="hidden" name="decision" value="changes_requested" />
        <label className="text-sm font-semibold text-ink-700">Nội dung cần bổ sung <input name="note" required maxLength={1000} className="input mt-1" placeholder="VD: bổ sung địa chỉ nhà máy" /></label>
        <button type="submit" disabled={busy} className="btn btn-soft">Yêu cầu chỉnh sửa</button></form>
    </div>
    {message && <p role="status" className={`mt-3 text-sm ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
  </div>;
}
