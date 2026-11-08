"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BuyerGoogleOneTap } from "@/components/buyer-google-one-tap";
import { usePublicSession } from "@/lib/buyer/use-public-session";

/**
 * Trước đây app/(public)/layout.tsx quyết định có hiện Google One Tap hay không NGAY lúc
 * render (buyerSession + hasOneTapSession(), cả hai đều đọc cookie) — một trong các lý do
 * buộc layout phải force-dynamic. Giờ quyết định đó chuyển xuống đây, sau khi trang đã
 * hiển thị tĩnh/ISR, qua /api/public/session (xem usePublicSession). BuyerGoogleOneTap vốn
 * đã tự trì hoãn ~1.5s trước khi thực sự hiện prompt, nên thêm một lần gọi API nhẹ ở đây
 * không tạo khác biệt cảm nhận được.
 *
 * useSearchParams() phải nằm trong <Suspense> (yêu cầu của Next.js) — fallback null vì
 * một tiện ích vốn chỉ hiện sau ~1.5s không cần xuất hiện trong vài mili-giây đầu.
 */
export function BuyerGoogleOneTapGate() {
  return (
    <Suspense fallback={null}>
      <BuyerGoogleOneTapGateInner />
    </Suspense>
  );
}

function BuyerGoogleOneTapGateInner() {
  const { showOneTap, oneTapClientId } = usePublicSession();
  const isVi = useSearchParams()?.get("lang") === "vi";
  if (!showOneTap || !oneTapClientId) return null;
  return <BuyerGoogleOneTap clientId={oneTapClientId} isVi={isVi} />;
}
