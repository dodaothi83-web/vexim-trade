import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { productReadiness } from "@/lib/media/readiness";
import { Badge, Breadcrumbs, Card, cx, formatDate, formatMoney } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { MediaGallery } from "@/components/media-gallery";
import { ProductImageGallery, type GalleryImage } from "@/components/product-image-gallery";
import { isExpired } from "@/lib/media/readiness";
import {
  categoryMarketPriceUnit,
  formatGradeRowPriceVi,
  readStoredGradeRows,
} from "@/lib/products/grade-pricing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chi tiết sản phẩm" };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-3 py-1.5 text-[13px]">
      <dt className="w-40 shrink-0 text-ink-400">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink-800">{value}</dd>
    </div>
  );
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: id } = await params;
  const session = await requirePagePermission("products.view", "/crm/dashboard");
  const canManage = hasPermission(session.role, "products.manage");
  const store = getStore();
  const product = await store.getProduct(id);
  if (!product) notFound();
  const [supplier, media] = await Promise.all([
    store.getSupplier(product.supplier_id),
    store.listMedia("product", id),
  ]);
  const readiness = productReadiness(media);

  // Ảnh hiển thị ở khung lớn; tài liệu (catalogue, chứng nhận, video) vẫn ở khối bên dưới
  const galleryImages: GalleryImage[] = media
    .filter(
      (m) =>
        m.kind === "image" &&
        Boolean(m.storage_path) &&
        !isExpired(m) &&
        (m.audience === "buyer" || (canManage && m.audience === "internal")),
    )
    .map((m) => ({
      id: m.id,
      src: `/api/media/file/${m.storage_path}`,
      thumb: `/api/media/file/${m.thumb_path ?? m.storage_path}`,
      alt: m.caption || product.name,
      audience: m.audience === "internal" ? "internal" : "buyer",
    }));
  const documents = media.filter((m) => m.kind !== "image");
  const effectiveCategorySlug = product.reviewed_category_slug ?? product.category ?? product.supplier_category_proposal ?? null;
  const storedGradeRows = readStoredGradeRows(product.specs);
  const unitMeta = categoryMarketPriceUnit(effectiveCategorySlug, null);

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Sản phẩm NCC", href: "/crm/products" }, { label: product.name }]} />
        }
        title={product.name}
        sub={supplier ? `Nhà cung cấp: ${supplier.name}` : undefined}
        actions={
          canManage ? (
            <Link href={`/crm/products/${product.id}/edit`} className="btn btn-primary">
              <Pencil className="h-4 w-4" />
              Sửa
            </Link>
          ) : undefined
        }
      />
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge className={cx(readiness.ready ? "bg-emerald-600 text-white" : "bg-amber-100 text-amber-800")}>
              {readiness.ready ? "Sẵn sàng gửi buyer" : "Chưa sẵn sàng gửi buyer"}
            </Badge>
            {product.oem && <Badge className="bg-ink-100 text-ink-700">Nhận làm nhãn riêng</Badge>}
            {product.samples && <Badge className="bg-ink-100 text-ink-700">Có thể gửi mẫu</Badge>}
          </div>
          {storedGradeRows.length > 0 && (
            <div className="mb-4 overflow-x-auto rounded-lg border border-ink-200">
              <div className="border-b border-ink-200 bg-ink-50 px-3 py-2 text-xs font-bold text-ink-800">
                Grade &amp; giá ({unitMeta.unitLabel})
              </div>
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="border-b border-ink-200 bg-ink-50/70 text-[10.5px] font-bold uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="px-3 py-1.5">Grade</th>
                    <th className="px-3 py-1.5">{unitMeta.headerLabel}</th>
                    <th className="px-3 py-1.5">Incoterm</th>
                    <th className="px-3 py-1.5">MOQ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 bg-white">
                  {storedGradeRows.map((row, index) => (
                    <tr key={`${row.grade}-${index}`}>
                      <td className="px-3 py-2 font-semibold text-ink-900">
                        {row.grade}
                        {row.is_custom && (
                          <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                            Tự nhập
                          </span>
                        )}
                      </td>
                      <td className={cx("px-3 py-2 font-semibold text-ink-800", row.price_min !== null && "font-mono tabular-nums")}>
                        {formatGradeRowPriceVi(row.price_min, row.price_max, unitMeta.unitLabel)}
                      </td>
                      <td className="px-3 py-2 text-ink-700">{row.incoterm || "-"}</td>
                      <td className="px-3 py-2 text-ink-700">{row.moq || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <dl>
            <Field label="Nhóm ngành" value={product.category} />
            <Field label="Quy cách" value={product.spec} />
            <Field label="Mô tả" value={product.description} />
            <Field label="Đơn vị" value={product.unit} />
            <Field label="MOQ" value={product.moq} />
            <Field label="Sản lượng / tháng" value={product.monthly_capacity} />
            <Field label="Vùng nguyên liệu" value={product.raw_material_region} />
            <Field label="Xuất xứ nguyên liệu đầu vào" value={product.input_material_origin} />
            <Field
              label="Thời gian giao"
              value={product.lead_time_days ? `${product.lead_time_days} ngày` : null}
            />
            <Field label="Bao bì / đóng gói" value={product.packaging} />
            <Field label="Chứng nhận" value={product.certifications} />
            <Field label="Cảng xuất" value={product.export_port} />
            <Field
              label="Giá tham khảo"
              value={
                product.ref_price !== null
                  ? <><span className="font-mono tabular-nums font-semibold">{formatMoney(product.ref_price)}</span> / {product.unit || "đv"}</>
                  : null
              }
            />
            <Field label="Hiệu lực giá đến" value={product.price_valid_until ? formatDate(product.price_valid_until) : null} />
            <Field
              label="Incoterm"
              value={[product.incoterm, product.incoterm_place].filter(Boolean).join(" ") || null}
            />
            <Field label="Điều khoản thanh toán" value={product.payment_terms} />
          </dl>
          <p className="mt-3 text-[11.5px] text-ink-400">
            Giá tham khảo không phải báo giá chính thức và không tự gửi cho buyer.
          </p>
        </Card>
        <div>
          <div className="card mb-5 overflow-hidden p-4">
            <h2 className="mb-3 text-[15px] font-bold text-ink-900">Hình ảnh sản phẩm</h2>
            <ProductImageGallery images={galleryImages} />
          </div>
          <MediaGallery
            items={documents}
            title="Tài liệu"
            manageHref={canManage ? `/crm/products/${product.id}/edit` : undefined}
            emptyHint="Chưa có tài liệu nào cho sản phẩm này."
            showInternal={canManage}
          />
        </div>
      </div>
    </>
  );
}
