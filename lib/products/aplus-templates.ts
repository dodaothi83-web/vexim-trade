/**
 * Bộ mẫu A+ theo ngành hàng (bản duyệt docs/aplus-editor, màn 3): bấm một lần là có sẵn bộ khung
 * khối theo thứ tự gợi ý. Không điền sẵn nội dung giả: chữ để trống, mỗi khối mang mã gợi ý
 * (`hint` = "<mẫu>:<thứ tự>") để trình soạn hiện lời gợi ý nên viết gì (lib/i18n/portal/aplus.ts).
 *
 * Tệp thuần, script kiểm tra nạp thẳng bằng Node.
 */
import type { AplusHighlightIcon, AplusModule, AplusModuleType } from "./aplus.ts";

export const APLUS_TEMPLATE_IDS = ["cashew", "coffee", "pepper", "cinnamon", "general"] as const;
export type AplusTemplateId = (typeof APLUS_TEMPLATE_IDS)[number];

type Skeleton = { type: AplusModuleType; items?: number; icons?: AplusHighlightIcon[] };

const B2B_PACK: Skeleton = { type: "packing", items: 5 };
const FAQ: Skeleton = { type: "faq", items: 3 };

export const APLUS_TEMPLATES: Record<AplusTemplateId, Skeleton[]> = {
  cashew: [
    { type: "hero" },
    { type: "highlights", items: 4, icons: ["inspection", "capacity", "minimum-order", "samples"] },
    { type: "steps", items: 5 },
    { type: "image_text" },
    B2B_PACK,
    FAQ,
  ],
  coffee: [
    { type: "hero" },
    { type: "highlights", items: 4, icons: ["markets", "inspection", "capacity", "samples"] },
    { type: "image_text" },
    { type: "steps", items: 5 },
    B2B_PACK,
    FAQ,
  ],
  pepper: [
    { type: "hero" },
    { type: "highlights", items: 4, icons: ["inspection", "document", "minimum-order", "samples"] },
    { type: "steps", items: 4 },
    B2B_PACK,
    FAQ,
  ],
  cinnamon: [
    { type: "hero" },
    { type: "highlights", items: 4, icons: ["inspection", "capacity", "oem", "samples"] },
    { type: "steps", items: 4 },
    B2B_PACK,
    FAQ,
  ],
  general: [
    { type: "hero" },
    { type: "highlights", items: 3, icons: ["inspection", "capacity", "samples"] },
    { type: "image_text" },
    FAQ,
  ],
};

/** Khối trống của một loại (thêm từ thư viện khối hoặc từ bộ mẫu). */
export function emptyAplusModule(type: AplusModuleType, id: string, options: { items?: number; icons?: AplusHighlightIcon[]; hint?: string } = {}): AplusModule {
  const n = (fallback: number) => options.items ?? fallback;
  const hint = options.hint ? { hint: options.hint } : {};
  switch (type) {
    case "hero": return { id, type, image_path: "", alt: "", eyebrow: "", headline: "", sub: "", ...hint };
    case "highlights": return { id, type, items: Array.from({ length: n(4) }, (_, i) => ({ icon: options.icons?.[i] ?? "inspection", title: "", text: "" })), ...hint };
    case "steps": return { id, type, items: Array.from({ length: n(4) }, () => ({ image_path: "", alt: "", title: "", text: "" })), ...hint };
    case "packing": return { id, type, image_path: "", alt: "", title: "", rows: Array.from({ length: n(5) }, () => ({ label: "", value: "" })), ...hint };
    case "faq": return { id, type, items: Array.from({ length: n(3) }, () => ({ q: "", a: "" })), ...hint };
    case "image": return { id, type, image_path: "", alt: "", caption: "", ...hint };
    case "image_text": return { id, type, image_path: "", alt: "", title: "", body: "", image_side: "left", ...hint };
    case "gallery": return { id, type, items: [{ image_path: "", alt: "", caption: "" }, { image_path: "", alt: "", caption: "" }], ...hint };
    case "text": return { id, type, title: "", body: "", ...hint };
    case "video": return { id, type, video_uid: "", title: "", ...hint };
  }
}

/** Dựng bộ khung khối của một bộ mẫu; `newId` tạo mã khối. */
export function buildAplusTemplate(template: AplusTemplateId, newId: () => string): AplusModule[] {
  return APLUS_TEMPLATES[template].map((skeleton, index) =>
    emptyAplusModule(skeleton.type, newId(), { items: skeleton.items, icons: skeleton.icons, hint: `${template}:${index}` }));
}
