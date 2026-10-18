"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteSupplierAction } from "@/app/actions";
import { decideSupplierPublicationAction } from "@/app/crm/suppliers/[slug]/publication-actions";
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
      ? `\n\nNCC này đang gắn với ${linked} đơn — các đơn đó sẽ trở về trạng thái "Chưa chọn NCC".`
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

/** Explicit, status-only public visibility decision (never saves profile edits). */
export function SupplierPublicationControls({ supplierId, status }: { supplierId: string; status: SupplierStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const choices = nextStatusOptions(status).filter((next) =>
    next === "published" || (status === "published" && (next === "suspended" || next === "archived")));
  async function decide(next: SupplierStatus) {
    const text = next === "published"
      ? "Công khai hồ sơ NCC? Xác minh giấy tờ chưa được duyệt sẽ vẫn hiển thị Chưa xác minh."
      : `Chuyển hồ sơ sang ${next === "suspended" ? "tạm ẩn" : "lưu trữ"}?`;
    if (!window.confirm(text)) return;
    setBusy(true);
    try {
      const res = await decideSupplierPublicationAction(supplierId, next);
      toast.push({ kind: res.ok ? "success" : "error", title: res.message });
      if (res.ok) router.refresh();
    } catch {
      toast.push({ kind: "error", title: "Không kết nối được máy chủ. Vui lòng thử lại." });
    } finally {
      setBusy(false);
    }
  }
  if (!choices.length) return null;
  return <div className="flex flex-wrap gap-2" aria-label="Quyết định công khai NCC">
    {choices.map((next) => <Button key={next} variant={next === "published" ? "primary" : "soft"} disabled={busy} onClick={() => void decide(next)}>
      {next === "published" ? "Công khai hồ sơ" : next === "suspended" ? "Tạm ẩn khỏi web" : "Lưu trữ hồ sơ"}
    </Button>)}
  </div>;
}
