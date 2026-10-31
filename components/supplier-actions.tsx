"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteSupplierAction } from "@/app/actions";
import { decideSupplierPreparationAction, decideSupplierPublicationAction } from "@/app/crm/suppliers/[slug]/publication-actions";
import { nextStatusOptions } from "@/lib/supplier";
import type { SupplierStatus } from "@/lib/types";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

export function DeleteSupplierButton({
  supplierId,
  name,
  linked,
}: {
  supplierId: string;
  name: string;
  linked: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const extra = linked
      ? `\n\nNCC này đang gắn với ${linked} đơn — các đơn đó sẽ trở về trạng thái "Chưa chọn nhà cung cấp".`
      : "";
    if (!window.confirm(`Xoá nhà cung cấp "${name}"?${extra}`)) return;
    setBusy(true);
    const res = await deleteSupplierAction(supplierId);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) {
      router.push("/crm/suppliers");
      router.refresh();
    } else {
      setBusy(false);
    }
  }

  return (
    <Button variant="danger" disabled={busy} onClick={() => void remove()}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      Xoá
    </Button>
  );
}

const PREPARATION_TARGETS: SupplierStatus[] = ["draft", "submitted", "in_verification"];
const STATUS_ACTION_LABELS: Partial<Record<SupplierStatus, string>> = {
  draft: "Trả về bản nháp",
  submitted: "Gửi hồ sơ chờ duyệt",
  in_verification: "Chuyển sang kiểm tra thực tế",
  published: "Duyệt & công khai",
  suspended: "Tạm ẩn khỏi web",
  archived: "Lưu trữ hồ sơ",
};

function isPreparationTarget(status: SupplierStatus) {
  return PREPARATION_TARGETS.includes(status);
}

/**
 * Status-only workflow decisions. Preparers can move a profile through the
 * private stages; only publishers can make or withdraw a public profile.
 * Neither action saves profile edits or approves verification evidence.
 */
export function SupplierWorkflowControls({ supplierId, status, canManage, canPublish, autoPublishL1 = false }: {
  supplierId: string;
  status: SupplierStatus;
  canManage: boolean;
  canPublish: boolean;
  autoPublishL1?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const choices = nextStatusOptions(status).filter((next) => {
    if (next === "published" && autoPublishL1) return false;
    if (isPreparationTarget(next)) return canManage;
    return canPublish && (next === "published" || (status === "published" && (next === "suspended" || next === "archived")));
  });

  async function decide(next: SupplierStatus) {
    const preparation = isPreparationTarget(next);
    if (!preparation) {
      const text = next === "published"
        ? "Công khai hồ sơ nhà cung cấp? Xác minh giấy tờ chưa được duyệt sẽ vẫn hiển thị Chưa xác minh."
        : `Chuyển hồ sơ sang ${next === "suspended" ? "tạm ẩn" : "lưu trữ"}?`;
      if (!window.confirm(text)) return;
    }
    setBusy(true);
    try {
      const res = preparation
        ? await decideSupplierPreparationAction(supplierId, next)
        : await decideSupplierPublicationAction(supplierId, next);
      toast.push({ kind: res.ok ? "success" : "error", title: res.message });
      if (res.ok) router.refresh();
    } catch {
      toast.push({ kind: "error", title: "Không kết nối được máy chủ. Vui lòng thử lại." });
    } finally {
      setBusy(false);
    }
  }

  if (!choices.length) return null;
  return <div className="flex flex-wrap gap-2" aria-label="Các bước xử lý hồ sơ nhà cung cấp">
    {choices.map((next) => <Button key={next} variant={next === "published" ? "primary" : "soft"} disabled={busy} onClick={() => void decide(next)}>
      {STATUS_ACTION_LABELS[next] ?? `Chuyển sang ${next}`}
    </Button>)}
  </div>;
}
