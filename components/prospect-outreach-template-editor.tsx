"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  clearProspectOutreachTemplateAction,
  saveProspectOutreachTemplateAction,
} from "@/app/actions";
import type { ProspectOutreachTemplate } from "@/lib/types";
import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/toast";

export function ProspectOutreachTemplateEditor({
  templates,
  canEdit,
}: {
  templates: (ProspectOutreachTemplate & { isOverridden: boolean })[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "intro");
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];
  const [label, setLabel] = useState(selected?.label ?? "");
  const [subject, setSubject] = useState(selected?.subject ?? "");
  const [body, setBody] = useState(selected?.body ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLabel(selected?.label ?? "");
    setSubject(selected?.subject ?? "");
    setBody(selected?.body ?? "");
  }, [selectedId, templates]);

  async function save() {
    if (!selected) return;
    setBusy(true);
    const result = await saveProspectOutreachTemplateAction({ id: selected.id, label, subject, body });
    setBusy(false);
    toast.push({ kind: result.ok ? "success" : "error", title: result.message });
    if (result.ok) router.refresh();
  }

  async function reset() {
    if (!selected) return;
    setBusy(true);
    const result = await clearProspectOutreachTemplateAction(selected.id);
    setBusy(false);
    toast.push({ kind: result.ok ? "success" : "error", title: result.message });
    if (result.ok) router.refresh();
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-ink-200 px-4 py-3">
        <h2 className="text-[15px] font-bold text-ink-900">Mẫu tiếp cận khách hàng mục tiêu</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          Các mẫu này được lưu riêng, không thay đổi email cập nhật giai đoạn Buyer. Nội dung chỉ được nạp vào bản nháp và không tự gửi.
        </p>
      </div>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setSelectedId(template.id)}
              className={`rounded-lg border px-3 py-2 text-[12px] font-semibold transition ${selectedId === template.id ? "border-brand-300 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}
            >
              {template.label}
            </button>
          ))}
        </div>
        {selected && (
          <>
            <label className="block">
              <span className="label">Tên mẫu</span>
              <input className="input" value={label} disabled={!canEdit || busy} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <label className="block">
              <span className="label">Tiêu đề</span>
              <input className="input" value={subject} disabled={!canEdit || busy} onChange={(event) => setSubject(event.target.value)} />
            </label>
            <label className="block">
              <span className="label">Nội dung</span>
              <textarea className="input min-h-56 resize-y leading-relaxed" value={body} disabled={!canEdit || busy} onChange={(event) => setBody(event.target.value)} />
            </label>
            <p className="text-[11px] text-ink-500">Biến cá nhân hóa: <code>{"{contactName}"}</code> và <code>{"{company}"}</code>.</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-ink-400">{selected.isOverridden ? "Đang dùng bản đã chỉnh sửa." : "Đang dùng nội dung mặc định."}</p>
              {canEdit && (
                <div className="flex gap-2">
                  <Button variant="ghost" disabled={busy || !selected.isOverridden} onClick={() => void reset()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Khôi phục
                  </Button>
                  <Button disabled={busy} onClick={() => void save()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Lưu mẫu
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
