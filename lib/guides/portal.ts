import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { normalizeBlocksFromStorage } from "@/lib/blog/blocks-from-storage";
import { guideReadingMinutes, guideStepCount } from "./guide-payload";
import { GUIDE_TOPICS } from "./topics";
import type { SupplierGuide } from "@/lib/types";

/** Chỉ tài khoản nhà cung cấp đọc được hướng dẫn; chưa có hồ sơ doanh nghiệp vẫn đọc được. */
export async function requireGuideReader() {
  const session = await requireSession();
  if (session.role !== "supplier") redirect("/crm/dashboard");
  return session;
}

export type GuideCard = SupplierGuide & { minutes: number; steps: number };

export function toGuideCard(guide: SupplierGuide): GuideCard {
  const blocks = normalizeBlocksFromStorage(guide.content);
  return { ...guide, minutes: guideReadingMinutes(blocks), steps: guideStepCount(blocks) };
}

/** Bài đã xuất bản, nhóm theo chủ đề đúng thứ tự khai báo; chủ đề không còn bài thì bỏ. Lỗi đọc trả null. */
export async function listPublishedGuidesByTopic(options: { keepEmpty?: boolean } = {}): Promise<Array<{ topic: (typeof GUIDE_TOPICS)[number]; guides: GuideCard[] }> | null> {
  let guides: SupplierGuide[];
  try { guides = await getStore().listSupplierGuides({ status: "published" }); }
  catch (error) { console.error("[supplier-guides] portal list", error); return null; }
  return GUIDE_TOPICS.map((topic) => ({
    topic,
    guides: guides.filter((guide) => guide.topic === topic.slug)
      .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "vi"))
      .map(toGuideCard),
  })).filter((group) => options.keepEmpty || group.guides.length > 0);
}

/**
 * Bài đã xuất bản, đọc một lần cho mỗi lượt tải trang (gợi ý theo trang và khối "Bắt đầu" dùng chung).
 * Lỗi đọc (vd chưa có bảng) trả mảng rỗng: gợi ý chỉ ẩn đi, không làm hỏng trang đang dùng.
 */
export const readPublishedGuides = cache(async (): Promise<SupplierGuide[]> => {
  try { return await getStore().listSupplierGuides({ status: "published" }); }
  catch (error) { console.error("[supplier-guides] contextual read", error); return []; }
});

/** Bài của một chủ đề theo thứ tự Vexim đặt. */
export async function guidesForTopic(topic: string): Promise<SupplierGuide[]> {
  return (await readPublishedGuides()).filter((guide) => guide.topic === topic)
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "vi"));
}
