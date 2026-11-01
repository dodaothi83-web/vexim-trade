import { z } from "zod";

export const MAX_AI_DOCUMENTS = 6;
export const MAX_AI_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_AI_TOTAL_BYTES = 12 * 1024 * 1024;

const verdicts = ["pass", "fail", "uncertain"] as const;
const checkSchema = z.object({
  key: z.string(), verdict: z.enum(verdicts), reason: z.string(), evidence_ids: z.array(z.string()),
});
const responseSchema = z.object({ checks: z.array(checkSchema), summary: z.string() });

export type AiDocumentCheck = { key: string; verdict: typeof verdicts[number]; reason: string; evidence_ids: string[] };
export type AiDocumentReview = { checks: AiDocumentCheck[]; summary: string };

/** Treat model output as untrusted. Never promote an unreferenced claim to a pass/fail. */
export function parseDocumentReview(raw: unknown, allowedIds: string[]): AiDocumentReview {
  const parsed = responseSchema.parse(raw);
  const expected = ["business_license"] as const;
  if (parsed.checks.length !== expected.length || new Set(parsed.checks.map((c) => c.key)).size !== expected.length ||
    parsed.checks.some((c) => !expected.includes(c.key as typeof expected[number]))) {
    throw new Error("AI không trả đúng mục đăng ký kinh doanh.");
  }
  const allowed = new Set(allowedIds);
  return {
    summary: parsed.summary.trim().slice(0, 1000),
    checks: expected.map((key) => {
      const item = parsed.checks.find((c) => c.key === key)!;
      const evidence_ids = [...new Set(item.evidence_ids.filter((id) => allowed.has(id)))].slice(0, 6);
      return {
        key, verdict: evidence_ids.length ? item.verdict : "uncertain",
        reason: item.reason.trim().slice(0, 500) || "AI chưa nêu lý do; cần kiểm thủ công.",
        evidence_ids,
      };
    }),
  };
}
