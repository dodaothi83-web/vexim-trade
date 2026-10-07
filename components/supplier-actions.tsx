"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteSupplierAction } from "@/app/actions";
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
      router.push("/suppliers");
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
