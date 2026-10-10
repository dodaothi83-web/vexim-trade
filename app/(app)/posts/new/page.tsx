import { requirePagePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { PostEditor } from "@/components/blog/post-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Viết bài mới" };

export default async function NewPostPage() {
  await requirePagePermission("blog.manage");

  return (
    <div>
      <PageHeader title="Viết bài mới" sub="Soạn bài theo khối, lưu nháp hoặc xuất bản khi sẵn sàng." />
      <PostEditor post={null} />
    </div>
  );
}
