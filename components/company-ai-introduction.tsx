"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { generateProspectCompanyIntroductionAction } from "@/app/actions";
import type { ProspectCompanySource } from "@/lib/types";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";
import { formatCompanyIntroductionSummary } from "@/lib/ai/company-introduction-format";

export function CompanyAiIntroduction({
  prospectId,
  initialSummary,
  initialSources,
  initialAnalyzedAt,
}: {
  prospectId: string;
  initialSummary: string | null;
  initialSources: ProspectCompanySource[];
  initialAnalyzedAt: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [summary, setSummary] = useState(initialSummary ? formatCompanyIntroductionSummary(initialSummary) : null);
  const [sources, setSources] = useState(initialSources);
  const [analyzedAt, setAnalyzedAt] = useState(initialAnalyzedAt);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const result = await generateProspectCompanyIntroductionAction(prospectId, Boolean(summary));
      if (!result.ok) {
        toast.push({ kind: "error", title: result.message });
        return;
      }
      setSummary(result.summary ? formatCompanyIntroductionSummary(result.summary) : null);
      setSources(result.sources ?? []);
      setAnalyzedAt(result.analyzedAt ?? null);
      toast.push({ kind: "success", title: result.message });
      router.refresh();
    } catch {
      toast.push({ kind: "error", title: "Không kết nối được với dịch vụ AI. Hãy thử lại." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-ink-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-ink-900">
          <Sparkles className="h-4 w-4 text-brand-600" /> AI giới thiệu công ty
        </h3>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void generate()} className="px-2.5 py-1.5 text-[11.5px]">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {busy ? "Đang tìm hiểu..." : summary ? "Phân tích lại" : "Tạo giới thiệu"}
        </Button>
      </div>

      {summary ? (
        <div className="mt-2 space-y-2">
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-700">{summary}</p>
          {sources.length > 0 && (
            <ul className="space-y-1 text-[11px]">
              {sources.map((source) => (
                <li key={source.url}>
                  <a className="inline-flex items-center gap-1 text-brand-700 hover:underline" href={source.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{source.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {analyzedAt && <p className="text-[10.5px] text-ink-400">Phân tích ngày {new Date(analyzedAt).toLocaleString("vi-VN")}</p>}
          <p className="text-[10.5px] text-ink-400">Tóm tắt tự động từ nguồn công khai. Nên mở nguồn để xác minh.</p>
        </div>
      ) : (
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
          AI tra cứu website và nguồn công khai, rồi tóm tắt hoạt động cùng sản phẩm công ty. Nội dung không tự thay đổi hồ sơ.
        </p>
      )}
    </section>
  );
}
