import { requirePagePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { PostEditor } from "@/components/blog/post-editor";
import { listNewsRefsForSeo } from "@/lib/blog/queries";

import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Ngành lớn đang đăng, để gắn bài viết với ngành hàng. */
async function loadProductCategories() {
  const all = await getStore().listCategories({ publishedOnly: true }).catch(() => []);
  return all.filter((c) => !c.parent_id && c.status === "published" && c.is_published)
    .map((c) => ({ id: c.id, name: c.name_i18n?.vi || c.name_i18n?.en || c.slug }));
}

export const metadata = { title: "Viết bài mới" };

export default async function NewPostPage() {
  await requirePagePermission("blog.manage");
  const [otherPosts, productCategories] = await Promise.all([listNewsRefsForSeo(), loadProductCategories()]);

  return (
    <div>
      <PageHeader title="Viết bài mới" sub="Soạn bài theo khối, lưu nháp hoặc xuất bản khi sẵn sàng." />
      <PostEditor post={null} otherPosts={otherPosts} productCategories={productCategories} />
    </div>
  );
}
