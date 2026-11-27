"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { deleteGuideAction, saveGuideAction } from "@/app/crm/guides/guide-actions";
import { BlockEditor } from "@/components/block-editor/block-editor";
import type { Block } from "@/components/block-editor/types";
import { Button } from "@/components/editor-ui/button";
import { Input } from "@/components/editor-ui/input";
import { Label } from "@/components/editor-ui/label";
import { Textarea } from "@/components/editor-ui/textarea";
import { normalizeBlocksFromStorage } from "@/lib/blog/blocks-from-storage";
import { slugify } from "@/lib/blog/post-payload";
import { GUIDE_EXTRA_BLOCKS, GUIDE_MIN_PUBLISH_CHARS, guideBlocksPlainText, guideReadingMinutes, guideStepCount } from "@/lib/guides/guide-payload";
import { DEFAULT_GUIDE_TOPIC, GUIDE_TOPICS } from "@/lib/guides/topics";
import type { PostStatus, SupplierGuide } from "@/lib/types";

/**
 * Soạn bài hướng dẫn nhà cung cấp bằng đúng trình soạn thảo khối của blog, bật thêm khối
 * video YouTube và hộp Lưu ý. Không có phần SEO, ảnh bìa hay tác giả vì bài không công khai.
 */
export function GuideEditor({ guide }: { guide: SupplierGuide | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [guideId, setGuideId] = useState<string | null>(guide?.id ?? null);
  const [initialBlocks] = useState<Block[]>(() => normalizeBlocksFromStorage(guide?.content));
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [title, setTitle] = useState(guide?.title ?? "");
  const [summary, setSummary] = useState(guide?.summary ?? "");
  const [topic, setTopic] = useState(guide?.topic ?? DEFAULT_GUIDE_TOPIC);
  const [sortOrder, setSortOrder] = useState(String(guide?.sort_order ?? 0));
  const [slug, setSlug] = useState(guide?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(guide));
  const [status, setStatus] = useState<PostStatus>(guide?.status ?? "draft");
  const [savedSlug, setSavedSlug] = useState(guide?.slug ?? "");

  const plainLength = useMemo(() => guideBlocksPlainText(blocks).length, [blocks]);
  const minutes = useMemo(() => guideReadingMinutes(blocks), [blocks]);
  const steps = useMemo(() => guideStepCount(blocks), [blocks]);

  const save = (nextStatus: PostStatus) => {
    setMessage(null);
    if (nextStatus === "published" && plainLength < GUIDE_MIN_PUBLISH_CHARS) {
      setMessage({ kind: "error", text: `Nội dung quá ngắn để xuất bản (cần tối thiểu ${GUIDE_MIN_PUBLISH_CHARS} ký tự)` });
      return;
    }
    startTransition(async () => {
      const result = await saveGuideAction(guideId, {
        title, summary, topic, sort_order: sortOrder, slug: slugTouched ? slug : slugify(title), content: blocks, status: nextStatus,
      });
      if (!result.ok) { setMessage({ kind: "error", text: result.message }); return; }
      setStatus(result.guide.status);
      setSlug(result.guide.slug);
      setSavedSlug(result.guide.slug);
      setMessage({ kind: "ok", text: result.guide.status === "published" ? "Đã xuất bản. Nhà cung cấp thấy bài trong mục Hướng dẫn." : "Đã lưu bản nháp." });
      if (!guideId) { setGuideId(result.guide.id); router.replace(`/crm/guides/${result.guide.id}`); }
    });
  };

  const remove = () => {
    if (!guideId || !window.confirm("Xóa bài hướng dẫn này? Hành động không thể hoàn tác.")) return;
    startTransition(async () => {
      const result = await deleteGuideAction(guideId);
      if (!result.ok) { setMessage({ kind: "error", text: result.message }); return; }
      router.push("/crm/guides");
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/crm/guides" className="text-[13px] font-semibold text-ink-500 hover:text-ink-900">← Danh sách hướng dẫn</Link>
        <div className="flex flex-wrap items-center gap-2">
          {guideId && <Button type="button" variant="outline" onClick={remove} disabled={isPending}>Xóa</Button>}
          <Button type="button" variant="outline" onClick={() => save("draft")} disabled={isPending}>Lưu nháp</Button>
          <Button type="button" onClick={() => save("published")} disabled={isPending}>{status === "published" ? "Cập nhật" : "Xuất bản"}</Button>
        </div>
      </div>

      {message && (
        <p role="status" className={message.kind === "ok"
          ? "rounded-md border border-brand-600/30 bg-brand-600/5 px-3 py-2 text-[13px] text-brand-700"
          : "rounded-md border border-red-600/30 bg-red-600/5 px-3 py-2 text-[13px] text-red-600"}>{message.text}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <section className="card space-y-4 p-5">
            <div>
              <Label htmlFor="guide-title">Tiêu đề</Label>
              <Input id="guide-title" value={title} onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }}
                placeholder="Ví dụ: Cách đăng sản phẩm đầu tiên" className="mt-1 text-lg font-semibold" />
            </div>
            <div>
              <Label htmlFor="guide-summary">Tóm tắt</Label>
              <Textarea id="guide-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className="mt-1"
                placeholder="Một hai câu cho biết bài giúp nhà cung cấp làm được việc gì" />
            </div>
          </section>
          <section className="card p-5">
            <p className="mb-3 text-[12px] text-ink-500">Gõ <strong>/</strong> để chèn khối. Bài hướng dẫn có thêm khối <strong>Video YouTube</strong> và <strong>Hộp Lưu ý / Mẹo</strong>. Dùng danh sách đánh số cho các bước.</p>
            <BlockEditor value={initialBlocks} onChange={setBlocks} extraBlocks={[...GUIDE_EXTRA_BLOCKS]} />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card space-y-4 p-4">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-500">Xuất bản</h2>
            <div>
              <Label htmlFor="guide-topic">Chủ đề</Label>
              <select id="guide-topic" value={topic} onChange={(e) => setTopic(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-ink-300 bg-white px-2 text-[13px]">
                {GUIDE_TOPICS.map((item) => <option key={item.slug} value={item.slug}>{item.label.vi}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="guide-order">Thứ tự trong chủ đề</Label>
              <Input id="guide-order" type="number" min={0} max={999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="mt-1 h-8 text-[12px]" />
              <p className="mt-1 text-[11px] text-ink-500">Số nhỏ hiện trước. Bài cùng số xếp theo tên.</p>
            </div>
            <div>
              <Label htmlFor="guide-slug">Đường dẫn</Label>
              <div className="mt-1 flex items-center gap-1 text-[12px] text-ink-500">
                <span className="shrink-0">/huong-dan/</span>
                <Input id="guide-slug" value={slugTouched ? slug : slugify(title)} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} className="h-8 text-[12px]" />
              </div>
            </div>
            <p className="text-[12px] leading-5 text-ink-500">
              Trạng thái: <strong className="text-ink-900">{status === "published" ? "Đã xuất bản" : "Bản nháp"}</strong><br />
              Khoảng {minutes} phút đọc{steps ? `, ${steps} bước` : ""}. Nội dung {plainLength} ký tự.
            </p>
            {status === "published" && savedSlug && (
              <p className="text-[12px] text-ink-500">Nhà cung cấp xem tại <span className="font-mono text-ink-700">/supplier/portal/huong-dan/{savedSlug}</span></p>
            )}
          </section>
          <section className="card p-4 text-[12px] leading-5 text-ink-600">
            <h2 className="mb-1 text-[13px] font-bold uppercase tracking-wide text-ink-500">Ai thấy bài này</h2>
            Chỉ nhà cung cấp đã đăng nhập, trong mục Hướng dẫn của cổng nhà cung cấp. Bài không lên blog, không vào Google và không gửi cho người mua.
          </section>
        </aside>
      </div>
    </div>
  );
}
