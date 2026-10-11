import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requirePagePermission } from "@/lib/auth/session";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { ProspectForm } from "@/components/prospect-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thêm đầu mối tiếp cận" };

export default async function NewProspectPage() {
  await requirePagePermission("prospects.manage", "/dashboard");
  return (
    <>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Khách hàng mục tiêu", href: "/prospects" }, { label: "Thêm đầu mối" }]} />}
        title="Thêm đầu mối tiếp cận"
        sub="Liên hệ tiềm năng để tiếp cận. Chưa đưa vào pipeline Buyer cho đến khi xác nhận nhu cầu sourcing."
        actions={<Link href="/prospects" className="btn btn-ghost"><ArrowLeft className="h-4 w-4" />Quay lại</Link>}
      />
      <div className="max-w-5xl"><ProspectForm /></div>
    </>
  );
}
