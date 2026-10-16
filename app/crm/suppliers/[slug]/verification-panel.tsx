import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  MapPin,
  Paperclip,
  Plus,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import type { AppUser, MediaAsset, Verification } from "@/lib/types";
import { L1_DOC_ITEMS, L2_VISIT_ITEMS } from "@/lib/types";
import { Badge, Card, EmptyState, formatDate } from "@/components/ui";
import { MediaManager } from "@/components/media-manager";
import {
  approveVerificationAction,
  startVerificationAction,
  updateVerificationChecklistAction,
} from "./verification-actions";

const STATUS_LABEL: Record<Verification["status"], { label: string; badge: string }> = {
  scheduled:   { label: "Đã lên lịch",   badge: "bg-slate-100 text-slate-700 ring-slate-200" },
  in_progress: { label: "Đang kiểm",     badge: "bg-sky-50 text-sky-800 ring-sky-200" },
  submitted:   { label: "Chờ duyệt",     badge: "bg-amber-50 text-amber-800 ring-amber-200" },
  approved:    { label: "Đã duyệt",      badge: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  returned:    { label: "Trả lại",       badge: "bg-rose-50 text-rose-800 ring-rose-200" },
};

interface Props {
  supplierId: string;
  verifications: Verification[];
  verificationMedia: Record<string, MediaAsset[]>;
  users: AppUser[];
  currentUserId: string | null;
  canInspect: boolean;
  canApprove: boolean;
  currentLevel: number;
}

export function VerificationPanel({
  supplierId, verifications, verificationMedia, users, currentUserId, canInspect, canApprove, currentLevel,
}: Props) {
  const sorted = [...verifications].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const levelNames: Record<number, string> = {
    0: "Chưa xác minh", 1: "L1 — Đã kiểm giấy tờ", 2: "L2 — Đã thăm nhà máy", 3: "L3 — Đã có đơn xuất thành công",
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 border-b border-ink-200 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
            <ShieldCheck className="h-4 w-4 text-emerald-700" /> Xác minh nhà cung cấp
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Cấp hiện tại:{" "}
            <Badge className="inline-flex bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              {levelNames[currentLevel] ?? `L${currentLevel}`}
            </Badge>
            {" · "}L1 = giấy tờ, L2 = thăm nhà máy, L3 = đã giao đơn thành công.
          </p>
        </div>
        {canInspect && currentLevel < 2 && (
          <form action={(fd) => { void startVerificationAction(fd); }} className="flex gap-2">
            <input type="hidden" name="supplierId" value={supplierId} />
            {currentLevel < 1 && (
              <button name="targetLevel" value="1" className="btn btn-primary btn-sm">
                <Plus className="h-3.5 w-3.5" /> Bắt đầu L1
              </button>
            )}
            {currentLevel >= 1 && (
              <button name="targetLevel" value="2" className="btn btn-primary btn-sm">
                <Plus className="h-3.5 w-3.5" /> Lên lịch L2
              </button>
            )}
          </form>
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<FileCheck2 className="h-5 w-5" />}
          title="Chưa có đợt xác minh"
          sub={canInspect ? "Bắt đầu L1 (kiểm giấy tờ doanh nghiệp) trước — các tệp giấy tờ tải lên ở Media được dùng để kiểm." : "Bạn không có quyền tạo đợt xác minh."}
        />
      ) : (
        <ul className="divide-y divide-ink-100">
          {sorted.map((v) => (
            <VerificationItem
              key={v.id}
              v={v}
              media={verificationMedia[v.id] ?? []}
              users={users}
              currentUserId={currentUserId}
              canInspect={canInspect}
              canApprove={canApprove}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function VerificationItem({
  v, media, users, currentUserId, canInspect, canApprove,
}: { v: Verification; media: MediaAsset[] } & Pick<Props, "users" | "currentUserId" | "canInspect" | "canApprove">) {
  const items = v.target_level === 1 ? L1_DOC_ITEMS : L2_VISIT_ITEMS;
  const meta = STATUS_LABEL[v.status];
  const inspector = users.find((u) => u.id === v.inspector_id);
  const isMine = currentUserId && v.inspector_id === currentUserId;
  const completedCount = items.filter((it) => v.checklist[it.key] === true).length;
  const totalCount = items.length;
  const canEdit = canInspect && (isMine || v.status !== "approved") && v.status !== "approved";

  return (
    <li id={`verification-${v.id}`} className="px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={meta.badge}>{meta.label}</Badge>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11.5px] font-semibold text-brand-700 ring-1 ring-brand-200">
          L{v.target_level} {v.target_level === 1 ? "Documents" : "Factory visit"}
        </span>
        <span className="text-[12px] text-ink-500">{completedCount}/{totalCount} mục</span>
        {v.visit_date && (
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-500">
            <CalendarClock className="h-3 w-3" /> {formatDate(v.visit_date)}
          </span>
        )}
        {v.visit_address && (
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-500">
            <MapPin className="h-3 w-3" /> {v.visit_address}
          </span>
        )}
        <span className="ml-auto text-[11.5px] text-ink-400">
          {inspector?.name ?? inspector?.email ?? "chưa phân công"}
        </span>
      </div>

      {v.status === "returned" && v.return_reason && (
        <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800 ring-1 ring-rose-200">
          <strong>Lý do trả:</strong> {v.return_reason}
        </div>
      )}

      {canEdit ? (
        <form
          action={(fd) => {
            void (v.status === "submitted" && canApprove ? approveVerificationAction(fd) : updateVerificationChecklistAction(fd));
          }}
          className="mt-3 space-y-3"
        >
          <input type="hidden" name="id" value={v.id} />
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-400">
                <th className="w-1/2 py-1.5 pr-3 font-semibold">Mục kiểm</th>
                <th className="w-32 py-1.5 pr-3 font-semibold">Kết quả</th>
                <th className="py-1.5 font-semibold">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {items.map((it) => {
                const val = v.checklist[it.key];
                return (
                  <tr key={it.key}>
                    <td className="py-2 pr-3 text-ink-700">{it.label}</td>
                    <td className="py-2 pr-3">
                      <select
                        name={`check:${it.key}`}
                        defaultValue={val === true ? "yes" : val === false ? "no" : ""}
                        className="input py-1 text-[12px]"
                      >
                        <option value="">— Chưa kiểm —</option>
                        <option value="yes">Đạt</option>
                        <option value="no">Không đạt</option>
                      </select>
                    </td>
                    <td className="py-2">
                      <input
                        type="text"
                        name={`note:${it.key}`}
                        defaultValue={v.checklist_notes[it.key] ?? ""}
                        className="input py-1 text-[12px]"
                        placeholder="tên giấy / ngày / mã…"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {v.target_level === 2 && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-ink-700">Ngày thăm</span>
                <input type="date" name="visit_date" defaultValue={v.visit_date ?? ""} className="input" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-ink-700">Địa chỉ / nhà máy</span>
                <input type="text" name="visit_address" defaultValue={v.visit_address ?? ""} className="input" placeholder="KCN X, Bình Phước" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-ink-700">GPS lat</span>
                <input type="text" name="visit_lat" defaultValue={v.visit_lat ?? ""} className="input" placeholder="11.554" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-ink-700">GPS lng</span>
                <input type="text" name="visit_lng" defaultValue={v.visit_lng ?? ""} className="input" placeholder="106.892" />
              </label>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-ink-700">Ghi chú nội bộ</span>
            <textarea name="internal_notes" rows={2} defaultValue={v.internal_notes ?? ""} className="input resize-y" placeholder="Những điểm cần lưu ý, rủi ro, câu hỏi cho NCC…" />
          </label>

          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-ink-700">Tóm tắt công khai (tiếng Anh, sẽ hiện trên trang supplier)</span>
            <textarea name="public_summary_en" rows={2} defaultValue={(v.public_summary_i18n as Record<string,string>).en ?? ""} className="input resize-y" placeholder="e.g. Business registration and HACCP certs verified on 14 Oct 2026." />
          </label>

          <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
            <select name="status" defaultValue={v.status} className="input py-1.5 text-[12.5px]">
              <option value="in_progress">Đang kiểm</option>
              <option value="submitted">Nộp duyệt</option>
              <option value="returned">Trả lại (cần bổ sung)</option>
            </select>
            {v.status === "returned" && (
              <input type="text" name="return_reason" defaultValue={v.return_reason ?? ""} className="input flex-1 py-1.5 text-[12.5px]" placeholder="Lý do trả hồ sơ…" />
            )}
            <button type="submit" className="btn btn-primary btn-sm ml-auto">Lưu</button>
            {canApprove && v.status === "submitted" && (
              <button
                formAction={(fd) => { void approveVerificationAction(fd); }}
                type="submit"
                className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt
              </button>
            )}
          </div>
          <p className="text-[11.5px] text-ink-400">
            Tệp giấy tờ / ảnh thăm nhà máy tải lên từ phần bên dưới sẽ được gắn với riêng đợt xác minh này (không hiện trong gallery công khai).
          </p>
        </form>
      ) : (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {items.map((it) => {
            const val = v.checklist[it.key];
            return (
              <li key={it.key} className="flex items-start gap-2 text-[13px] text-ink-700">
                {val === true ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" /> :
                 val === false ? <XCircle className="mt-0.5 h-4 w-4 text-rose-600" /> :
                 <span className="mt-1 h-2 w-2 rounded-full bg-ink-300" />}
                <span>{it.label}</span>
              </li>
            );
          })}
        </ul>
      )}

      {canInspect ? (
        <div className="mt-4 rounded-md border border-ink-200 bg-ink-50/50 p-3">
          <p className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-700">
            <Paperclip className="h-3.5 w-3.5" /> Tệp đính kèm đợt xác minh này
          </p>
          <MediaManager
            ownerType="verification"
            ownerId={v.id}
            items={media}
            allowInternal={true}
            note="Ảnh/giấy tờ chỉ nội bộ — dùng để đối chiếu khi duyệt."
          />
        </div>
      ) : media.length > 0 ? (
        <p className="mt-3 text-[12px] text-ink-500">
          <Paperclip className="mr-1 inline h-3 w-3" /> {media.length} tệp đính kèm (chỉ nội bộ).
        </p>
      ) : null}

      <div className="mt-3 text-[12px] text-ink-500">
        Tạo {formatDate(v.created_at)}
        {v.approved_at ? ` · đã duyệt ${formatDate(v.approved_at)}` : ""}
      </div>
    </li>
  );
}
