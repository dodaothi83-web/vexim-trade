import Link from "next/link";
import { UserPlus } from "lucide-react";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { isOwnedBy, ownerScopeOf } from "@/lib/auth/scope";
import { PageHeader } from "@/components/page-header";
import { ProspectImporter } from "@/components/prospect-importer";
import { ProspectTable } from "@/components/prospect-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khách hàng mục tiêu" };

export default async function ProspectsPage() {
  const session = await requirePagePermission("prospects.manage", "/dashboard");
  const scope = ownerScopeOf(session);
  const prospects = (await getStore().listProspects()).filter((p) => isOwnedBy(p.owner, scope));
  return (
    <>
      <PageHeader
        title="Khách hàng mục tiêu"
        sub={`${prospects.length} doanh nghiệp và đầu mối đang được tiếp cận, chưa xác nhận nhu cầu sourcing và chưa vào pipeline Buyer`}
        actions={<Link href="/prospects/new" className="btn btn-primary"><UserPlus className="h-4 w-4" />Thêm đầu mối tiếp cận</Link>}
      />
      <div className="space-y-5">
        <ProspectImporter />
        <ProspectTable prospects={prospects} />
      </div>
    </>
  );
}
