"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type DirtySection = "product" | "source" | "translation";

type ProductEditWorkspaceValue = {
  dirty: boolean;
  sourceDirty: boolean;
  setSectionDirty: (section: DirtySection, dirty: boolean) => void;
};

const ProductEditWorkspaceContext = createContext<ProductEditWorkspaceValue>({
  dirty: false,
  sourceDirty: false,
  setSectionDirty: () => undefined,
});

/**
 * Trạng thái chưa lưu dùng chung cho form, bản dịch và quyết định duyệt.
 * Media vẫn lưu ngay nên không nằm trong dirty state này.
 */
export function ProductEditWorkspace({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<Partial<Record<DirtySection, boolean>>>({});
  const setSectionDirty = useCallback((section: DirtySection, dirty: boolean) => {
    setSections((current) => current[section] === dirty ? current : { ...current, [section]: dirty });
  }, []);
  const dirty = Object.values(sections).some(Boolean);
  const sourceDirty = !!sections.source;
  const value = useMemo(() => ({ dirty, sourceDirty, setSectionDirty }), [dirty, sourceDirty, setSectionDirty]);

  // Cảnh báo cả khi đóng/tải lại tab và khi đi theo một link nội bộ.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm("Bạn có thay đổi chưa lưu. Rồi khỏi trang sẽ làm mất nội dung đang nhập. Vẫn rồi?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return <ProductEditWorkspaceContext.Provider value={value}>{children}</ProductEditWorkspaceContext.Provider>;
}

export function useProductEditWorkspace() {
  return useContext(ProductEditWorkspaceContext);
}

/** Đăng ký từng vùng để unmount không giữ lại trạng thái chưa lưu cũ. */
export function useRegisterProductEditDirty(section: DirtySection, dirty: boolean) {
  const { setSectionDirty } = useProductEditWorkspace();
  useEffect(() => {
    setSectionDirty(section, dirty);
    return () => setSectionDirty(section, false);
  }, [section, dirty, setSectionDirty]);
}
