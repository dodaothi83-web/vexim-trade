import type { Block } from "@/components/block-editor/types";
import { stripHtml } from "@/lib/blog/sanitize";

/**
 * Kiểm tra SEO và mức sẵn sàng trả lời cho bài viết blog.
 *
 * Nguyên tắc (theo hướng dẫn hiện hành của Google, không theo các quan niệm cũ):
 *  - Không chấm theo mật độ từ khóa, không có mốc số từ bắt buộc, không dùng meta keywords.
 *  - Độ dài tiêu đề/mô tả ước lượng theo ký tự; Google hiển thị theo pixel nên đây chỉ là gợi ý.
 *  - Từ khóa chỉ kiểm tra VỊ TRÍ (tiêu đề, 100 từ đầu, H2, alt) và cảnh báo khi lặp bất thường.
 *  - Nhóm "answer" dành cho việc trích dẫn trong tổng quan AI: trả lời trực tiếp ở đầu mỗi mục.
 *
 * Kết quả không hứa thứ hạng. Mỗi kiểm tra chỉ là việc nên làm để bài rõ ràng hơn cho người đọc.
 */

export type SeoGroup = "technical" | "answer";
export type SeoStatus = "pass" | "warn" | "fail" | "info";

export interface SeoCheck {
  id: string;
  group: SeoGroup;
  status: SeoStatus;
  label: string;
  detail: string;
}

export interface OtherPostRef {
  id: string;
  title: string;
  slug: string;
  focus_keyword: string | null;
}

export interface SeoInput {
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  slug: string;
  focusKeyword: string;
  featuredImage: string;
  featuredImageAlt: string;
  /** Chiều rộng thật của ảnh bìa (px), null nếu chưa đọc được */
  coverWidth: number | null;
  blocks: Block[];
  /** Bài đã xuất bản hay chưa (kiểm tra độ mới chỉ áp dụng cho bài đã xuất bản) */
  published: boolean;
  updatedAt: string | null;
  currentId: string | null;
  otherPosts: OtherPostRef[];
  /** Mốc thời gian để tính độ mới (mặc định là lúc chạy) */
  now?: Date;
}

