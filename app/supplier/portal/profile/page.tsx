import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Eye, FileText, Pencil, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { effectiveL2Scope, l2ScopeForSupplier } from "@/lib/l2-scope";
import { migrationHint } from "@/lib/db/migration-hints";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";
import { Info, LevelChip, Panel, VerifyRow } from "../portal-ui";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.profile.view.title, robots: { index: false, follow: false } };
}

const join = (value: (string | null | undefined)[] | undefined) => (value ?? []).filter(Boolean).join(" · ");
const vi = (value: Record<string, string> | undefined) => value?.vi || value?.en || "";

/**
 * Hồ sơ doanh nghiệp: dữ liệu nhà cung cấp đã khai, tình trạng từng cấp xác minh và
 * thông tin liên hệ nội bộ (không hiển thị công khai).
 *
 * Phần giao diện buyer nhìn thấy nằm ở trang “Trang của tôi”, dùng chung khung với trang
 * công khai. Ảnh bìa và ảnh đại diện thuộc trang đó, không đặt ở đây.
 */
export default async function SupplierProfilePage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { m } = await getPortalMessages();
  const copy = m.profile;
  const view = copy.view;
  const f = view.info.fields;
  const { supplier, review, reviews, store } = access;

  const degraded: string[] = [];
  async function optional<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (error) {
      console.error(`[supplier-portal] could not read ${label}. ${migrationHint(error) ?? ""}`.trim(), error);
      degraded.push(label);
      return fallback;
    }
  }
  const [requestRows, submissionRows, certificateRows, productRows] = await Promise.all([
    optional("verification requests", [] as Awaited<ReturnType<typeof store.listSupplierVerificationRequests>>,
      () => store.listSupplierVerificationRequests(supplier.id)),
    optional("self-submitted profiles", [] as Awaited<ReturnType<typeof store.listSubmissions>>,
      () => store.listSubmissions(supplier.id)),
    optional("certificates", [] as Awaited<ReturnType<typeof store.listCertificates>>,
      () => store.listCertificates(supplier.id)),
    optional("products", [] as Awaited<ReturnType<typeof store.listProductsBySupplier>>,
      () => store.listProductsBySupplier(supplier.id)),
  ]);

  const l1Approved = reviews.some((v) => v.target_level === 1 && v.status === "approved");
  const l2Scope = l2ScopeForSupplier(supplier.supplier_type);
  const l2Approved = reviews.some((v) => v.target_level === 2 && v.status === "approved" && l2Scope !== null && effectiveL2Scope(v.l2_scope) === l2Scope);
  const l3Approved = reviews.some((v) => v.target_level === 3 && v.status === "approved");
  const approvedLevels = [l1Approved, l2Approved, l3Approved].filter(Boolean).length;
  const st = copy.statuses;
  const l1Status = l1Approved ? st.approved : review?.status === "returned" ? st.needsMore
    : review?.status === "submitted" ? st.pendingReview : st.reviewing;
  const l2Own = submissionRows.find((s) => s.target_level === 2 && l2Scope !== null && effectiveL2Scope(s.l2_scope) === l2Scope);
  const l3Own = submissionRows.find((s) => s.target_level === 3);
  const l2Status = !l2Scope ? st.typeNeeded : l2Approved ? st.approved : l2Own?.status === "pending_review" ? st.submissionPending
    : l2Own?.status === "returned" ? st.submissionReturned : l2Own?.status === "accepted" ? st.accepted
    : requestRows.find((r) => r.target_level === 2)?.status === "contacted" ? st.contacted : st.noEvidence;
  const l3Status = l3Approved ? st.approved : l3Own?.status === "pending_review" ? st.submissionPending
    : l3Own?.status === "returned" ? st.submissionReturned : l3Own?.status === "accepted" ? st.accepted
    : requestRows.find((r) => r.target_level === 3)?.status === "contacted" ? st.contacted : st.noEvidence;
  const currentStep = !l1Approved ? 1 : !l2Approved ? 2 : !l3Approved ? 3 : null;
  const goal = copy.view.goals;
  const nextGoal = currentStep ? `L${currentStep} · ${currentStep === 1 ? goal.documents : currentStep === 2 ? l2Scope === "partner_contract" ? goal.partner : goal.factory : goal.export}` : goal.allDone;
  const published = supplier.status === "published";
  const about = vi(supplier.summary_i18n) || supplier.intro_source || "";
  const marketText = supplier.export_markets_i18n?.vi?.join(", ") || join(supplier.export_markets) || supplier.markets || "";
  const typeLabel = supplier.supplier_type ? m.shared.supplierTypes[supplier.supplier_type] : m.shared.supplierTypes.unset;

  return <>
    <PageHeader eyebrow={copy.eyebrow} title={view.title} sub={view.sub}
      actions={<>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold text-brand-800">{fill(view.nextStepBadge, { goal: nextGoal })}</span>
        <Link href="/supplier/portal/profile/edit" className="btn btn-primary">
          <Pencil className="h-4 w-4" aria-hidden="true" />{view.edit}
        </Link>
        <Link href="/supplier/portal/storefront" className="btn btn-ghost">
          <Eye className="h-4 w-4" aria-hidden="true" />{view.storefront}
        </Link>
      </>} />

    {degraded.length > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">{view.degradedTitle}</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{view.degradedLabels[label as keyof typeof view.degradedLabels] ?? label}</li>)}</ul>
    </div>}

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Panel icon={<FileText className="h-4 w-4 text-brand-700" />} title={view.info.title} sub={view.info.sub}>
          <p className="text-[10.5px] font-bold tracking-[0.14em] text-ink-400 uppercase">{view.info.groups.company}</p>
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <Info label={f.name} value={supplier.name} />
            <Info label={f.tradeName} value={supplier.trade_name} />
            <Info label={f.displayName} value={supplier.display_name} />
            <Info label={f.type} value={typeLabel} />
            <Info label={f.taxNumber} value={review?.tax_number || supplier.tax_id} />
            <Info label={f.foundedYear} value={supplier.founded_year ? String(supplier.founded_year) : null} />
            <Info label={f.employees} value={typeof supplier.employees === "number" && supplier.employees > 0 ? String(supplier.employees) : null} />
            <Info label={f.privateLabel} value={supplier.private_label ? copy.statuses.yes : copy.statuses.no} />
            <Info label={f.address} value={supplier.address} />
            <Info label={f.province} value={supplier.province} />
          </dl>

          <p className="mt-5 text-[10.5px] font-bold tracking-[0.14em] text-ink-400 uppercase">{view.info.groups.trade}</p>
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <Info label={f.products} value={supplier.products} />
            <Info label={f.markets} value={marketText} />
            <Info label={f.capacity} value={supplier.capacity_per_month} />
            <Info label={f.moq} value={supplier.moq_text} />
            <Info label={f.paymentTerms} value={supplier.payment_terms} />
            <Info label={f.ports} value={join(supplier.ports)} />
            <Info label={f.incoterms} value={join(supplier.incoterms)} />
            <Info label={f.leadTime} value={supplier.lead_time_days ? fill(view.info.leadTimeValue, { days: supplier.lead_time_days }) : null} />
            <Info label={f.status} value={published ? copy.statuses.publicNow : copy.statuses.notPublic} />
          </dl>

          <p className="mt-5 text-[10.5px] font-bold tracking-[0.14em] text-ink-400 uppercase">{view.info.groups.contact}</p>
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <Info label={f.contactPerson} value={[supplier.contact_name, supplier.contact_title].filter(Boolean).join(" · ")} />
            <Info label={f.phone} value={supplier.phone} />
            <Info label={f.email} value={supplier.email} />
            <Info label={f.zalo} value={supplier.zalo} />
            <Info label={f.website} value={supplier.website} />
          </dl>
          <p className="mt-4 text-[11px] leading-5 text-ink-500">{view.info.footnote}</p>
        </Panel>

        <Panel icon={<BadgeCheck className="h-4 w-4 text-brand-700" />} title={view.about.title} sub={view.about.sub}>
          {about
            ? <p className="text-[13px] leading-6 whitespace-pre-line text-ink-700">{about}</p>
            : <p className="text-[13px] leading-6 text-ink-500">{view.about.empty}</p>}
        </Panel>
      </div>

      <Panel icon={<ShieldCheck className="h-4 w-4 text-brand-700" />} title={view.levels.title} sub={view.levels.sub}>
        <ol className="space-y-2">
          {([
            { level: 1, title: view.levels.business, status: l1Status, on: l1Approved, href: "/supplier/portal/documents", cta: view.levels.cta.documents },
            { level: 2, title: l2Scope === "partner_contract" ? view.levels.partner : view.levels.factory, status: l2Status, on: l2Approved, href: "/supplier/portal/verification/factory", cta: view.levels.cta.factory },
            { level: 3, title: view.levels.export, status: l3Status, on: l3Approved, href: "/supplier/portal/verification/export", cta: view.levels.cta.export },
          ] as const).map((step) => <li key={step.level} className="relative">
            <VerifyRow level={`L${step.level}`} title={step.title} status={step.status} on={step.on} />
            {currentStep === step.level && <span className="absolute top-2.5 right-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 ring-1 ring-amber-300">
              {view.levels.here}
            </span>}
            {!step.on && <Link href={step.href} className="mt-1 ml-11 inline-block text-[11.5px] font-semibold text-brand-700 hover:underline">{step.cta}</Link>}
          </li>)}
        </ol>
        <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2.5 text-[11.5px] leading-5 text-ink-700">
          {currentStep
            ? <>{view.levels.nextBodyBefore} <b className="text-ink-900">{nextGoal}</b>. {view.levels.nextBodyAfter}</>
            : <>{view.levels.doneBody}</>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/supplier/portal/documents" className="btn btn-ghost btn-sm">{view.levels.links.business}</Link>
          <Link href="/supplier/portal/verification/factory" className="btn btn-soft btn-sm">{l2Scope === "partner_contract" ? view.levels.links.partnerContract : view.levels.links.factoryEvidence}</Link>
          <Link href="/supplier/portal/verification/export" className="btn btn-soft btn-sm">{view.levels.links.exportEvidence}</Link>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-ink-500">{view.levels.footnote}</p>
      </Panel>
    </div>
  </>;
}
