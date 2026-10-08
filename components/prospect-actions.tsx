"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightLeft, Loader2, MessageSquarePlus } from "lucide-react";

import {
  addProspectActivityAction,
  convertProspectAction,
  linkProspectToBuyerAction,
  updateProspectAction,
} from "@/app/actions";
import type { ProspectActivityChannel, ProspectStatus } from "@/lib/types";
import { PROSPECT_STATUSES } from "@/lib/prospects/status";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

export function ProspectStatusControl({ id, value }: { id: string; value: ProspectStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function change(status: ProspectStatus) {
    setBusy(true);
    const response = await updateProspectAction(id, { status });
    setBusy(false);
    toast.push({ kind: response.ok ? "success" : "error", title: response.message });
    if (response.ok) router.refresh();
  }
  return (
    <label className="block max-w-xs">
      <span className="label">Trạng thái prospect</span>
      <select disabled={busy || value === "converted"} className="input" value={value} onChange={(event) => void change(event.target.value as ProspectStatus)}>
        {PROSPECT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
      </select>
    </label>
  );
}

export function ProspectActivityForm({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [channel, setChannel] = useState<ProspectActivityChannel>("phone");
  const [summary, setSummary] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const response = await addProspectActivityAction({ prospectId, channel, summary });
    if (response.ok && (nextAction.trim() || nextActionAt)) {
      const date = nextActionAt ? new Date(nextActionAt).toISOString() : undefined;
      await updateProspectAction(prospectId, {
        ...(nextAction.trim() ? { next_action: nextAction.trim() } : {}),
        ...(date ? { next_action_at: date } : {}),
      });
    }
    setBusy(false);
    toast.push({ kind: response.ok ? "success" : "error", title: response.message });
    if (response.ok) {
      setSummary("");
      setNextAction("");
      setNextActionAt("");
      router.refresh();
    }
  }
  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink-900"><MessageSquarePlus className="h-4 w-4 text-brand-700" />Ghi nhận liên hệ</h2>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <select className="input" value={channel} onChange={(event) => setChannel(event.target.value as ProspectActivityChannel)}>
          <option value="phone">Điện thoại</option>
          <option value="linkedin">LinkedIn</option>
          <option value="meeting">Meeting</option>
          <option value="note">Ghi chú</option>
        </select>
        <textarea required rows={2} className="input resize-y" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Ngày giờ, người tham dự, kết quả trao đổi..." />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
        <input className="input" value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="Việc follow-up tiếp theo (nếu có)" />
        <input type="datetime-local" className="input" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} />
      </div>
      <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Lưu hoạt động</Button></div>
    </form>
  );
}

export function ProspectConversion({
  prospectId,
  status,
  matchedBuyerId,
  matchCandidates,
}: {
  prospectId: string;
  status: ProspectStatus;
  matchedBuyerId?: string | null;
  matchCandidates: { id: string; company: string; contactName: string | null; email: string | null }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function convert() {
    setBusy(true);
    const response = await convertProspectAction(prospectId);
    setBusy(false);
    toast.push({ kind: response.ok ? "success" : "error", title: response.message });
    if (response.ok && response.buyerId) router.push(`/buyers/${response.buyerId}`);
  }
  async function link(buyerId: string) {
    setBusy(true);
    const response = await linkProspectToBuyerAction(prospectId, buyerId);
    setBusy(false);
    toast.push({ kind: response.ok ? "success" : "error", title: response.message });
    if (response.ok) router.push(`/buyers/${buyerId}`);
  }
  if (status === "converted" && matchedBuyerId) {
    return <a className="btn btn-primary" href={`/buyers/${matchedBuyerId}`}><ArrowRightLeft className="h-4 w-4" />Mở Buyer đã liên kết</a>;
  }
  return (
    <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
      <div>
        <h2 className="text-[13px] font-bold text-brand-900">Chuyển prospect thành Buyer</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-brand-800">Chỉ chuyển khi đã xác nhận nhu cầu sourcing thực tế. Hệ thống so email hoặc LinkedIn chính xác trước khi tạo Buyer mới.</p>
      </div>
      {matchCandidates.length > 0 && status !== "converted" && (
        <div className="space-y-2 rounded-lg bg-white p-3">
          <p className="text-[12px] font-semibold text-amber-800">Có Buyer cùng công ty. Có thể liên kết để tránh tạo hồ sơ công ty trùng:</p>
          {matchCandidates.map((buyer) => (
            <div key={buyer.id} className="flex items-center justify-between gap-3 text-[12px]">
              <div className="min-w-0">
                <a href={`/buyers/${buyer.id}`} className="truncate font-semibold text-brand-700 hover:underline">{buyer.company}</a>
                <p className="truncate text-[11px] text-ink-500">{buyer.contactName || "Chưa có người liên hệ"}{buyer.email ? ` · ${buyer.email}` : ""}</p>
              </div>
              <Button variant="ghost" disabled={busy || status !== "qualified"} onClick={() => void link(buyer.id)}>{status === "qualified" ? "Liên kết" : "Sau khi đủ điều kiện"}</Button>
            </div>
          ))}
        </div>
      )}
      <Button disabled={busy || status !== "qualified"} onClick={() => void convert()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
        {status === "qualified" ? "Tạo hoặc ghép Buyer" : "Đánh dấu Đủ điều kiện trước"}
      </Button>
    </div>
  );
}
