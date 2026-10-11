import Link from "next/link";
import { UserPlus } from "lucide-react";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { isOwnedBy, ownerScopeOf } from "@/lib/auth/scope";
import { PageHeader } from "@/components/page-header";
import { ProspectImporter } from "@/components/prospect-importer";
import { listSalesOwnerNames } from "@/lib/queries";
import { ProspectTable } from "@/components/prospect-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khách hàng mục tiêu" };

export default async function ProspectsPage() {
  const session = await requirePagePermission("prospects.manage", "/dashboard");
  const scope = ownerScopeOf(session);
  const [prospects, owners] = await Promise.all([
    getStore().listProspects().then((all) => all.filter((p) => isOwnedBy(p.owner, scope))),
    scope === null ? listSalesOwnerNames() : Promise.resolve([] as string[]),
  ]);
  return (
    <>
      <PageHeader
        title="Khách hàng mục tiêu"
        sub={`${prospects.length} doanh nghiệp và đầu mối đang được tiếp cận, chưa xác nhận nhu cầu sourcing và chưa vào pipeline Buyer`}
        actions={<Link href="/prospects/new" className="btn btn-primary"><UserPlus className="h-4 w-4" />Thêm đầu mối tiếp cận</Link>}
      />
      <div className="space-y-5">
        <ProspectImporter owners={owners} />
        <ProspectTable prospects={prospects} />
      </div>
    </>
  );
}
