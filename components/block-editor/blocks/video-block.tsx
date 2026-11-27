"use client"

import { Input } from "@/components/editor-ui/input"
import { youTubeEmbedUrl, youTubeId } from "@/lib/guides/video"
import type { VideoData } from "../types"

/** Dán link YouTube; xem trước ngay để người soạn biết link đúng. */
export function VideoBlock({ data, onChange }: { data: VideoData; onChange: (data: Partial<VideoData>) => void }) {
  const id = youTubeId(data.url)
  return (
    <div className="space-y-2 rounded-xl border border-ink-200 bg-ink-50/40 p-3" onClick={(e) => e.stopPropagation()}>
      <Input
        value={data.url ?? ""}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder="Dán link YouTube, ví dụ https://youtu.be/..."
        aria-label="Link video YouTube"
      />
      {data.url && !id && <p className="text-xs font-semibold text-rose-700">Link chưa đúng. Chỉ nhận link video YouTube.</p>}
      {id && (
        <div className="aspect-video overflow-hidden rounded-lg bg-black">
          <iframe src={youTubeEmbedUrl(id)} title={data.caption || "Video hướng dẫn"} className="h-full w-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />
        </div>
      )}
      <Input
        value={data.caption ?? ""}
        onChange={(e) => onChange({ caption: e.target.value })}
        placeholder="Chú thích video (tuỳ chọn)"
        aria-label="Chú thích video"
      />
    </div>
  )
}
