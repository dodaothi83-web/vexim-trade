import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { SupplierProfileEditForm } from "../profile-edit-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chỉnh sửa hồ sơ doanh nghiệp", robots: { index: false, follow: false } };

export default async function SupplierProfileEditPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");

  return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title="Chỉnh sửa hồ sơ doanh nghiệp"
      sub="Cập nhật thông tin liên hệ, giới thiệu và thương mại. Các thông tin pháp lý và kết quả xác minh được giữ nguyên."
      actions={<Link href="/supplier/portal/profile" className="btn btn-ghost"><ArrowLeft className="h-4 w-4" />Quay lại hồ sơ</Link>} />
    <SupplierProfileEditForm supplier={access.supplier} email={access.user.email} />
  </>;
}
