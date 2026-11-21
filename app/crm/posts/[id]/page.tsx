import { notFound } from "next/navigation";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { PostEditor } from "@/components/blog/post-editor";
import { listNewsRefsForSeo } from "@/lib/blog/queries";

export const dynamic = "force-dynamic";

/** Ngành lớn đang đăng, để gắn bài viết với ngành hàng. */
async function loadProductCategories() {
  const all = await getStore().listCategories({ publishedOnly: true }).catch(() => []);
  return all.filter((c) => !c.parent_id && c.status === "published" && c.is_published)
    .map((c) => ({ id: c.id, name: c.name_i18n?.vi || c.name_i18n?.en || c.slug }));
}

export const metadata = { title: "Sửa bài viết" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("blog.manage");

  const { id } = await params;
  const post = await getStore().getPost(id);
  if (!post) notFound();
  const [otherPosts, productCategories] = await Promise.all([listNewsRefsForSeo(), loadProductCategories()]);

  return (
    <div>
      <PageHeader title="Sửa bài viết" sub={`Cập nhật lần cuối: ${new Date(post.updated_at).toLocaleString("vi-VN")}`} />
      <PostEditor post={post} otherPosts={otherPosts} productCategories={productCategories} />
    </div>
  );
}
