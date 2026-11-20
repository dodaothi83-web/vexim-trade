import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { getPortalMessages } from "@/lib/i18n/server";
import { SupplierProfileEditForm } from "../profile-edit-form";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.profile.edit.title, robots: { index: false, follow: false } };
}

export default async function SupplierProfileEditPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { locale, m } = await getPortalMessages();
  const copy = m.profile.edit;

  return <>
    <PageHeader eyebrow={m.profile.eyebrow} title={copy.title} sub={copy.sub}
      actions={<Link href="/supplier/portal/profile" className="btn btn-ghost"><ArrowLeft className="h-4 w-4" />{copy.back}</Link>} />
    <SupplierProfileEditForm supplier={access.supplier} email={access.user.email} messages={copy} types={m.shared.supplierTypes} lang={locale} />
  </>;
}
