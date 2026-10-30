"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductFormSessionEditor } from "@/components/products/product-form-session-editor";
import { PRODUCT_FORM_DEMOS } from "@/lib/products/product-form-demo";
import { emptyProductFormDraft } from "@/lib/products/product-form-seed";
import { DEFAULT_QUANTITY_PRICING_POLICY } from "@/lib/products/quantity-pricing";
import type { ProductFormImage, ProductFormSessionOperations } from "@/lib/products/product-form-session";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

const categories: CategoryProposalOption[] = [
  { id: "cashew", slug: "cashew-kernels", label: "Nhân điều", group: "Nông sản" },
  { id: "pepper", slug: "pepper", label: "Hồ tiêu", group: "Nông sản" },
  { id: "cinnamon", slug: "cinnamon-star-anise", label: "Quế và hồi", group: "Nông sản" },
];
const policies = Object.fromEntries(categories.map((category) => [category.slug, { ...DEFAULT_QUANTITY_PRICING_POLICY }]));
const sampleImage: ProductFormImage = { id: "demo-image", source: "staged", url: "/images/categories/cashew-grade.jpg" };

/** Browser-memory only. No API, storage service, production data or persistent writes. */
export function makePreviewOperations(editing: boolean) {
  let id: string | null = editing ? "demo-product" : null;
  let revision = editing ? 1 : 0;
  let selection: Array<Pick<ProductFormImage, "id" | "source">> = editing ? [{ id: sampleImage.id, source: sampleImage.source }] : [];
  let initialRequest: string | null = null;
  const objectUrls: string[] = [];
  const conflict = () => ({ ok: false as const, requiresReload: true, message: "Bản test đã thay đổi. Hãy tải lại trang." });
  const operations: ProductFormSessionOperations = {
    newRequestId: () => crypto.randomUUID(),
    async create(requestId) {
      if (id) return requestId === initialRequest ? { ok: true, id, revision } : conflict();
      id = crypto.randomUUID(); initialRequest = requestId; revision = 1;
      return { ok: true, id, revision };
    },
    async save(productId, expectedRevision) {
      if (!id || productId !== id || revision !== expectedRevision) return conflict();
      revision++; return { ok: true, id, revision };
    },
    async upload(productId, expectedRevision, file) {
      if (!id || productId !== id || revision !== expectedRevision) return conflict();
      const url = URL.createObjectURL(file); objectUrls.push(url);
      const image: ProductFormImage = { id: crypto.randomUUID(), source: "staged", url };
      selection = [...selection, { id: image.id, source: image.source }];
      revision++; return { ok: true, revision, image };
    },
    async setImages(productId, expectedRevision, refs) {
      if (!id || productId !== id || revision !== expectedRevision) return conflict();
      if (JSON.stringify(selection) !== JSON.stringify(refs)) { selection = refs; revision++; }
      return { ok: true, revision };
    },
    async submit(productId, expectedRevision) {
      if (!id || productId !== id || revision !== expectedRevision) return conflict();
      return { ok: true, message: "Đã mô phỏng gửi duyệt. Không có dữ liệu nào được gửi hoặc công bố." };
    },
    async translateName() {
      return { ok: false, message: "Bản test giao diện không kết nối AI. Trên hệ thống thật tên sẽ được dịch khi dịch vụ sẵn sàng." };
    },
  };
  return { operations, dispose: () => { for (const url of objectUrls) URL.revokeObjectURL(url); } };
}

function PreviewEditor({ mode }: { mode: "new" | "edit" }) {
  const editing = mode === "edit";
  const sandbox = useMemo(() => makePreviewOperations(editing), [editing]);
  useEffect(() => () => sandbox.dispose(), [sandbox]);
  const draft = editing ? { ...PRODUCT_FORM_DEMOS[0].draft,
    tiers: [{ quantity: "", price: "" }], pricePubliclyVisible: false, priceConsent: false } : emptyProductFormDraft();
  return <ProductFormSessionEditor initialDraft={draft} initialProductId={editing ? "demo-product" : null}
    initialRevision={editing ? 1 : 0} initialImages={editing ? [sampleImage] : []}
    categories={categories} policies={policies} operations={sandbox.operations} />;
}

export function ProductFormTest() {
  const [mode, setMode] = useState<"new" | "edit">("new");
  const [generation, setGeneration] = useState(0);
  function choose(next: "new" | "edit") { setMode(next); setGeneration((previous) => previous + 1); }
  return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Vexim Trade · Môi trường test riêng biệt</p>
      <h1 className="text-2xl font-bold text-ink-900">Thử form sản phẩm mới</h1>
      <p className="text-sm text-ink-600">Chọn màn tạo hoặc sửa để nhập thử và kiểm tra giao diện.</p>
    </header>
    <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
      <strong>Chỉ là bản test giao diện.</strong> Dữ liệu, ảnh, lưu nháp và gửi duyệt được mô phỏng trong trình duyệt; không ghi vào CRM hay Supabase và sẽ mất khi tải lại hoặc đổi màn. AI không kết nối trong bản này. Không nhập dữ liệu nhạy cảm.
    </div>
    <nav aria-label="Chọn màn hình test" className="flex flex-wrap gap-2">
      <button type="button" className={`btn ${mode === "new" ? "btn-primary" : "btn-soft"}`} aria-pressed={mode === "new"} onClick={() => choose("new")}>Tạo sản phẩm mới</button>
      <button type="button" className={`btn ${mode === "edit" ? "btn-primary" : "btn-soft"}`} aria-pressed={mode === "edit"} onClick={() => choose("edit")}>Sửa sản phẩm mẫu</button>
      <button type="button" className="btn btn-ghost" onClick={() => choose(mode)}>Làm lại bản test</button>
    </nav>
    {mode === "edit" && <p className="rounded-lg border border-ink-200 bg-white p-3 text-sm text-ink-700">Sản phẩm và ảnh là dữ liệu mẫu. Bảng giá để trống theo quyết định không chuyển giá demo cũ.</p>}
    <PreviewEditor key={`${mode}-${generation}`} mode={mode} />
  </main>;
}
