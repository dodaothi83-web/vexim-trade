import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CalendarClock, Globe2, Mail, Phone, UserRound } from "lucide-react";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs, Card } from "@/components/ui";
import { ProspectActivityForm, ProspectConversion, ProspectStatusControl } from "@/components/prospect-actions";
import { prospectStatusLabel } from "@/lib/prospects/status";
import type { Buyer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prospect" };

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}
function companyKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/(limited|ltd|llc|inc|corp|corporation|company|co)$/, "");
}
function buyerMatches(prospect: { email: string | null; linkedin_url: string | null; website: string | null; company: string; country: string | null }, buyers: Buyer[]) {
  const email = normalize(prospect.email);
  const linkedin = normalize(prospect.linkedin_url);
  const domain = normalize(prospect.website).split("/")[0];
  const company = companyKey(prospect.company);
  return buyers.filter((buyer) => {
    if (email && normalize(buyer.email) === email) return true;
    if (linkedin && normalize(buyer.linkedin) === linkedin) return true;
    const buyerDomain = normalize(buyer.website).split("/")[0];
    if (domain && buyerDomain && domain === buyerDomain) return true;
    return company.length > 4 && company === companyKey(buyer.company)
      && (!prospect.country || !buyer.country || normalize(prospect.country) === normalize(buyer.country));
  }).slice(0, 5).map((buyer) => ({ id: buyer.id, company: buyer.company, contactName: buyer.contact_name, email: buyer.email }));
}
function externalUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("prospects.manage", "/dashboard");
  const { id } = await params;
  const store = getStore();
  const [prospect, buyers, activities, messages] = await Promise.all([
    store.getProspect(id),
    store.listBuyers(),
    store.listProspectActivities(id),
    store.listMessages(500),
  ]);
  if (!prospect) notFound();
  const emails = messages.filter((message) => message.prospect_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const matchCandidates = buyerMatches(prospect, buyers);
  const linkedBuyer = prospect.converted_buyer_id ? buyers.find((buyer) => buyer.id === prospect.converted_buyer_id) : null;

  return (
    <>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Prospects", href: "/prospects" }, { label: prospect.company }]} />}
        title={prospect.company}
        sub={`${prospect.contact_name || "Chưa có người liên hệ"}${prospect.contact_title ? ` · ${prospect.contact_title}` : ""}${prospect.industry ? ` · ${prospect.industry}` : ""}`}
        actions={<Link href="/prospects" className="btn btn-ghost"><ArrowLeft className="h-4 w-4" />Danh sách</Link>}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h2 className="mb-3 text-[14px] font-bold text-ink-900">Thông tin liên hệ</h2>
                <ul className="space-y-2.5 text-[13px] text-ink-700">
                  {prospect.contact_name && <li className="flex items-center gap-2"><UserRound className="h-4 w-4 text-ink-400" />{prospect.contact_name}</li>}
                  {prospect.email && <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-ink-400" /><a className="text-brand-700 hover:underline" href={`mailto:${prospect.email}`}>{prospect.email}</a>{prospect.email_status && <span className="text-[11px] text-ink-400">{prospect.email_status}</span>}</li>}
                  {prospect.phone && <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-ink-400" /><a href={`tel:${prospect.phone}`}>{prospect.phone}</a></li>}
                  {prospect.linkedin_url && <li className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-ink-400" /><a target="_blank" rel="noreferrer" className="text-brand-700 hover:underline" href={externalUrl(prospect.linkedin_url)}>LinkedIn cá nhân</a></li>}
                  {prospect.company_linkedin_url && <li className="flex items-center gap-2"><Building2 className="h-4 w-4 text-ink-400" /><a target="_blank" rel="noreferrer" className="text-brand-700 hover:underline" href={externalUrl(prospect.company_linkedin_url)}>LinkedIn công ty</a></li>}
                  {prospect.website && <li><a target="_blank" rel="noreferrer" className="text-brand-700 hover:underline" href={externalUrl(prospect.website)}>{prospect.website}</a></li>}
                </ul>
              </div>
              <div>
                <h2 className="mb-3 text-[14px] font-bold text-ink-900">Thông tin công ty</h2>
                <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
                  <dt className="text-ink-400">Quốc gia</dt><dd>{prospect.country || "Chưa rõ"}</dd>
                  <dt className="text-ink-400">Thành phố</dt><dd>{prospect.city || "Chưa rõ"}</dd>
                  <dt className="text-ink-400">Quy mô</dt><dd>{prospect.employee_range || "Chưa rõ"}</dd>
                  <dt className="text-ink-400">Nguồn</dt><dd>{prospect.source_list || "Apollo"}{prospect.apollo_id ? ` · ${prospect.apollo_id}` : ""}</dd>
                  <dt className="text-ink-400">Phụ trách</dt><dd>{prospect.owner || "Chưa phân công"}</dd>
                </dl>
                {prospect.notes && <p className="mt-4 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-600">{prospect.notes}</p>}
              </div>
            </div>
          </Card>

          <ProspectActivityForm prospectId={prospect.id} />

          <Card>
            <div className="border-b border-ink-200 px-4 py-3"><h2 className="text-[14px] font-bold text-ink-900">Lịch sử hoạt động</h2></div>
            {activities.length || emails.length ? (
              <ul className="divide-y divide-ink-100">
                {[...activities.map((item) => ({ id: item.id, created_at: item.created_at, label: `${item.channel === "linkedin" ? "LinkedIn" : item.channel === "phone" ? "Điện thoại" : item.channel === "meeting" ? "Meeting" : item.channel === "email" ? "Email" : "Ghi chú"}: ${item.summary}`, created_by: item.created_by })), ...emails.map((item) => ({ id: `mail-${item.id}`, created_at: item.created_at, label: `Email ${item.status === "received" ? "đến" : "đi"}: ${item.subject}`, created_by: item.created_by }))]
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((item) => (
                    <li key={item.id} className="flex gap-3 px-4 py-3 text-[12.5px]">
                      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                      <div className="min-w-0 flex-1"><p className="text-ink-800">{item.label}</p><p className="mt-1 text-[11px] text-ink-400">{new Date(item.created_at).toLocaleString("vi-VN")}{item.created_by ? ` · ${item.created_by}` : ""}</p></div>
                    </li>
                  ))}
              </ul>
            ) : <p className="px-4 py-8 text-center text-[12.5px] text-ink-500">Chưa có lịch sử trao đổi.</p>}
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <Card className="space-y-4 p-4">
            <ProspectStatusControl id={prospect.id} value={prospect.status} />
            {prospect.email && <Link href={`/mail/compose?prospect=${prospect.id}`} className="btn btn-primary w-full"><Mail className="h-4 w-4" />Soạn email cho prospect</Link>}
            {prospect.next_action && <div className="rounded-lg bg-amber-50 p-3 text-[12px] text-amber-900"><p className="font-semibold">Việc tiếp theo</p><p className="mt-1">{prospect.next_action}</p>{prospect.next_action_at && <p className="mt-1 text-amber-700">{new Date(prospect.next_action_at).toLocaleString("vi-VN")}</p>}</div>}
            <ProspectConversion prospectId={prospect.id} status={prospect.status} matchedBuyerId={prospect.converted_buyer_id} matchCandidates={matchCandidates} />
            {linkedBuyer && <Link className="text-[12px] font-semibold text-brand-700 hover:underline" href={`/buyers/${linkedBuyer.id}`}>Hồ sơ Buyer: {linkedBuyer.company}</Link>}
          </Card>
        </aside>
      </div>
    </>
  );
}
