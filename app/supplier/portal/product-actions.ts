"use server";

import { revalidatePath } from "next/cache";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { assignProductCategory, assignSupplierCategories } from "@/lib/public/category-assignment";
import type { SupplierProduct, SupplierProductInput } from "@/lib/types";

type Result = { ok: boolean; message: string; id?: string };
const text = (form: FormData, key: string, limit: number) => String(form.get(key) ?? "").trim().slice(0, limit);

function parseProduct(form: FormData, supplierId: string): SupplierProductInput {
  const name = text(form, "name", 180);
  if (name.length < 3) throw new Error("Tên sản phẩm cần ít nhất 3 ký tự.");
  const daysRaw = text(form, "lead_time_days", 5);
  if (daysRaw && (!/^\d+$/.test(daysRaw) || Number(daysRaw) > 3650)) throw new Error("Thời gian giao hàng không hợp lệ.");
  const priceRaw = text(form, "ref_price", 20);
  if (priceRaw && (!/^\d+(?:\.\d{1,2})?$/.test(priceRaw) || Number(priceRaw) > 1e12)) throw new Error("Giá tham khảo không hợp lệ.");
  const validUntil = text(form, "price_valid_until", 10);
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) throw new Error("Ngày hết hạn giá không hợp lệ.");
  return {
    supplier_id: supplierId, name, slug: null, name_i18n: {}, category: null,
    description: text(form, "description", 1500) || null, spec: text(form, "spec", 800) || null,
    specs: {}, unit: text(form, "unit", 40) || null, moq: text(form, "moq", 180) || null,
    moq_qty: null, moq_unit: null, monthly_capacity: text(form, "monthly_capacity", 180) || null,
    lead_time_days: daysRaw ? Number(daysRaw) : null, packaging: text(form, "packaging", 300) || null,
    oem: form.get("oem") === "yes", samples: form.get("samples") === "yes",
    certifications: text(form, "certifications", 300) || null, export_port: text(form, "export_port", 120) || null,
    ref_price: priceRaw ? Number(priceRaw) : null, currency: priceRaw ? (text(form, "currency", 10) || "USD") : null,
    price_valid_until: validUntil || null, incoterm: text(form, "incoterm", 20) || null,
    incoterm_place: text(form, "incoterm_place", 100) || null,
    payment_terms: text(form, "payment_terms", 200) || null,
    ready_for_buyer: false, supplier_review_status: "draft", supplier_review_note: null, images: [],
  };
}

async function approvedAccess() {
  const access = await supplierPortalAccess();
  return access && portalApproved(access.supplier) ? access : null;
}

/** Supplier can create/edit only its own draft; staff decides review, media sharing and buyer readiness. */
export async function saveSupplierProductAction(form: FormData): Promise<Result> {
  const access = await approvedAccess();
  if (!access) return { ok: false, message: "Tài khoản NCC chưa được Vexim xác nhận." };
  try {
    const id = text(form, "product_id", 80);
    const store = access.store;
    const existing: SupplierProduct | null = id ? await store.getProduct(id) : null;
    if (id && (!existing || existing.supplier_id !== access.supplier.id)) return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
    if (existing?.supplier_review_status === "pending") return { ok: false, message: "Sản phẩm đang chờ Vexim kiểm tra; chưa thể sửa." };
    const input = parseProduct(form, access.supplier.id);
    const categories = await store.listCategories({ publishedOnly: false });
    const linked = await store.listSupplierCategories(access.supplier.id);
    const linkedSlugs = linked.map((row) => categories.find((c) => c.id === row.category_id)?.slug).filter((v): v is string => !!v);
    const fallback = linkedSlugs.length ? linkedSlugs : assignSupplierCategories(access.supplier.products, [], categories).slugs;
    input.category = assignProductCategory(input, categories, fallback)?.slug ?? null;
    const saved = existing ? await store.updateProduct(existing.id, {
      ...input, // Reset review and buyer-ready in the same DB write, even when previously public.
      slug: existing.slug, name_i18n: {}, specs: {}, images: existing.images,
    }) : await store.createProduct(input);
    await store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: saved.id, action: existing ? "supplier.product_updated" : "supplier.product_created",
      before: existing ? { review: existing.supplier_review_status, ready: existing.ready_for_buyer } : null,
      after: { review: "draft", ready: false } }).catch((error) => console.error("[supplier-product] audit", error));
    revalidatePath("/supplier/portal/products");
    revalidatePath(`/supplier/portal/products/${saved.id}`);
    revalidatePath(`/crm/products/${saved.id}/edit`);
    return { ok: true, id: saved.id, message: "Đã lưu bản nháp. Tải ảnh/catalogue thực tế rồi gửi Vexim kiểm tra." };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Không lưu được sản phẩm." }; }
}

export async function submitSupplierProductAction(form: FormData): Promise<Result> {
  const access = await approvedAccess();
  if (!access) return { ok: false, message: "Tài khoản NCC chưa được Vexim xác nhận." };
  const id = text(form, "product_id", 80);
  const store = access.store;
  try {
    const product = await store.getProduct(id);
    if (!product || product.supplier_id !== access.supplier.id) return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
    if (product.supplier_review_status !== "draft" && product.supplier_review_status !== "changes_requested") return { ok: false, message: "Sản phẩm không ở trạng thái cho phép nộp." };
    if (!product.name || !(product.spec || product.description)) return { ok: false, message: "Cần tên và mô tả/quy cách thực tế." };
    const media = await store.listMedia("product", id);
    if (!media.some((m) => (m.kind === "image" || m.kind === "catalogue") && m.storage_path && m.supplier_id === access.supplier.id)) {
      return { ok: false, message: "Cần ít nhất một ảnh sản phẩm hoặc catalogue thật trước khi nộp." };
    }
    await store.updateProduct(id, { supplier_review_status: "pending", supplier_review_note: null, ready_for_buyer: false });
    await store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: id, action: "supplier.product_submitted",
      before: { review: product.supplier_review_status }, after: { review: "pending" } }).catch((error) => console.error("[supplier-product] audit", error));
    revalidatePath("/supplier/portal/products");
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath(`/crm/products/${id}/edit`);
    return { ok: true, message: "Đã gửi Vexim kiểm tra sản phẩm. Chưa được công khai." };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Không nộp được sản phẩm." }; }
}
