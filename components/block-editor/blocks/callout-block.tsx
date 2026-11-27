"use client"

import { Textarea } from "@/components/editor-ui/textarea"
import type { CalloutData, CalloutTone } from "../types"

export const CALLOUT_TONES: Array<{ value: CalloutTone; label: string; className: string }> = [
  { value: "note", label: "Lưu ý", className: "border-sky-200 bg-sky-50 text-sky-950" },
  { value: "tip", label: "Mẹo", className: "border-emerald-200 bg-emerald-50 text-emerald-950" },
  { value: "warning", label: "Cảnh báo", className: "border-amber-300 bg-amber-50 text-amber-950" },
]

/** Hộp nổi bật cho điều cần chú ý; chữ thuần để trang hiển thị luôn an toàn và gọn. */
export function CalloutBlock({ data, onChange }: { data: CalloutData; onChange: (data: Partial<CalloutData>) => void }) {
  const tone = CALLOUT_TONES.find((item) => item.value === data.tone) ?? CALLOUT_TONES[0]
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${tone.className}`} onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Loại hộp">
        {CALLOUT_TONES.map((item) => (
          <button key={item.value} type="button" role="radio" aria-checked={item.value === tone.value}
            onClick={() => onChange({ tone: item.value })}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${item.value === tone.value ? "border-current bg-white" : "border-transparent opacity-70 hover:opacity-100"}`}>
            {item.label}
          </button>
        ))}
      </div>
      <Textarea
        value={data.text ?? ""}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={3}
        placeholder="Nội dung cần nhà cung cấp chú ý"
        aria-label={`Nội dung hộp ${tone.label}`}
        className="bg-white/80"
      />
    </div>
  )
}
