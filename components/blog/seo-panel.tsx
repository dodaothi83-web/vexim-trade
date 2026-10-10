import type { SeoCheck, SeoReport, SeoStatus } from "@/lib/blog/seo-check";

/**
 * Bảng kiểm tra SEO trong trình soạn bài.
 * Chỉ liệt kê việc cần làm (cảnh báo và lỗi) trước; mục đạt được gom thành một dòng đếm.
 */

const STATUS_STYLE: Record<SeoStatus, { dot: string; text: string }> = {
  fail: { dot: "bg-red-600", text: "text-red-700" },
  warn: { dot: "bg-amber-500", text: "text-amber-700" },
  pass: { dot: "bg-brand-600", text: "text-brand-700" },
  info: { dot: "bg-ink-300", text: "text-ink-500" },
};

const STATUS_ORDER: SeoStatus[] = ["fail", "warn", "info", "pass"];

function scoreTone(score: number): string {
  if (score >= 80) return "text-brand-700";
  if (score >= 50) return "text-amber-700";
  return "text-red-700";
}

function CheckRow({ check }: { check: SeoCheck }) {
  const style = STATUS_STYLE[check.status];
  return (
    <li className="flex gap-2.5 py-2">
      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
      <div className="min-w-0">
        <p className={`text-[13px] font-semibold ${style.text}`}>{check.label}</p>
        <p className="text-[12px] leading-relaxed text-ink-600">{check.detail}</p>
      </div>
    </li>
  );
}

function GroupBlock({ title, score, checks }: { title: string; score: number; checks: SeoCheck[] }) {
  const attention = checks
    .filter((c) => c.status === "fail" || c.status === "warn" || c.status === "info")
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const passed = checks.filter((c) => c.status === "pass").length;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink-500">{title}</h3>
        <span className={`text-[13px] font-black ${scoreTone(score)}`}>{score}/100</span>
      </div>
      {attention.length === 0 ? (
        <p className="py-1 text-[12px] text-brand-700">Không còn việc cần làm trong nhóm này.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {attention.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </ul>
      )}
      {passed > 0 && <p className="pt-1 text-[11px] text-ink-400">Đạt: {passed} mục</p>}
    </div>
  );
}

export function SeoPanel({ report }: { report: SeoReport }) {
  const technical = report.checks.filter((c) => c.group === "technical");
  const answer = report.checks.filter((c) => c.group === "answer");

  return (
    <div className="space-y-4">
      <GroupBlock title="SEO kỹ thuật" score={report.technicalScore} checks={technical} />
      <GroupBlock title="Sẵn sàng trả lời" score={report.answerScore} checks={answer} />
      <p className="text-[11px] leading-relaxed text-ink-400">
        Đây là gợi ý để bài rõ ràng hơn cho người đọc, không phải cam kết về thứ hạng tìm kiếm.
        Độ dài tiêu đề và mô tả tính theo ký tự, còn Google hiển thị theo pixel.
      </p>
    </div>
  );
}
