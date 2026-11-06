import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { getPortalMessages } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.chat.metaTitle, robots: { index: false, follow: false } };
}

/** Tin nhắn với người mua (thay cho email trực tiếp của "Ask supplier"). */
export default async function SupplierMessagesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { intl, m } = await getPortalMessages();
  const { c } = await searchParams;
  return <>
    <PageHeader title={m.chat.title} sub={m.chat.sub} />
    <ChatWorkspace side="supplier" labels={m.chat} locale={intl} initialId={c && /^[0-9a-f-]{8,64}$/i.test(c) ? c : null} />
  </>;
}
