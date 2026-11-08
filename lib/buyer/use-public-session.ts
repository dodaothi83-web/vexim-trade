"use client";

import { useEffect, useState } from "react";

export interface PublicSessionState {
  buyerEmail: string | null;
  buyerCompanyName: string | null;
  oneTapClientId: string | null;
  showOneTap: boolean;
}

const GUEST: PublicSessionState = { buyerEmail: null, buyerCompanyName: null, oneTapClientId: null, showOneTap: false };

/**
 * Trạng thái cá nhân hoá công khai (phiên người mua, gợi ý Google One Tap), tự lấy từ
 * /api/public/session SAU khi component đã mount.
 *
 * Mặc định trả về "khách" (chưa đăng nhập) cho tới khi fetch xong — khớp với HTML tĩnh/ISR
 * do máy chủ gửi xuống (xem app/(public)/layout.tsx). Người mua đã đăng nhập sẽ thấy đúng
 * trạng thái của mình sau một nhịp rất ngắn (một lần gọi API nhẹ), thay vì phải chờ máy chủ
 * render động mỗi request.
 */
export function usePublicSession(): PublicSessionState {
  const [state, setState] = useState<PublicSessionState>(GUEST);

  useEffect(() => {
    let active = true;
    fetch("/api/public/session", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Partial<PublicSessionState> | null) => {
        if (!active || !data) return;
        setState({
          buyerEmail: data.buyerEmail ?? null,
          buyerCompanyName: data.buyerCompanyName ?? null,
          oneTapClientId: data.oneTapClientId ?? null,
          showOneTap: Boolean(data.showOneTap),
        });
      })
      .catch(() => { /* giữ trạng thái khách — không chặn trang vì một lỗi mạng nhỏ */ });
    return () => { active = false; };
  }, []);

  return state;
}