export interface SeoReport {
  checks: SeoCheck[];
  technicalScore: number;
  answerScore: number;
  wordCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 180;

/* -------------------------------- tiện ích -------------------------------- */

function plainOf(html: string): string {
  return stripHtml(html ?? "").replace(/\s+/g, " ").trim();
}

function wordsOf(text: string): number {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

/** Chuẩn hoá để so khớp: thường, bỏ dấu tiếng Việt, đ → d. */
export function foldText(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(text: string): Set<string> {
  return new Set(
    foldText(text)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2),
  );
}

/** Độ giống nhau của hai tiêu đề (Jaccard trên các từ). */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokensOf(a);
  const tb = tokensOf(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  ta.forEach((t) => {
    if (tb.has(t)) common++;
  });
  return common / (ta.size + tb.size - common);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function hrefsOf(html: string): string[] {
  const out: string[] = [];
  const re = /<a\s[^>]*href="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html ?? "")) !== null) out.push(m[1]);
  return out;
}

function isExternal(href: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  return !/veximtrade\.com/i.test(href);
}

const OFFICIAL_HOST = /\.gov(\.[a-z]{2})?(\/|$)|(^|\.)fda\.gov|(^|\.)gacc\.|(^|\.)mfds\.|(^|\.)ftc\.gov/i;

const QUESTION_START = [
  "la gi",
  "nhu the nao",
  "bao nhieu",
  "tai sao",
  "khi nao",
  "lam sao",
  "o dau",
  "co the",
  "nen ",
  "ai ",
  "co phai",
  "can gi",
];

export function isQuestionHeading(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  const folded = foldText(t);
  return QUESTION_START.some((prefix) => folded.startsWith(prefix));
}

const STAT_PATTERN =
  /\d+([.,]\d+)?\s?(%|tấn|tan|kg|usd|\$|ngày|ngay|tháng|thang|năm|nam|container|lô|lo|đồng|dong|vnd)/i;

/* ----------------------------- cấu trúc bài ------------------------------ */

interface Section {
  headingLevel: number | null;
  headingText: string;
  headingBlockId: string | null;
  /** Văn bản thuần của các khối nằm trong mục này (không kể heading) */
  texts: string[];
}

interface Analysis {
  sections: Section[];
  headings: { level: number; text: string; blockId: string }[];
  allText: string;
  wordCount: number;
  hasTable: boolean;
  hasList: boolean;
  imageCount: number;
  imagesWithoutAlt: number;
  imageAlts: string[];
  hrefs: string[];
}

function analyzeBlocks(blocks: Block[]): Analysis {
  const sections: Section[] = [{ headingLevel: null, headingText: "", headingBlockId: null, texts: [] }];
  const headings: Analysis["headings"] = [];
  const allTexts: string[] = [];
  const hrefs: string[] = [];
  let hasTable = false;
  let hasList = false;
  let imageCount = 0;
  let imagesWithoutAlt = 0;
  const imageAlts: string[] = [];

  for (const block of blocks ?? []) {
    const data = (block.data ?? {}) as Record<string, unknown>;
    const current = sections[sections.length - 1];

    if (block.type === "heading") {
      const level = Number(data.level ?? 2);
      const text = plainOf(String(data.text ?? ""));
      if (text) {
        headings.push({ level, text, blockId: block.id });
        allTexts.push(text);
      }
      sections.push({ headingLevel: level, headingText: text, headingBlockId: block.id, texts: [] });
      continue;
    }

    if (block.type === "paragraph" || block.type === "quote") {
      const raw = String(data.text ?? "");
      const text = plainOf(raw);
      hrefs.push(...hrefsOf(raw));
      if (text) {
        current.texts.push(text);
        allTexts.push(text);
      }
      continue;
    }

    if (block.type === "list") {
      hasList = true;
      const items = Array.isArray(data.items) ? (data.items as string[]) : [];
      const texts = items.map((item) => plainOf(String(item))).filter(Boolean);
      items.forEach((item) => hrefs.push(...hrefsOf(String(item))));
      if (texts.length) {
        current.texts.push(texts.join(". "));
        allTexts.push(...texts);
      }
      continue;
    }

    if (block.type === "table") {
      hasTable = true;
      const rows = Array.isArray(data.content) ? (data.content as string[][]) : [];
      const cells = rows.flat().map((cell) => plainOf(String(cell))).filter(Boolean);
      allTexts.push(...cells);
      continue;
    }

    if (block.type === "image") {
      imageCount++;
      const alt = String(data.alt ?? "").trim();
      if (!alt) imagesWithoutAlt++;
      else imageAlts.push(alt);
    }
  }

  const allText = allTexts.join(" ");
  return {
    sections,
    headings,
    allText,
    wordCount: wordsOf(allText),
    hasTable,
    hasList,
    imageCount,
    imagesWithoutAlt,
    imageAlts,
    hrefs,
  };
}

/* --------------------------- nhóm kỹ thuật (SEO) ------------------------- */

function technicalChecks(input: SeoInput, a: Analysis): SeoCheck[] {
  const checks: SeoCheck[] = [];
  const push = (c: Omit<SeoCheck, "group">) => checks.push({ ...c, group: "technical" });

  // Tiêu đề thẻ title
  const titleText = (input.metaTitle || input.title).trim();
  const titleLen = titleText.length;
  if (!titleText) {
    push({ id: "title-length", status: "fail", label: "Tiêu đề trang", detail: "Chưa có tiêu đề." });
  } else if (titleLen >= 30 && titleLen <= 60) {
    push({ id: "title-length", status: "pass", label: "Tiêu đề trang", detail: `${titleLen} ký tự (gợi ý 30–60).` });
  } else {
    push({
      id: "title-length",
      status: "warn",
      label: "Tiêu đề trang",
      detail: `${titleLen} ký tự. Nên ở khoảng 30–60 để không bị cắt trên kết quả tìm kiếm.`,
    });
  }

  // Tiêu đề meta khác H1 có thể bị Google viết lại
  if (input.metaTitle.trim() && input.title.trim()) {
    const similarity = titleSimilarity(input.metaTitle, input.title);
    push({
      id: "title-h1-match",
      status: similarity >= 0.5 ? "pass" : "warn",
      label: "Tiêu đề khớp tiêu đề bài",
      detail:
        similarity >= 0.5
          ? "Meta title và tiêu đề bài khá giống nhau."
          : "Meta title khác khá nhiều so với tiêu đề bài. Google có thể tự viết lại tiêu đề hiển thị.",
    });
  }

  // Mô tả meta
  const descText = (input.metaDescription || input.excerpt).trim();
  const descLen = descText.length;
  if (!descText) {
    push({
      id: "description",
      status: "warn",
      label: "Mô tả hiển thị",
      detail: "Chưa có mô tả. Google sẽ tự chọn một đoạn trích từ bài.",
    });
  } else if (descLen >= 120 && descLen <= 160) {
    push({ id: "description", status: "pass", label: "Mô tả hiển thị", detail: `${descLen} ký tự (gợi ý 120–160).` });
  } else {
    push({
      id: "description",
      status: "warn",
      label: "Mô tả hiển thị",
      detail: `${descLen} ký tự. Nên ở khoảng 120–160 để mô tả đủ ý mà không bị cắt.`,
    });
  }

  // Đường dẫn
  const slugOk = /^[a-z0-9-]+$/.test(input.slug) && input.slug.length <= 75;
  push({
    id: "slug",
    status: slugOk ? "pass" : "warn",
    label: "Đường dẫn",
    detail: slugOk
      ? "Đường dẫn ngắn, không dấu, chỉ có chữ thường, số và dấu gạch."
      : "Đường dẫn nên ngắn (tối đa 75 ký tự), không dấu và không ký tự đặc biệt.",
  });

  // Từ khóa chính
  const focus = foldText(input.focusKeyword);
  if (!focus) {
    push({
      id: "focus-keyword",
      status: "warn",
      label: "Từ khóa chính",
      detail: "Chưa đặt từ khóa chính. Đặt một cụm từ người mua thực sự gõ để kiểm tra vị trí.",
    });
  } else {
    const first100 = foldText(a.allText.split(/\s+/).slice(0, 100).join(" "));
    const inTitle = foldText(`${input.title} ${input.metaTitle}`).includes(focus);
    const inIntro = first100.includes(focus);
    const inHeading = a.headings.some((h) => foldText(h.text).includes(focus));
    const inAlt =
      foldText(input.featuredImageAlt).includes(focus) || a.imageAlts.some((alt) => foldText(alt).includes(focus));
    const inDesc = foldText(`${input.metaDescription} ${input.excerpt}`).includes(focus);
    const missing: string[] = [];
    if (!inTitle) missing.push("tiêu đề");
    if (!inIntro) missing.push("100 từ đầu");
    if (!inHeading && !inAlt) missing.push("một mục H2 hoặc alt ảnh");
    if (!inDesc) missing.push("mô tả");
    const placed = missing.length === 0;
    push({
      id: "focus-keyword",
      status: placed ? "pass" : "warn",
      label: "Từ khóa chính",
      detail: placed
        ? `"${input.focusKeyword}" đã có ở tiêu đề, phần mở đầu, mục con và mô tả.`
        : `"${input.focusKeyword}" chưa có ở: ${missing.join(", ")}.`,
    });

    const occurrences = countOccurrences(foldText(a.allText), focus);
    const limit = Math.max(5, Math.floor(a.wordCount / 100));
    if (occurrences > limit) {
      push({
        id: "keyword-stuffing",
        status: "warn",
        label: "Lặp từ khóa",
        detail: `Từ khóa xuất hiện ${occurrences} lần. Lặp nhiều như vậy dễ đọc gượng; hãy dùng từ đồng nghĩa.`,
      });
    }

    // Trùng với bài khác
    const dupes = input.otherPosts.filter((post) => {
      if (post.id === input.currentId) return false;
      const sameKeyword = focus && foldText(post.focus_keyword ?? "") === focus;
      const similarTitle = titleSimilarity(post.title, titleText) >= 0.6;
      return sameKeyword || similarTitle;
    });
    if (dupes.length > 0) {
      push({
        id: "duplicate-topic",
        status: "warn",
        label: "Trùng chủ đề với bài khác",
        detail: `Có ${dupes.length} bài cùng từ khóa hoặc tiêu đề gần giống: ${dupes
          .slice(0, 2)
          .map((d) => `“${d.title}”`)
          .join(", ")}. Nên gộp hoặc đổi góc tiếp cận để các bài không tự cạnh tranh.`,
      });
    }
  }

  // Ảnh bìa
  if (!input.featuredImage) {
    push({ id: "cover", status: "warn", label: "Ảnh bìa", detail: "Chưa có ảnh bìa." });
  } else {
    const problems: string[] = [];
    if (!input.featuredImageAlt.trim()) problems.push("thiếu mô tả ảnh (alt)");
    if (input.coverWidth !== null && input.coverWidth < 1200) {
      problems.push(`rộng ${input.coverWidth}px, nên từ 1200px để đủ chuẩn hiển thị lớn`);
    }
    push({
      id: "cover",
      status: problems.length ? "warn" : "pass",
      label: "Ảnh bìa",
      detail: problems.length ? `Ảnh bìa ${problems.join("; ")}.` : "Ảnh bìa có mô tả và đủ kích thước.",
    });
  }

  // Ảnh trong nội dung
  if (a.imagesWithoutAlt > 0) {
    push({
      id: "image-alt",
      status: "warn",
      label: "Mô tả ảnh trong nội dung",
      detail: `${a.imagesWithoutAlt} ảnh chưa có mô tả (alt). Mô tả giúp người khiếm thị và công cụ tìm kiếm hiểu ảnh.`,
    });
  }

  // Cấu trúc heading
  const levelIssues: string[] = [];
  let previous = 1;
  for (const h of a.headings) {
    if (h.level === 1) levelIssues.push(`“${h.text}” dùng H1 (bài đã có tiêu đề là H1)`);
    else if (h.level - previous > 1) levelIssues.push(`“${h.text}” nhảy từ H${previous} lên H${h.level}`);
    previous = h.level;
  }
  if (levelIssues.length) {
    push({
      id: "heading-levels",
      status: "warn",
      label: "Thứ bậc tiêu đề",
      detail: levelIssues.slice(0, 2).join("; ") + ".",
    });
  }

  // Liên kết nội bộ
  const internal = a.hrefs.filter((href) => !isExternal(href)).length;
  push({
    id: "internal-links",
    status: internal > 0 ? "pass" : "warn",
    label: "Liên kết nội bộ",
    detail:
      internal > 0
        ? `${internal} liên kết tới trang khác của Veximtrade.`
        : "Chưa có liên kết tới bài hoặc trang khác của Veximtrade. Hãy dẫn người đọc tới bài liên quan.",
  });

  // Độ sâu nội dung (không dùng số từ làm mốc)
  const h2Count = a.headings.filter((h) => h.level === 2).length;
  if (a.wordCount < 150) {
    push({
      id: "depth",
      status: "fail",
      label: "Độ sâu nội dung",
      detail: `Bài còn ${a.wordCount} từ, chưa đủ để trả lời trọn vẹn câu hỏi của người đọc.`,
    });
  } else if (h2Count < 2) {
    push({
      id: "depth",
      status: "warn",
      label: "Độ sâu nội dung",
      detail: "Nên chia thành ít nhất 2–3 mục H2 để người đọc tìm được phần cần.",
    });
  } else {
    push({
      id: "depth",
      status: "pass",
      label: "Độ sâu nội dung",
      detail: `${h2Count} mục H2 trong bài.`,
    });
  }

  // Độ mới
  if (input.published && input.updatedAt) {
    const now = input.now ?? new Date();
    const ageDays = Math.floor((now.getTime() - new Date(input.updatedAt).getTime()) / DAY_MS);
    if (ageDays > STALE_DAYS) {
      push({
        id: "freshness",
        status: "warn",
        label: "Độ mới",
        detail: `Bài chưa được cập nhật trong ${ageDays} ngày. Rà lại số liệu và liên kết, rồi lưu lại.`,
      });
    }
  }

  // Ngoài phạm vi kiểm tra tự động
  push({
    id: "author",
    status: "info",
    label: "Tác giả và người duyệt",
    detail: "Bài chưa có trường tác giả và người kiểm duyệt. Đây là tín hiệu tin cậy cần bổ sung khi có dữ liệu.",
  });

  return checks;
}

/* ----------------------- nhóm sẵn sàng trả lời (AI) ---------------------- */

function answerChecks(a: Analysis): SeoCheck[] {
  const checks: SeoCheck[] = [];
  const push = (c: Omit<SeoCheck, "group">) => checks.push({ ...c, group: "answer" });

  // Trả lời trực tiếp ở đầu mỗi mục (40–80 từ)
  const answerSections = a.sections.filter((s, index) => {
    if (s.headingLevel === null) return index === 0 && s.texts.length > 0; // đoạn mở đầu
    return true;
  });
  const failing: string[] = [];
  for (const s of answerSections) {
    const first = s.texts[0] ?? "";
    const count = wordsOf(first);
    const name = s.headingText || "Mở đầu";
    if (count < 40 || count > 80) {
      failing.push(count === 0 ? `“${name}” chưa có đoạn trả lời` : `“${name}” ${count} từ`);
    }
  }
  if (answerSections.length === 0) {
    push({
      id: "answer-first",
      status: "info",
      label: "Trả lời trực tiếp ở đầu mục",
      detail: "Chưa có nội dung để kiểm tra.",
    });
  } else {
    push({
      id: "answer-first",
      status: failing.length ? "warn" : "pass",
      label: "Trả lời trực tiếp ở đầu mục",
      detail: failing.length
        ? `Đoạn đầu mỗi mục nên trả lời câu hỏi trong khoảng 40–80 từ: ${failing.slice(0, 3).join("; ")}.`
        : "Đoạn đầu mỗi mục đều trả lời trực tiếp trong 40–80 từ.",
    });
  }

  // Mục H2 dạng câu hỏi
  const h2s = a.headings.filter((h) => h.level === 2);
  const questionCount = h2s.filter((h) => isQuestionHeading(h.text)).length;
  push({
    id: "question-headings",
    status: questionCount > 0 ? "pass" : "warn",
    label: "Mục dạng câu hỏi",
    detail:
      questionCount > 0
        ? `${questionCount} mục H2 là câu hỏi người mua thường gõ.`
        : "Nên có ít nhất một mục H2 viết dưới dạng câu hỏi người mua thường hỏi.",
  });

  // Bảng hoặc danh sách
  push({
    id: "structured",
    status: a.hasTable || a.hasList ? "pass" : "warn",
    label: "Bảng hoặc danh sách",
    detail:
      a.hasTable || a.hasList
        ? "Bài có bảng hoặc danh sách giúp đọc nhanh các bước và thông số."
        : "Nên dùng bảng so sánh hoặc danh sách bước ở chỗ phù hợp.",
  });

  // Phần hỏi đáp
  const hasFaq = a.headings.some((h) => {
    const folded = foldText(h.text);
    return folded.includes("cau hoi") || folded.includes("faq");
  });
  push({
    id: "faq",
    status: hasFaq ? "pass" : "info",
    label: "Phần hỏi đáp",
    detail: hasFaq ? "Bài có mục hỏi đáp." : "Có thể thêm mục hỏi đáp ngắn cho các câu người mua hay hỏi.",
  });

  // Nguồn dẫn chứng
  const hasStats = STAT_PATTERN.test(a.allText);
  const external = a.hrefs.filter(isExternal);
  const official = external.filter((href) => OFFICIAL_HOST.test(href)).length;
  if (hasStats && external.length === 0) {
    push({
      id: "sources",
      status: "warn",
      label: "Nguồn cho số liệu",
      detail: "Bài có số liệu nhưng chưa dẫn nguồn. Thêm liên kết tới nguồn chính thống khi có.",
    });
  } else if (external.length > 0) {
    push({
      id: "sources",
      status: "pass",
      label: "Nguồn cho số liệu",
      detail: `${external.length} liên kết ngoài${official ? `, trong đó ${official} tới nguồn chính thống` : ""}.`,
    });
  } else {
    push({
      id: "sources",
      status: "info",
      label: "Nguồn cho số liệu",
      detail: "Bài chưa có số liệu cần dẫn nguồn.",
    });
  }

  return checks;
}

/* --------------------------------- chấm điểm ------------------------------ */

function scoreOf(checks: SeoCheck[]): number {
  const scored = checks.filter((c) => c.status !== "info");
  if (scored.length === 0) return 100;
  const points = scored.reduce((sum, c) => sum + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  return Math.round((points / scored.length) * 100);
}

export function runSeoChecks(input: SeoInput): SeoReport {
  const analysis = analyzeBlocks(input.blocks);
  const technical = technicalChecks(input, analysis);
  const answer = answerChecks(analysis);
  return {
    checks: [...technical, ...answer],
    technicalScore: scoreOf(technical),
    answerScore: scoreOf(answer),
    wordCount: analysis.wordCount,
  };
}
