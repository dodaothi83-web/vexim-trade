"use server";

import { revalidatePath } from "next/cache";

import { getSession, guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { designerMessages } from "@/lib/i18n/portal/designer";
import { validateStorefrontLayout } from "@/lib/storefront-layout";
import { notifySupplierStorefrontDesigned } from "@/lib/supplier-portal/notify";
import {
  activeDesignConsent, applyStorefrontLayout, CONSENT_METHODS, CONSENT_SCOPES, getStorefrontVersion, layoutProblemMessage,
  recordDesignConsent, revokeDesignConsent, saveStorefrontDraft, verifyLayoutVideos,
} from "@/lib/supplier-portal/storefront-design";
import { supplierPlanRules } from "@/lib/supplier-plans";

type Result = { ok: boolean; message: string };
const copy = designerMessages.vi;

/**
 * Vexim thiết kế hộ trang nhà cung cấp (dịch vụ bán ngoài hệ thống). Mọi thao tác cần quyền
 * suppliers.manage; sửa và áp dụng cần đồng ý đang hiệu lực và gói Premium/Pro còn hạn.
 */
async function staff() {
  const denied = await guard("suppliers.manage");
  if (denied) return { error: denied.message } as const;
  const session = await getSession();
  if (!session) return { error: "Phiên đăng nhập đã hết hạn." } as const;
  return { session } as const;
}

function refresh(supplierId: string, slug?: string | null) {
  revalidatePath(`/crm/suppliers/${supplierId}/design`);
  revalidatePath(`/crm/suppliers/${supplierId}`);
  revalidatePath("/supplier/portal/storefront");
  revalidatePath("/supplier/portal/storefront/design");
  if (slug) revalidatePath(`/suppliers/${slug}`);
}

const field = (form: FormData, name: string, max: number) => String(form.get(name) ?? "").trim().slice(0, max);

export async function recordDesignConsentAction(supplierId: string, form: FormData): Promise<Result> {
  const who = await staff();
  if ("error" in who) return { ok: false, message: who.error! };
  const representative = field(form, "representative", 160);
  const consentedOn = field(form, "consented_on", 10);
  const method = field(form, "method", 20);
  const evidence = field(form, "evidence", 300);
  const scope = field(form, "scope", 30);
  if (!representative || !evidence) return { ok: false, message: "Điền người đại diện và bằng chứng đồng ý." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(consentedOn) || Date.parse(consentedOn) > Date.now() + 86_400_000) return { ok: false, message: "Ngày đồng ý không hợp lệ." };
  if (!(CONSENT_METHODS as readonly string[]).includes(method) || !(CONSENT_SCOPES as readonly string[]).includes(scope)) return { ok: false, message: "Hình thức hoặc phạm vi không hợp lệ." };
  if (form.get("confirm") !== "yes") return { ok: false, message: "Đánh dấu xác nhận nhà cung cấp đã đồng ý." };
  const supplier = await getStore().getSupplier(supplierId);
  if (!supplier) return { ok: false, message: "Không tìm thấy nhà cung cấp." };
  try {
    const consent = await recordDesignConsent({ supplierId, representative, consented_on: consentedOn,
      method: method as (typeof CONSENT_METHODS)[number], evidence, scope: scope as (typeof CONSENT_SCOPES)[number],
      recordedBy: who.session.uid, recordedByEmail: who.session.email });
    await getStore().addAuditLog({ actor_id: who.session.uid, actor_email: who.session.email, entity: "supplier", entity_id: supplierId,
      action: "staff.design_consent_recorded", before: null, after: { consent_id: consent.id, representative, consented_on: consentedOn, method, evidence, scope } })
      .catch((error) => console.error("[crm-design] audit", error));
  } catch (error) {
    console.error("[crm-design] consent", error);
    return { ok: false, message: "Chưa ghi nhận được. Kiểm tra migration storefront designer." };
  }
  refresh(supplierId);
  return { ok: true, message: "Đã ghi nhận đồng ý. Trình thiết kế đã mở." };
}

export async function revokeDesignConsentAction(supplierId: string, consentId: string): Promise<Result> {
  const who = await staff();
  if ("error" in who) return { ok: false, message: who.error! };
  try {
    await revokeDesignConsent(supplierId, consentId, who.session.email);
  } catch (error) {
    console.error("[crm-design] revoke", error);
    return { ok: false, message: "Chưa thu hồi được." };
  }
  await getStore().addAuditLog({ actor_id: who.session.uid, actor_email: who.session.email, entity: "supplier", entity_id: supplierId,
    action: "staff.design_consent_revoked", before: { consent_id: consentId }, after: null }).catch(() => null);
  refresh(supplierId);
  return { ok: true, message: "Đã thu hồi đồng ý. Trình thiết kế đã khoá." };
}

/** Kiểm tra quyền, đồng ý, gói và nội dung trước khi lưu hoặc áp dụng thay nhà cung cấp. */
async function prepare(supplierId: string, raw: unknown) {
  const who = await staff();
  if ("error" in who) return { ok: false as const, message: who.error! };
  const store = getStore();
  const supplier = await store.getSupplier(supplierId);
  if (!supplier) return { ok: false as const, message: "Không tìm thấy nhà cung cấp." };
  if (!supplierPlanRules(supplier).premiumStorefront) return { ok: false as const, message: "Nhà cung cấp chưa có gói Premium/Pro còn hiệu lực." };
  const consent = await activeDesignConsent(supplierId);
  if (!consent) return { ok: false as const, message: "Chưa ghi nhận nhà cung cấp đồng ý cho Vexim thiết kế hộ." };
  const products = await store.listProductsBySupplier(supplierId);
  const checked = validateStorefrontLayout(raw, { supplierId, productIds: new Set(products.filter((p) => p.supplier_id === supplierId).map((p) => p.id)),
    pro: supplierPlanRules(supplier).plan === "pro" });
  if (!checked.ok) return { ok: false as const, message: layoutProblemMessage(checked.problem, copy.errors) };
  const videos = await verifyLayoutVideos(checked.layout, supplier);
  if (!videos.ok) return { ok: false as const, message: videos.index === null ? copy.errors.videoUnavailable : layoutProblemMessage({ code: "video", index: videos.index }, copy.errors) };
  return { ok: true as const, who, store, supplier, consent, layout: videos.layout };
}

export async function saveDesignDraftAction(supplierId: string, raw: unknown): Promise<Result> {
  const ready = await prepare(supplierId, raw);
  if (!ready.ok) return ready;
  try {
    await saveStorefrontDraft(ready.store, supplierId, ready.layout);
  } catch (error) {
    console.error("[crm-design] draft", error);
    return { ok: false, message: copy.failed };
  }
  revalidatePath(`/crm/suppliers/${supplierId}/design`);
  return { ok: true, message: "Đã lưu nháp. Người mua và nhà cung cấp chưa thấy thay đổi trên trang." };
}

export async function applyDesignAction(supplierId: string, raw: unknown): Promise<Result> {
  const ready = await prepare(supplierId, raw);
  if (!ready.ok) return ready;
  const { who, store, supplier, consent, layout } = ready;
  try {
    await applyStorefrontLayout(store, supplier, layout, { id: who.session.uid, email: who.session.email, role: "staff",
      note: `Theo thoả thuận ${consent.consented_on} · ${consent.evidence}`, consentId: consent.id });
    await store.updateSupplier(supplierId, { storefront_staff_applied_at: new Date().toISOString() });
  } catch (error) {
    console.error("[crm-design] apply", error);
    return { ok: false, message: copy.failed };
  }
  await store.addAuditLog({ actor_id: who.session.uid, actor_email: who.session.email, entity: "supplier", entity_id: supplierId,
    action: "staff.storefront_applied", before: null, after: { consent_id: consent.id, blocks: layout.blocks.map((b) => b.type) } })
    .catch((error) => console.error("[crm-design] audit", error));
  const mail = await notifySupplierStorefrontDesigned({ supplierId, supplierName: supplier.name, consentedOn: consent.consented_on });
  refresh(supplierId, supplier.slug || supplier.id);
  return { ok: true, message: mail === "failed"
    ? "Đã áp dụng. Nhà cung cấp thấy thông báo trong cổng; chưa gửi được email (kiểm tra tài khoản cổng của họ)."
    : "Đã áp dụng. Nhà cung cấp nhận thông báo trong cổng và email." };
}

export async function restoreDesignVersionAction(supplierId: string, versionId: string): Promise<Result> {
  const who = await staff();
  if ("error" in who) return { ok: false, message: who.error! };
  const version = await getStorefrontVersion(supplierId, String(versionId ?? ""));
  if (!version?.layout) return { ok: false, message: "Không tìm thấy phiên bản." };
  return applyDesignAction(supplierId, version.layout);
}
