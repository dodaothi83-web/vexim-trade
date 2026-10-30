"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  lines?: string[];
}

interface ToastApi {
  push: (t: { kind?: ToastKind; title: string; lines?: string[] }) => void;
}

const ToastCtx = createContext<ToastApi>({ push: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

const STYLES: Record<ToastKind, { bar: string; icon: ReactNode }> = {
  success: {
    bar: "bg-emerald-500",
    icon: <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />,
  },
  error: {
    bar: "bg-red-500",
    icon: <TriangleAlert className="h-4.5 w-4.5 text-red-600" />,
  },
  info: { bar: "bg-sky-500", icon: <Info className="h-4.5 w-4.5 text-sky-600" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<ToastApi["push"]>(
    ({ kind = "info", title, lines }) => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev.slice(-3), { id, kind, title, lines }]);
      const ttl = lines && lines.length > 1 ? 8000 : 4500;
      setTimeout(() => remove(id), ttl);
    },
    [remove],
  );

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className="animate-toast pointer-events-auto flex overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop"
          >
            <div className={`w-1 shrink-0 ${STYLES[t.kind].bar}`} />
            <div className="flex-1 px-3.5 py-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">{STYLES[t.kind].icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{t.title}</p>
                  {t.lines && t.lines.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {t.lines.map((l, i) => (
                        <li
                          key={i}
                          className="text-xs leading-relaxed text-ink-600"
                        >
                          {l}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="shrink-0 rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
                  aria-label="Đóng"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
