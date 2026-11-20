/**
 * Phần giới thiệu "About this supplier" có định dạng nhẹ (chủ sàn chốt 2026-11-20): nhà cung cấp
 * gói Premium/Pro soạn bằng trình soạn kiểu blog (tiêu đề phụ, gạch đầu dòng, chữ đậm), viết
 * tiếng Việt, AI dịch sang tiếng Anh và giữ nguyên định dạng.
 *
 * Lưu dạng chữ có dấu hiệu đơn giản để dịch, so sánh và lưu như cũ (cùng cột intro_source,
 * summary_i18n.en):
 * - dòng bắt đầu "### " là tiêu đề phụ;
 * - dòng bắt đầu "- " là một gạch đầu dòng;
 * - **chữ** là chữ đậm;
 * - dòng trống ngăn các đoạn; các dòng liền nhau cùng một đoạn (xuống dòng).
 * Chữ thường (hồ sơ cũ) vẫn đúng định dạng: mỗi đoạn là một đoạn văn.
 *
 * Tệp thuần, script kiểm tra nạp thẳng bằng Node.
 */

export type RichIntroRun = { t: string; b?: true };
export type RichIntroNode = { kind: "h3" | "p" | "li"; runs: RichIntroRun[] };

const HEADING = /^#{1,6}\s+/;
const BULLET = /^(?:[-*•])\s+/;

/** Chữ đậm **...** thành các đoạn chữ; dấu ** lẻ giữ nguyên là chữ. */
export function parseRichRuns(line: string): RichIntroRun[] {
  const runs: RichIntroRun[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) runs.push({ t: line.slice(last, m.index) });
    runs.push({ t: m[1], b: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) runs.push({ t: line.slice(last) });
  return runs.filter((run) => run.t);
}

export function parseRichIntro(text: string): RichIntroNode[] {
  const nodes: RichIntroNode[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) nodes.push({ kind: "p", runs: parseRichRuns(paragraph.join("\n")) });
    paragraph = [];
  };
  for (const raw of (text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    if (HEADING.test(line.trimStart())) { flush(); nodes.push({ kind: "h3", runs: parseRichRuns(line.trimStart().replace(HEADING, "")) }); continue; }
    if (BULLET.test(line.trimStart())) { flush(); nodes.push({ kind: "li", runs: parseRichRuns(line.trimStart().replace(BULLET, "")) }); continue; }
    paragraph.push(line.trim());
  }
  flush();
  return nodes.filter((node) => node.runs.some((run) => run.t.trim()));
}

/** Có dùng định dạng (tiêu đề, gạch đầu dòng, chữ đậm) hay chỉ là chữ thường. */
export function hasRichIntroMarkup(text: string): boolean {
  return parseRichIntro(text).some((node) => node.kind !== "p" || node.runs.some((run) => run.b));
}

/**
 * Chữ thường để hiện ở nơi không có định dạng (thẻ tìm kiếm, mô tả SEO, trang Basic): bỏ dấu
 * tiêu đề và chữ đậm, gạch đầu dòng thành "•".
 */
export function richIntroPlain(text: string): string {
  return parseRichIntro(text).map((node) => {
    const body = node.runs.map((run) => run.t).join("");
    return node.kind === "li" ? `• ${body}` : body;
  }).join("\n\n").replace(/(• [^\n]*)\n\n(?=• )/g, "$1\n").trim();
}

/** Chuẩn hoá chữ có định dạng: giữ xuống dòng, gộp khoảng trắng trong dòng, tối đa một dòng trống. */
export function cleanRichIntro(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[\t ]+/g, " ").trimEnd())
    .join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit);
}

/** Dựng lại chữ có định dạng từ các đoạn (trình soạn đọc nội dung đang soạn). */
export function richIntroFromNodes(nodes: RichIntroNode[]): string {
  const runs = (list: RichIntroRun[]) => list.map((run) => {
    if (!run.b || !run.t.trim()) return run.t;
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.t)!;
    return `${lead}**${core}**${trail}`;
  }).join("").replace(/\*\*\*\*/g, "");
  const out: string[] = [];
  nodes.forEach((node, i) => {
    const body = runs(node.runs).replace(/[\t ]+/g, " ").trim();
    if (!body) return;
    const line = node.kind === "h3" ? `### ${body}` : node.kind === "li" ? `- ${body}` : body;
    // Gạch đầu dòng liền nhau không cách dòng; còn lại cách một dòng trống.
    if (out.length) out.push(node.kind === "li" && nodes[i - 1]?.kind === "li" ? "\n" : "\n\n");
    out.push(line);
  });
  return out.join("");
}
