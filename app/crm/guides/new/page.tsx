import { requirePagePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { GuideEditor } from "@/components/guides/guide-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Viết hướng dẫn mới" };

export default async function NewGuidePage() {
  await requirePagePermission("blog.manage");
  return (
    <div>
      <PageHeader title="Viết hướng dẫn mới" sub="Soạn theo khối, lưu nháp hoặc xuất bản khi sẵn sàng." />
      <GuideEditor guide={null} />
    </div>
  );
}
