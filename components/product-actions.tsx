"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteProductAction } from "@/app/actions";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

export function DeleteProductButton({
  productId,
  name,
  supplierId,
}: {
  productId: string;
  name: string;
  supplierId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Xoá hồ sơ sản phẩm "${name}"?`)) return;
    setBusy(true);
    const res = await deleteProductAction(productId);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) {
      router.push(`/suppliers/${supplierId}`);
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
