import { notFound } from "next/navigation";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { GuideEditor } from "@/components/guides/guide-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sửa hướng dẫn" };

export default async function EditGuidePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("blog.manage");
  const { id } = await params;
  const guide = await getStore().getSupplierGuide(id);
  if (!guide) notFound();
  return (
    <div>
      <PageHeader title="Sửa hướng dẫn" sub={`Cập nhật lần cuối: ${new Date(guide.updated_at).toLocaleString("vi-VN")}`} />
      <GuideEditor guide={guide} />
    </div>
  );
}
