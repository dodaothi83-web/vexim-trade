"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";

import {
  clearTemplateOverrideAction,
  saveTemplateOverrideAction,
} from "@/app/actions";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

/**
 * Ô chỉnh sửa nội dung template của một (giai đoạn × hướng gửi).
 * `fields` = nội dung đang hiệu lực (đã trộn ghi đè), `defaults` = mặc định hệ thống.
 */
export function TemplateEditor({
  stage,
  dir,
  fields,
  defaults,
  hasOverride,
  placeholders,
}: {
  stage: string;
  dir: "buyer" | "supplier";
  fields: { subject: string; body: string; action: string; tasks: string; deadline: string };
  defaults: { subject: string; body: string; action: string; tasks: string; deadline: string };
  hasOverride: boolean;
  placeholders: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [subject, setSubject] = useState(fields.subject);
  const [body, setBody] = useState(fields.body);
  const [action, setAction] = useState(fields.action);
  const [tasks, setTasks] = useState(fields.tasks);
  const [deadline, setDeadline] = useState(fields.deadline);
  const [busy, setBusy] = useState(false);

  // Đổi giai đoạn / hướng gửi => nạp lại nội dung tương ứng
  useEffect(() => {
    setSubject(fields.subject);
    setBody(fields.body);
    setAction(fields.action);
    setTasks(fields.tasks);
    setDeadline(fields.deadline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, dir]);

  const dirty =
    subject !== fields.subject ||
    body !== fields.body ||
    action !== fields.action ||
    tasks !== fields.tasks ||
    deadline !== fields.deadline;

  async function save() {
    setBusy(true);
    const res = await saveTemplateOverrideAction({
      stage,
      dir,
      subject,
      body,
      action,
      tasks,
      deadline,
    });
    setBusy(false);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message, lines: res.details });
    if (res.ok) router.refresh();
  }

  async function reset() {
    setBusy(true);
    const res = await clearTemplateOverrideAction(stage, dir);
    setBusy(false);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) {
      setSubject(defaults.subject);
      setBody(defaults.body);
      setAction(defaults.action);
      setTasks(defaults.tasks);
      setDeadline(defaults.deadline);
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label">Tiêu đề email</span>
        <input
          className="input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Tiêu đề…"
        />
      </label>
      <label className="block">
        <span className="label">Thân thư — mỗi đoạn cách nhau một dòng trống</span>
        <textarea
          className="input min-h-[150px] font-mono text-[12.5px] leading-relaxed"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      {dir === "buyer" ? (
        <label className="block">
          <span className="label">Bước kế tiếp / điều cần ở buyer (khối action)</span>
          <textarea
            className="input min-h-[64px] font-mono text-[12.5px] leading-relaxed"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </label>
      ) : (
        <>
          <label className="block">
            <span className="label">Việc cho xưởng — mỗi dòng một đầu việc</span>
            <textarea
              className="input min-h-[84px] font-mono text-[12.5px] leading-relaxed"
              value={tasks}
              onChange={(e) => setTasks(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">Thời hạn phản hồi</span>
            <input
              className="input"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
        </>
      )}
      <p className="text-[11.5px] leading-relaxed text-ink-400">{placeholders}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Lưu template
        </Button>
        {hasOverride && (
          <Button variant="ghost" disabled={busy} onClick={() => void reset()}>
            <RotateCcw className="h-4 w-4" />
            Khôi phục mặc định
          </Button>
        )}
        <span className="ml-auto text-[11.5px] text-ink-400">
          {hasOverride
            ? "Giai đoạn này đang dùng nội dung đã sửa."
            : "Đang dùng nội dung mặc định của hệ thống."}
          {dirty ? " • Có thay đổi chưa lưu" : ""}
        </span>
      </div>
    </div>
  );
}
