"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Send, X } from "lucide-react";

/**
 * Widget WhatsApp nổi trên các trang công khai.
 *
 * WhatsApp không cho nhúng khung hội thoại thật vào website. Widget này tự
 * mở một hộp chat nhỏ để buyer gõ tin nhắn đầu tiên ngay trên trang; khi bấm
 * gửi, trình duyệt mở WhatsApp với nội dung đã soạn sẵn cho số công ty
 * 0373 685 634. Nếu buyer đóng hộp chat, lựa chọn chỉ ghi trong phiên tab
 * hiện tại để không tự bật lại gây phiền.
 */
const WHATSAPP_NUMBER = "84373685634";
const DEFAULT_MESSAGE = "Hi Vexim Trade, I would like to ask about sourcing products from Vietnam.";
const DISMISSED_KEY = "vexim:whatsapp-widget-dismissed";

const QUICK_MESSAGES = [
  { label: "Request a quote", message: "Hi Vexim Trade, I would like to request a quote." },
  { label: "Find a supplier", message: "Hi Vexim Trade, I am looking for a Vietnamese supplier." },
  { label: "Ask about a product", message: "Hi Vexim Trade, I would like to ask about a product." },
] as const;

function whatsAppUrl(message: string): string {
  const text = message.trim() || DEFAULT_MESSAGE;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

export function WhatsAppChatButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (dismissed) return;
    const timer = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(timer);
  }, []);

  function close() {
    setOpen(false);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private browsing can block storage; the button still works normally.
    }
  }

  function toggle() {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    try {
      window.sessionStorage.removeItem(DISMISSED_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.open(whatsAppUrl(message), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <section
          id="vexim-whatsapp-panel"
          aria-label="WhatsApp chat with Vexim Trade"
          className="w-[calc(100vw-2.5rem)] max-w-[360px] overflow-hidden rounded-2xl bg-white shadow-2xl shadow-ink-950/25 ring-1 ring-ink-950/10"
        >
          <div className="flex items-start gap-3 bg-[#075E54] px-4 py-3.5 text-white">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
              <WhatsAppGlyph className="h-5 w-5" />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#25D366] ring-2 ring-[#075E54]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight">Vexim Trade</p>
              <p className="mt-0.5 text-xs leading-tight text-white/75">Typically replies within one business day</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close WhatsApp chat"
              className="rounded-full p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
          </div>

          <div className="bg-[#ECE5DD] px-4 py-4">
            <div className="max-w-[88%] rounded-xl rounded-tl-sm bg-white px-3.5 py-3 shadow-sm">
              <p className="text-[13.5px] leading-relaxed text-ink-800">
                Hi, are you looking to source products from Vietnam? Send us a message and our team will help you check suitable suppliers and prices.
              </p>
              <p className="mt-1 text-right text-[10.5px] font-medium text-ink-400">Vexim Trade</p>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Suggested messages">
              {QUICK_MESSAGES.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setMessage(item.message)}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#075E54] shadow-sm ring-1 ring-black/5 transition hover:bg-[#E7FFDB] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54]"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={submit} className="flex items-center gap-2 border-t border-ink-100 bg-white p-3 pb-2">
            <label htmlFor="vexim-whatsapp-message" className="sr-only">Type your message</label>
            <input
              id="vexim-whatsapp-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Type your message"
              className="min-w-0 flex-1 rounded-full border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/25"
            />
            <button
              type="submit"
              aria-label="Send message on WhatsApp"
              title="Send message on WhatsApp"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:bg-[#1eb85a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
            >
              <Send className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
          </form>
          <p className="bg-white px-3 pb-3 text-[11px] leading-relaxed text-ink-500">Pressing send opens WhatsApp with your message ready.</p>
        </section>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="vexim-whatsapp-panel"
        aria-label={open ? "Close WhatsApp chat" : "Chat with Vexim Trade on WhatsApp"}
        title={open ? "Close WhatsApp chat" : "Chat with Vexim Trade on WhatsApp"}
        className="inline-flex items-center gap-2 rounded-full bg-[#25D366] py-3 pl-3.5 pr-4 text-white shadow-lg shadow-black/25 ring-1 ring-black/10 transition hover:bg-[#1eb85a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
      >
        {open ? <X className="h-6 w-6 shrink-0" aria-hidden="true" /> : <WhatsAppGlyph className="h-6 w-6 shrink-0" />}
        <span className="hidden text-[13.5px] font-semibold leading-none sm:inline">{open ? "Close" : "Chat with us"}</span>
      </button>
    </div>
  );
}
