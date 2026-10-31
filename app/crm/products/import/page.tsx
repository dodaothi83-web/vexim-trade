import { getStore } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Breadcrumbs, Card } from "@/components/ui";
import { PageHeader } from "@/components/page-header";

import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nhập sản phẩm từ Excel" };

export default async function ProductExcelImportPage() {
  const session = await requireSession();
  const canManage = hasPermission(session.role, "products.manage");

  if (!canManage) {
    return (
      <>
        <PageHeader
          breadcrumbs={<Breadcrumbs items={[{ label: "Sản phẩm nhà cung cấp", href: "/crm/products" }, { label: "Nhập từ Excel" }]} />}
          title="Nhập sản phẩm từ Excel"
        />
        <Card className="p-6 text-sm text-ink-600">Tài khoản của bạn không có quyền quản lý sản phẩm.</Card>
      </>
    );
  }

  const store = getStore();
  const [suppliers, categories] = await Promise.all([
    store.listSuppliers().catch(() => []),
    store.listCategories({ publishedOnly: false }).catch(() => []),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Sản phẩm nhà cung cấp", href: "/crm/products" }, { label: "Nhập từ Excel" }]} />}
        title="Nhập sản phẩm từ Excel"
        sub="Nhân viên Vexim nhập hộ sản phẩm của nhà cung cấp. File mẫu sinh theo danh mục; sản phẩm nhập vào là bản nháp chờ duyệt."
      />
      <ImportClient
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.display_name || s.name, province: s.province ?? null }))}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name_i18n?.en || c.slug }))}
      />
    </>
  );
}
