import Link from "next/link";
import { AlertTriangle, ArrowRight, Factory, ScanSearch, Ship } from "lucide-react";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { isPartnerL2 } from "@/lib/l2-scope";
import { readiness, submissionStatusLabel } from "@/lib/verification-submission";
import type { Supplier, SupplierSubmission, SupplierSubmissionItem } from "@/lib/types";
import { Breadcrumbs, Badge, Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const TABS: { key: string; label: string; filter: (s: SupplierSubmission) => boolean }[] = [
  { key: "pending_review", label: "Chờ xét duyệt", filter: (s) => s.status === "pending_review" },
  { key: "returned", label: "Cần bổ sung", filter: (s) => s.status === "returned" },
  { key: "draft", label: "NCC đang soạn", filter: (s) => s.status === "draft" },
  { key: "accepted", label: "Đã nhận vào đợt kiểm", filter: (s) => s.status === "accepted" },
  { key: "all", label: "Tất cả", filter: () => true },
];

/**
 * Hàng đợi hồ sơ do NHÀ CUNG CẤP TỰ GỬI (L2: 9 ảnh nhà máy, L3: chứng từ xuất khẩu).
 * Đây KHÔNG phải hàng đợi duyệt huy hiệu: nhận hồ sơ chỉ tạo đợt kiểm của nhân viên,
 * một nhân sự đủ quyền có thể kiểm và duyệt sau xác nhận; AI không tự duyệt.
 */
export default async function SubmissionQueuePage({ searchParams }: { searchParams?: Promise<{ tab?: string; level?: string }> }) {
  const session = await requirePagePermission("verifications.view", "/crm/dashboard");
  const sp = await searchParams;
  const tabKey = sp?.tab ?? "pending_review";
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const levelFilter = Number(sp?.level) === 3 ? 3 : Number(sp?.level) === 2 ? 2 : null;
  const canReview = hasPermission(session.role, "verifications.inspect");

  const store = getStore();
  let submissions: SupplierSubmission[] = [];
  let suppliers: Supplier[] = [];
  let itemsBySubmission = new Map<string, SupplierSubmissionItem[]>();
  let migrationMissing = false;
  try {
    [submissions, suppliers] = await Promise.all([store.listSubmissions(), store.listSuppliers()]);
    const itemLists = await Promise.all(submissions.slice(0, 60).map(async (s) => [s.id, await store.listSubmissionItems(s.id)] as const));
    itemsBySubmission = new Map(itemLists.map(([id, items]) => [id, items]));
  } catch (error) {
    migrationMissing = true;
    console.error("[submissions-queue] chưa đọc được bảng supplier_submissions", error);
  }
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const rows = submissions
    .filter((s) => tab.filter(s) && (!levelFilter || s.target_level === levelFilter))
    .sort((a, b) => (b.submitted_at ?? b.updated_at).localeCompare(a.submitted_at ?? a.updated_at));
  const counts = Object.fromEntries(TABS.map((t) => [t.key, submissions.filter(t.filter).length]));

  return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <Breadcrumbs items={[{ label: "Tổng quan", href: "/crm/dashboard" }, { label: "Xác minh NCC", href: "/crm/verifications" }, { label: "Hồ sơ NCC tự gửi" }]} />
    <PageHeader
      title="Hồ sơ bằng chứng NCC tự gửi"
      sub="L2 nhà máy: ảnh; L2 đối tác: hợp đồng do nhân viên đối chiếu. L3: chứng từ xuất khẩu do nhân viên đối chiếu. Nhận hồ sơ không tự cấp xác minh."
      actions={<Link href="/crm/verifications" className="btn btn-ghost">Hàng đợi xác minh <ArrowRight className="h-4 w-4" /></Link>}
    />

    {migrationMissing && <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      Chưa đọc được bảng <code>supplier_submissions</code>. Hãy chạy migration
      {" "}<code>supabase/migrations/20261020_supplier_self_verification_submissions.sql</code> trên đúng project Supabase rồi tải lại trang.
    </Card>}

    <div className="mt-4 flex flex-wrap gap-2">
      {TABS.map((t) => <Link key={t.key} href={`/crm/verifications/submissions?tab=${t.key}${levelFilter ? `&level=${levelFilter}` : ""}`}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${t.key === tabKey ? "border-brand-700 bg-brand-700 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-brand-400"}`}>
        {t.label} ({counts[t.key] ?? 0})
      </Link>)}
      <span className="mx-1 h-6 w-px self-center bg-ink-200" aria-hidden="true" />
      {[null, 2, 3].map((level) => <Link key={level ?? "all"} href={`/crm/verifications/submissions?tab=${tabKey}${level ? `&level=${level}` : ""}`}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${levelFilter === level ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-ink-200 bg-white text-ink-600 hover:border-emerald-400"}`}>
        {level === null ? "Cả L2 & L3" : level === 2 ? "L2 · nhà máy / đối tác" : "L3 · xuất khẩu"}
      </Link>)}
    </div>

    {rows.length ? <ul className="mt-5 space-y-3">
      {rows.map((s) => {
        const supplier = supplierMap.get(s.supplier_id);
        const items = itemsBySubmission.get(s.id) ?? [];
        const check = readiness({ submission: s, items });
        const hard = items.flatMap((i) => i.flags ?? []).filter((f) => f.severity === "hard" && (s.target_level === 2 || f.source !== "ai")).length;
        return <li key={s.id}>
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink-900">
                  {s.target_level === 2 ? <Factory className="h-4 w-4 text-emerald-700" /> : <Ship className="h-4 w-4 text-brand-700" />}
                  {supplier?.name ?? "(không rõ doanh nghiệp)"}
                  <Badge className={s.status === "pending_review" ? "bg-amber-50 text-amber-800" : s.status === "returned" ? "bg-rose-50 text-rose-800" : s.status === "accepted" ? "bg-emerald-50 text-emerald-800" : "bg-ink-100 text-ink-700"}>
                    {submissionStatusLabel(s.status)}
                  </Badge>
                  <Badge className="bg-ink-50 text-ink-600">{isPartnerL2(s) ? "L2 · nhà máy đối tác" : s.target_level === 2 ? "L2 · 9 ảnh nhà máy" : "L3 · lịch sử xuất khẩu"}</Badge>
                </p>
                <p className="mt-1 text-xs text-ink-600">
                  {items.filter((i) => i.media_id).length} bằng chứng · {check.missing.length ? `còn thiếu ${check.missing.length} mục bắt buộc` : "đủ mục bắt buộc"}
                  {s.target_level === 2 && !isPartnerL2(s) ? (s.verification_code ? ` · mã ${s.verification_code}` : " · chưa phát hành mã") : " · nhân viên kiểm tra"}
                  {s.ai_scanned_at ? ` · ${s.target_level === 3 ? "AI cũ" : "AI quét"} ${new Date(s.ai_scanned_at).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}` : s.target_level === 2 && !isPartnerL2(s) ? " · chưa quét AI" : ""}
                </p>
                {hard > 0 && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-700"><AlertTriangle className="h-3.5 w-3.5" /> {hard} cờ nghiêm trọng (mất EXIF, sai mã, GPS lệch, ảnh chỉnh sửa…)</p>}
                {s.ai_review?.summary && <p className="mt-1 line-clamp-2 max-w-3xl text-xs text-ink-600"><ScanSearch className="mr-1 inline h-3.5 w-3.5 text-violet-600" />{s.target_level === 3 && "AI cũ, chỉ tham khảo: "}{s.ai_review.summary}</p>}
              </div>
              <Link href={`/crm/verifications/submissions/${s.id}`} className={`btn ${canReview ? "btn-primary" : "btn-ghost"} shrink-0 text-xs`}>
                {s.status === "pending_review" && canReview ? "Đối chiếu & xét" : "Xem hồ sơ"}
              </Link>
            </div>
          </Card>
        </li>;
      })}
    </ul> : <EmptyState icon={<Factory className="h-5 w-5" />} title="Chưa có hồ sơ nào ở tab này"
      sub="Nhà cung cấp tự gửi bằng chứng qua Cổng NCC → Xác thực L2·L3. Hồ sơ nộp xong sẽ vào đây để nhân viên đối chiếu." />}

    <Card className="mt-6 bg-ink-50 p-4 text-xs text-ink-600">
      <strong className="text-ink-900">Ranh giới nghiệp vụ:</strong> Hợp đồng L2 đối tác và chứng từ L3 do nhân viên đối chiếu; AI và cờ ảnh nhà máy chỉ là tín hiệu.
      Nhận hồ sơ tạo đợt kiểm kèm bằng chứng, không tự cấp huy hiệu. Kết quả do người có quyền duyệt quyết định.
    </Card>
  </div>;
}
