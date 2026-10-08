import Link from "next/link";
import { UserPlus } from "lucide-react";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { ProspectImporter } from "@/components/prospect-importer";
import { ProspectTable } from "@/components/prospect-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prospects" };

export default async function ProspectsPage() {
  await requirePagePermission("prospects.manage", "/dashboard");
  const prospects = await getStore().listProspects();
  return (
    <>
      <PageHeader
        title="Prospects"
        sub={`${prospects.length} liên hệ tiềm năng · chưa được tính là Buyer có nhu cầu sourcing`}
        actions={<Link href="/prospects/new" className="btn btn-primary"><UserPlus className="h-4 w-4" />Thêm prospect</Link>}
      />
      <div className="space-y-5">
        <ProspectImporter />
        <ProspectTable prospects={prospects} />
      </div>
    </>
  );
}
