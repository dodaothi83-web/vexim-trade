"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface PublicSessionState {
  buyerEmail: string | null;
  buyerCompanyName: string | null;
  oneTapClientId: string | null;
  showOneTap: boolean;
}

const GUEST: PublicSessionState = { buyerEmail: null, buyerCompanyName: null, oneTapClientId: null, showOneTap: false };

interface PublicSessionContextValue {
  state: PublicSessionState;
  /** Gọi lại /api/public/session (vd: sau khi Google One Tap đăng nhập thành công — không biết
   *  trước email nên không thể cập nhật lạc quan, phải hỏi lại máy chủ). */
  refresh: () => void;
  /** Cập nhật lạc quan ngay khi biết chắc kết quả phía client (đăng nhập bằng mã email — đã có
   *  email từ chính phản hồi xác thực), không cần chờ vòng gọi API thêm. */
  setSignedIn: (email: string) => void;
  /** Cập nhật lạc quan khi người dùng bấm đăng xuất — luôn thành công, không cần chờ máy chủ. */
  setSignedOut: () => void;
}

const Context = createContext<PublicSessionContextValue | null>(null);

/**
 * Nguồn trạng thái đăng nhập người mua DÙNG CHUNG cho toàn bộ cây trang công khai (header,
 * gợi ý Google One Tap, danh sách đã lưu, hộp thoại đăng nhập nhanh).
 *
 * Trước đây (khi layout còn render động) mỗi lần đổi route, layout tự tính lại buyerSession
 * từ cookie và truyền xuống như prop — tự nhiên "làm mới" theo mỗi request. Giờ layout render
 * tĩnh/ISR nên không còn cơ chế đó; nếu mỗi nơi (header, saved-products...) tự gọi
 * /api/public/session độc lập, chúng sẽ không đồng bộ với nhau khi người dùng đăng nhập/đăng
 * xuất mà KHÔNG điều hướng sang trang khác (vd: đăng nhập qua hộp thoại nhanh ngay trên trang
 * sản phẩm). Provider này gọi API đúng một lần khi mount, rồi để `setSignedIn`/`setSignedOut`/
 * `refresh` cập nhật NGAY LẬP TỨC cho mọi nơi đang dùng usePublicSession() cùng lúc.
 */
export function PublicSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PublicSessionState>(GUEST);
  const active = useRef(true);
  useEffect(() => () => { active.current = false; }, []);

  const refresh = useCallback(() => {
    fetch("/api/public/session", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Partial<PublicSessionState> | null) => {
        if (!active.current || !data) return;
        setState({
          buyerEmail: data.buyerEmail ?? null,
          buyerCompanyName: data.buyerCompanyName ?? null,
          oneTapClientId: data.oneTapClientId ?? null,
          showOneTap: Boolean(data.showOneTap),
        });
      })
      .catch(() => { /* giữ trạng thái hiện có — không chặn trang vì một lỗi mạng nhỏ */ });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setSignedIn = useCallback((email: string) => {
    setState((previous) => ({ ...previous, buyerEmail: email, showOneTap: false }));
  }, []);

  const setSignedOut = useCallback(() => setState(GUEST), []);

  return <Context.Provider value={{ state, refresh, setSignedIn, setSignedOut }}>{children}</Context.Provider>;
}

/** Trạng thái hiện tại — dùng khi chỉ cần đọc (header, one-tap gate, saved-products). */
export function usePublicSession(): PublicSessionState {
  const context = useContext(Context);
  return context ? context.state : GUEST;
}

/** Hành động cập nhật trạng thái — dùng ở nơi vừa đăng nhập/đăng xuất thành công. */
export function usePublicSessionActions(): Pick<PublicSessionContextValue, "refresh" | "setSignedIn" | "setSignedOut"> {
  const context = useContext(Context);
  return context ?? { refresh: () => {}, setSignedIn: () => {}, setSignedOut: () => {} };
}
