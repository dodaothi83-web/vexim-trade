"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { retrySupabaseAction } from "@/app/actions";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

/** Nút "Thử kết nối lại" ở trang Cài đặt khi Supabase đang mất kết nối. */
export function RetrySupabaseButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    const res = await retrySupabaseAction();
    toast.push({
      kind: res.ok ? "success" : "error",
      title: res.message,
      lines: res.details,
    });
    router.refresh();
    setBusy(false);
  }

  return (
    <Button variant="soft" size="sm" disabled={busy} onClick={() => void retry()}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      {busy ? "Đang kiểm tra…" : "Thử kết nối lại"}
    </Button>
  );
}
