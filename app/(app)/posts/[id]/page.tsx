import { notFound } from "next/navigation";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { PostEditor } from "@/components/blog/post-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sửa bài viết" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("blog.manage");

  const { id } = await params;
  const post = await getStore().getPost(id);
  if (!post) notFound();

  return (
    <div>
      <PageHeader title="Sửa bài viết" sub={`Cập nhật lần cuối: ${new Date(post.updated_at).toLocaleString("vi-VN")}`} />
      <PostEditor post={post} />
    </div>
  );
}
