"use client";

import { useMemo, useState } from "react";
import { FileText, Image as ImageIcon, Loader2, X } from "lucide-react";

import { attachProductMediaAction } from "@/app/mail-attachment-actions";
import type { AttachmentRef } from "@/lib/types";
import { Button, cx } from "@/components/ui";
import { useToast } from "@/components/toast";

export interface ProductFileItem {
  id: string;
  kind: "image" | "catalogue";
  label: string;
  /** 0 = chưa rõ dung lượng */
  size: number;
}

export interface ProductFileGroup {
  productId: string;
  productName: string;
  supplierName: string;
  items: ProductFileItem[];
}

/** Giới hạn đính kèm (đồng bộ với lib/mail/attachments.ts và compose-mail.tsx) */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function ProductFilePicker({
  groups,
  currentCount,
  currentBytes,
  onAttached,
  onClose,
}: {
  groups: ProductFileGroup[];
  currentCount: number;
  currentBytes: number;
  onAttached: (ref: AttachmentRef) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [productId, setProductId] = useState(groups[0]?.productId ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => `${g.productName} ${g.supplierName}`.toLowerCase().includes(q));
  }, [groups, query]);

  const group = groups.find((g) => g.productId === productId) ?? null;

  function toggle(item: ProductFileItem) {
    if (item.size > MAX_FILE_BYTES) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  async function attachSelected() {
    if (!group) return;
    const items = group.items.filter((i) => selected.has(i.id));
    if (!items.length) return;

    let count = currentCount;
    let bytes = currentBytes;
    setBusy(true);
    try {
      for (const item of items) {
        if (count >= MAX_FILES) {
          toast.push({ kind: "error", title: `Chỉ đính kèm được tối đa ${MAX_FILES} tệp mỗi email.` });
          break;
        }
        if (bytes + item.size > MAX_TOTAL_BYTES) {
          toast.push({ kind: "error", title: `Bỏ qua "${item.label}" — vượt quá 10MB tổng dung lượng.` });
          continue;
        }
        const res = await attachProductMediaAction(item.id);
        if (!res.ok) {
          toast.push({ kind: "error", title: res.message });
          continue;
        }
        onAttached(res.ref);
        count += 1;
        bytes += res.ref.size;
      }
      onClose();
    } catch {
      toast.push({ kind: "error", title: "Không đính kèm được tệp — lỗi kết nối." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-[2px]">
      <div className="animate-pop flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900">Đính kèm từ hồ sơ sản phẩm</h3>
            <p className="text-[12px] text-ink-500">Chỉ hiện ảnh và catalogue đã chia sẻ cho buyer, chưa hết hạn.</p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700" aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-500">
            Chưa có sản phẩm nào có ảnh hoặc catalogue chia sẻ cho buyer.
          </p>
        ) : (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Tìm sản phẩm hoặc NCC…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                className="input flex-1"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setSelected(new Set());
                }}
              >
                {filtered.map((g) => (
                  <option key={g.productId} value={g.productId}>
                    {g.productName}
                    {g.supplierName ? ` — ${g.supplierName}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {group && (
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                {group.items.map((item) => {
                  const tooBig = item.size > MAX_FILE_BYTES;
                  const checked = selected.has(item.id);
                  return (
                    <li key={item.id}>
                      <label
                        className={cx(
                          "flex items-center gap-3 px-3 py-2.5 text-[13px]",
                          tooBig ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-ink-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#0f766e]"
                          checked={checked}
                          disabled={tooBig || busy}
                          onChange={() => toggle(item)}
                        />
                        {item.kind === "image" ? (
                          <ImageIcon className="h-4 w-4 text-ink-500" />
                        ) : (
                          <FileText className="h-4 w-4 text-ink-500" />
                        )}
                        <span className="flex-1 truncate font-medium text-ink-800">{item.label}</span>
                        <span className={cx("text-[11.5px]", tooBig ? "text-red-600" : "text-ink-400")}>
                          {tooBig ? "Quá 4MB, không đính kèm được" : formatSize(item.size)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-50 px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            disabled={busy || selected.size === 0 || groups.length === 0}
            onClick={() => void attachSelected()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Đính kèm {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
