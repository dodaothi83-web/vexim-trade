"use server";

import { revalidatePath } from "next/cache";

import { dataStatus, getStore, resetSupabaseHealth, supabaseProbe } from "@/lib/db";
import { guard } from "@/lib/auth/session";
import { deleteObject, putObject } from "@/lib/media/storage";
import { productReadiness } from "@/lib/media/readiness";
import {
  saveDraft,
  sendManualMail,
  sendStageUpdate,
  sendSupplierAssigned,
  transport,
} from "@/lib/email/send";
import { getStage, isStage } from "@/lib/pipeline";
import type { Buyer, BuyerInput, SupplierInput, SupplierProductInput } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  message: string;
  details?: string[];
  id?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "on" || v === "1") return true;
  if (v === "false" || v === "off" || v === "0") return false;
  return fallback;
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

/* ------------------------------ BUYER ------------------------------ */

function parseBuyerInput(raw: Partial<BuyerInput> & Record<string, unknown>): BuyerInput {
  const supplierId = str(raw.supplier_id as string | null);
  return {
    company: str(raw.company) ?? "Khách chưa đặt tên",
    contact_name: str(raw.contact_name),
    email: str(raw.email),
    cc_emails: str(raw.cc_emails),
    phone: str(raw.phone),
    country: str(raw.country),
    website: str(raw.website),
    linkedin: str(raw.linkedin),
    instagram: str(raw.instagram),
    product: str(raw.product),
    spec: str(raw.spec),
    quantity: str(raw.quantity),
    target_price: str(raw.target_price),
    payment_method: str(raw.payment_method),
    payment_terms: str(raw.payment_terms),
    incoterm: str(raw.incoterm),
    port: str(raw.port),
    expected_ship_date: str(raw.expected_ship_date),
    deal_value: num(raw.deal_value),
    supplier_id: supplierId,
    hide_buyer_from_supplier: bool(raw.hide_buyer_from_supplier, true),
    stage: isStage(raw.stage) ? raw.stage : "lead",
    owner: str(raw.owner),
    source: str(raw.source),
    priority: (["low", "normal", "high"].includes(String(raw.priority))
      ? String(raw.priority)
      : "normal") as Buyer["priority"],
    next_action: str(raw.next_action),
    next_action_date: str(raw.next_action_date),
    notes: str(raw.notes),
  };
}

export async function createBuyerAction(
  raw: Partial<BuyerInput> & Record<string, unknown>,
): Promise<ActionResult & { id?: string }> {
  const gate = await guard("buyers.manage");
  if (gate) return gate;
  const input = parseBuyerInput(raw);
  if (!input.company || input.company === "Khách chưa đặt tên") {
    return { ok: false, message: "Vui lòng nhập tên công ty / buyer." };
  }
  if (input.email && !EMAIL_RE.test(input.email)) {
    return { ok: false, message: "Email buyer không hợp lệ." };
  }
  const store = getStore();
  try {
    const created = await store.createBuyer(input);
    await store.addActivity({
      buyer_id: created.id,
      type: "created",
      from_stage: null,
      to_stage: created.stage,
      message: `Tạo khách hàng "${created.company}"`,
      created_by: created.owner,
    });
    revalidateAll();
    return {
      ok: true,
      message: `Đã thêm buyer "${created.company}" vào pipeline.`,
      id: created.id,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function updateBuyerAction(
  id: string,
  raw: Partial<BuyerInput> & Record<string, unknown>,
): Promise<ActionResult> {
  const gate = await guard("buyers.manage");
  if (gate) return gate;
  const store = getStore();
  const before = await store.getBuyer(id);
  if (!before) return { ok: false, message: "Không tìm thấy khách hàng." };

  const patch = parseBuyerInput(raw);
  if (patch.email && !EMAIL_RE.test(patch.email)) {
    return { ok: false, message: "Email buyer không hợp lệ." };
  }

  try {
    const after = await store.updateBuyer(id, patch);
    if (before.supplier_id !== after.supplier_id) {
      const sup = after.supplier_id
        ? await store.getSupplier(after.supplier_id)
        : null;
      await store.addActivity({
        buyer_id: id,
        type: "supplier_change",
        message: sup
          ? `Gắn nhà cung cấp: ${sup.name}`
          : "Đã gỡ nhà cung cấp khỏi đơn",
        created_by: after.owner,
      });
    }
    revalidateAll();
    return { ok: true, message: "Đã lưu thông tin buyer." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function deleteBuyerAction(id: string): Promise<ActionResult> {
  const gate = await guard("buyers.manage");
  if (gate) return gate;
  try {
    await getStore().deleteBuyer(id);
    revalidateAll();
    return { ok: true, message: "Đã xoá buyer." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function addNoteAction(
  buyerId: string,
  text: string,
  author?: string | null,
): Promise<ActionResult> {
  const gate = await guard("buyers.manage");
  if (gate) return gate;
  const clean = str(text);
  if (!clean) return { ok: false, message: "Nội dung ghi chú trống." };
  try {
    await getStore().addActivity({
      buyer_id: buyerId,
      type: "note",
      message: clean,
      created_by: author ?? null,
    });
    revalidateAll();
    return { ok: true, message: "Đã thêm ghi chú." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/* ------------------------- THAY ĐỔI TRẠNG THÁI ----------------------- */

export interface ChangeStageOptions {
  sendEmail?: boolean;
  force?: boolean;
  note?: string | null;
  messageToBuyer?: string | null;
  messageToSupplier?: string | null;
}

export async function changeStageAction(
  buyerId: string,
  stage: string,
  options: ChangeStageOptions = {},
): Promise<ActionResult> {
  const gate = await guard("buyers.manage");
  if (gate) return gate;
  if (!isStage(stage)) return { ok: false, message: "Trạng thái không hợp lệ." };

  const store = getStore();
  const buyer = await store.getBuyer(buyerId);
  if (!buyer) return { ok: false, message: "Không tìm thấy khách hàng." };

  const from = buyer.stage;
  const details: string[] = [];

  try {
    const updated = await store.updateBuyer(buyerId, { stage });
    await store.addActivity({
      buyer_id: buyerId,
      type: "stage_change",
      from_stage: from,
      to_stage: stage,
      message: `${getStage(from).label} → ${getStage(stage).label}`,
      created_by: updated.owner,
    });

    if (options.sendEmail !== false) {
      const supplier = updated.supplier_id
        ? await store.getSupplier(updated.supplier_id)
        : null;
      const result = await sendStageUpdate({
        buyer: updated,
        supplier,
        stage,
        note: options.note ?? null,
        force: options.force,
        messageToBuyer: options.messageToBuyer,
        messageToSupplier: options.messageToSupplier,
      });
      details.push(...result.messages);
      if (result.simulated && result.sent) {
        details.unshift(
          "Chưa cấu hình RESEND_API_KEY — email được tạo ở chế độ DEMO, xem nội dung ở mục Nhật ký email.",
        );
      }
      if (result.sent) {
        await store
          .addActivity({
            buyer_id: buyerId,
            type: "email",
            message: `Gửi email cập nhật "${getStage(stage).label}" → ${
              result.buyerSent && result.supplierSent
                ? "buyer + NCC"
                : result.buyerSent
                  ? "buyer"
                  : "NCC"
            }`,
            created_by: updated.owner,
          })
          .catch(() => null);
      }
    } else {
      details.push("Không gửi email (đã tắt ở hộp thoại).");
    }

    revalidateAll();
    return {
      ok: true,
      message: `Đã chuyển "${updated.company}" sang: ${getStage(stage).label}`,
      details,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/** Gắn / gỡ nhanh NCC ngay trên danh sách */
export async function attachSupplierAction(
  buyerId: string,
  supplierId: string | null,
): Promise<ActionResult> {
  const store = getStore();
  const buyer = await store.getBuyer(buyerId);
  if (!buyer) return { ok: false, message: "Không tìm thấy khách hàng." };
  const details: string[] = [];
  try {
    await store.updateBuyer(buyerId, { supplier_id: supplierId });
    const sup = supplierId ? await store.getSupplier(supplierId) : null;
    await store.addActivity({
      buyer_id: buyerId,
      type: "supplier_change",
      message: sup ? `Gắn nhà cung cấp: ${sup.name}` : "Đã gỡ nhà cung cấp",
      created_by: buyer.owner,
    });

    // GÁN NCC => hệ thống tự bắn email cho supplier báo "có buyer đã kết nối"
    if (sup) {
      const assigned = await sendSupplierAssigned(buyer, sup);
      if (assigned.ok) {
        details.push(
          `${assigned.status === "simulated" ? "[DEMO] Đã tạo" : "Đã gửi"} email thông báo kết nối → NCC ${sup.email}`,
        );
      } else {
        details.push(`Không gửi được email kết nối cho NCC: ${assigned.error}`);
      }
    } else {
      details.push("Đã gỡ NCC — các email tiến độ từ giờ chỉ gửi tới buyer.");
    }

    revalidateAll();
    return {
      ok: true,
      message: sup
        ? `Đã gắn NCC "${sup.name}" và thông báo kết nối cho NCC.`
        : "Đã gỡ NCC khỏi đơn.",
      details,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/* ----------------------------- SUPPLIER ----------------------------- */

function parseSupplierInput(
  raw: Partial<SupplierInput> & Record<string, unknown>,
): SupplierInput {
  const rating = num(raw.rating);
  const roles = ["manufacturer", "trader", "agent", "exporter"];
  const statuses = ["new", "verifying", "verified", "paused"];
  return {
    name: str(raw.name) ?? "",
    trade_name: str(raw.trade_name),
    contact_name: str(raw.contact_name),
    contact_title: str(raw.contact_title),
    email: str(raw.email),
    phone: str(raw.phone),
    zalo: str(raw.zalo),
    website: str(raw.website),
    country: str(raw.country),
    address: str(raw.address),
    province: str(raw.province),
    role: (roles.includes(String(raw.role)) ? String(raw.role) : "manufacturer") as SupplierInput["role"],
    markets: str(raw.markets),
    products: str(raw.products),
    tax_id: str(raw.tax_id),
    payment_terms: str(raw.payment_terms),
    lead_time_days: num(raw.lead_time_days),
    rating: rating === null ? null : Math.max(1, Math.min(5, Math.round(rating))),
    notes: str(raw.notes),
    status: (statuses.includes(String(raw.status)) ? String(raw.status) : "new") as SupplierInput["status"],
  };
}

export async function createSupplierAction(
  raw: Partial<SupplierInput> & Record<string, unknown>,
): Promise<ActionResult & { id?: string }> {
  const gate = await guard("suppliers.manage");
  if (gate) return gate;
  const input = parseSupplierInput(raw);
  if (!input.name) return { ok: false, message: "Vui lòng nhập tên nhà cung cấp." };
  if (input.email && !EMAIL_RE.test(input.email)) {
    return { ok: false, message: "Email nhà cung cấp không hợp lệ." };
  }
  try {
    const created = await getStore().createSupplier(input);
    revalidateAll();
    return {
      ok: true,
      message: `Đã thêm nhà cung cấp "${created.name}".`,
      id: created.id,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function updateSupplierAction(
  id: string,
  raw: Partial<SupplierInput> & Record<string, unknown>,
): Promise<ActionResult> {
  const gate = await guard("suppliers.manage");
  if (gate) return gate;
  const input = parseSupplierInput(raw);
  if (!input.name) return { ok: false, message: "Vui lòng nhập tên nhà cung cấp." };
  if (input.email && !EMAIL_RE.test(input.email)) {
    return { ok: false, message: "Email nhà cung cấp không hợp lệ." };
  }
  try {
    await getStore().updateSupplier(id, input);
    revalidateAll();
    return { ok: true, message: "Đã lưu thông tin nhà cung cấp." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function deleteSupplierAction(id: string): Promise<ActionResult> {
  const gate = await guard("suppliers.manage");
  if (gate) return gate;
  try {
    await getStore().deleteSupplier(id);
    revalidateAll();
    return { ok: true, message: "Đã xoá nhà cung cấp." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/* ------------------------- SẢN PHẨM NCC ----------------------------- */

function parseProductInput(
  raw: Partial<SupplierProductInput> & Record<string, unknown>,
): SupplierProductInput {
  return {
    supplier_id: str(raw.supplier_id) ?? "",
    name: str(raw.name) ?? "",
    category: str(raw.category),
    description: str(raw.description),
    spec: str(raw.spec),
    unit: str(raw.unit),
    moq: str(raw.moq),
    monthly_capacity: str(raw.monthly_capacity),
    lead_time_days: num(raw.lead_time_days),
    packaging: str(raw.packaging),
    oem: bool(raw.oem, false),
    certifications: str(raw.certifications),
    export_port: str(raw.export_port),
    ref_price: num(raw.ref_price),
    currency: str(raw.currency) ?? (num(raw.ref_price) !== null ? "USD" : null),
    price_valid_until: str(raw.price_valid_until),
    incoterm: str(raw.incoterm),
    incoterm_place: str(raw.incoterm_place),
    payment_terms: str(raw.payment_terms),
    samples: bool(raw.samples, false),
    ready_for_buyer: bool(raw.ready_for_buyer, false),
  };
}

export async function createProductAction(
  raw: Partial<SupplierProductInput> & Record<string, unknown>,
): Promise<ActionResult & { id?: string }> {
  const gate = await guard("products.manage");
  if (gate) return gate;
  const input = parseProductInput(raw);
  if (!input.supplier_id) return { ok: false, message: "Thiếu nhà cung cấp." };
  if (!input.name.trim()) return { ok: false, message: "Vui lòng nhập tên sản phẩm." };
  // Hồ sơ vừa tạo chưa thể có ảnh/catalogue nên luôn bắt đầu ở trạng thái chưa sẵn sàng
  input.ready_for_buyer = false;
  try {
    const created = await getStore().createProduct(input);
    revalidateAll();
    return { ok: true, message: `Đã thêm sản phẩm “${created.name}”.`, id: created.id };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function updateProductAction(
  id: string,
  raw: Partial<SupplierProductInput> & Record<string, unknown>,
): Promise<ActionResult> {
  const gate = await guard("products.manage");
  if (gate) return gate;
  const input = parseProductInput(raw);
  if (!input.name.trim()) return { ok: false, message: "Vui lòng nhập tên sản phẩm." };
  const store = getStore();

  // Cổng chặn: chỉ bật "Sẵn sàng gửi buyer" khi đã có ảnh/catalogue chia sẻ cho buyer
  if (input.ready_for_buyer) {
    const media = await store.listMedia("product", id);
    const readiness = productReadiness(media);
    if (!readiness.ready) {
      return {
        ok: false,
        message: `Chưa thể đánh dấu “Sẵn sàng gửi buyer”: ${readiness.message}`,
      };
    }
  }

  try {
    await store.updateProduct(id, input);
    revalidateAll();
    return { ok: true, message: "Đã lưu hồ sơ sản phẩm." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  const gate = await guard("products.manage");
  if (gate) return gate;
  try {
    await getStore().deleteProduct(id);
    revalidateAll();
    return { ok: true, message: "Đã xoá sản phẩm." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/* ------------------------------ EMAIL ------------------------------- */

const EMAIL_LIST_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface MailDraftInput {
  buyerId?: string | null;
  supplierId?: string | null;
  direction: "buyer" | "supplier";
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  attachments?: { name: string; size: number; type: string; content: string }[];
  author?: string | null;
}

function cleanList(list?: string[]): string[] {
  return (list ?? [])
    .flatMap((x) => x.split(/[,;\n]/))
    .map((x) => x.trim())
    .filter(Boolean);
}

function validateMail(input: MailDraftInput): string | null {
  const to = cleanList(input.to);
  if (to.length === 0) return "Chưa có người nhận (Tới).";
  const all = [...to, ...cleanList(input.cc), ...cleanList(input.bcc)];
  const bad = all.filter((e) => !EMAIL_LIST_RE.test(e));
  if (bad.length) return `Địa chỉ email không hợp lệ: ${bad.join(", ")}`;
  if (!input.subject || !input.subject.trim()) return "Chưa có tiêu đề email.";
  const text = input.bodyHtml.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  if (!text) return "Nội dung email đang trống.";
  const totalSize = (input.attachments ?? []).reduce((s, a) => s + (a.size || 0), 0);
  if (totalSize > 10 * 1024 * 1024) return "Tổng dung lượng file đính kèm vượt quá 10MB.";
  return null;
}

export async function sendMailAction(input: MailDraftInput): Promise<ActionResult> {
  const gate = await guard("mail.send");
  if (gate) return gate;
  const err = validateMail(input);
  if (err) return { ok: false, message: err };

  const res = await sendManualMail({
    buyerId: input.buyerId ?? null,
    supplierId: input.supplierId ?? null,
    direction: input.direction,
    to: cleanList(input.to),
    cc: cleanList(input.cc),
    bcc: cleanList(input.bcc),
    subject: input.subject.trim(),
    bodyHtml: input.bodyHtml,
    attachments: input.attachments,
    author: input.author ?? null,
  });

  if (res.ok && input.buyerId) {
    await getStore()
      .addActivity({
        buyer_id: input.buyerId,
        type: "email",
        message: `Gửi email thủ công: ${input.subject.trim()}`,
        created_by: input.author ?? null,
      })
      .catch(() => null);
  }
  revalidateAll();

  if (!res.ok) return { ok: false, message: `Gửi thất bại: ${res.error}` };
  return {
    ok: true,
    message:
      res.status === "simulated"
        ? "[DEMO] Email đã được tạo — chưa cấu hình Resend nên chưa gửi thật."
        : `Đã gửi tới ${cleanList(input.to).join(", ")}`,
  };
}

export async function saveDraftAction(input: MailDraftInput): Promise<ActionResult> {
  const gate = await guard("mail.send");
  if (gate) return gate;
  const id = await saveDraft({
    buyerId: input.buyerId ?? null,
    supplierId: input.supplierId ?? null,
    direction: input.direction,
    to: cleanList(input.to),
    cc: cleanList(input.cc),
    bcc: cleanList(input.bcc),
    subject: input.subject.trim() || "(không có tiêu đề)",
    bodyHtml: input.bodyHtml,
    attachments: input.attachments,
    author: input.author ?? null,
  });
  revalidateAll();
  return id
    ? { ok: true, message: "Đã lưu bản nháp.", id }
    : { ok: false, message: "Không lưu được bản nháp." };
}

export async function deleteMessageAction(id: string): Promise<ActionResult> {
  const gate = await guard("mail.send");
  if (gate) return gate;
  try {
    await getStore().deleteMessage(id);
    revalidateAll();
    return { ok: true, message: "Đã xoá email." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function resendMessageAction(id: string): Promise<ActionResult> {
  const gate = await guard("mail.send");
  if (gate) return gate;
  const store = getStore();
  const msg = await store.getMessage(id);
  if (!msg) return { ok: false, message: "Không tìm thấy email." };
  const res = await transport({
    to: msg.to_emails,
    cc: msg.cc_emails,
    bcc: msg.bcc_emails,
    subject: msg.subject,
    html: msg.body_html,
    text: msg.body_text,
    attachments: msg.attachments,
  });
  await store
    .updateMessage(id, {
      status: res.status,
      provider: res.provider,
      error: res.error,
      sent_at: res.ok ? new Date().toISOString() : msg.sent_at,
    })
    .catch(() => null);
  revalidateAll();
  if (!res.ok) return { ok: false, message: `Gửi lại thất bại: ${res.error}` };
  return {
    ok: true,
    message:
      res.status === "simulated"
        ? "[DEMO] Đã tạo lại email (chưa cấu hình Resend)."
        : "Đã gửi lại thành công.",
  };
}


/* --------------------------- KẾT NỐI SUPABASE --------------------------- */

/**
 * Xoá trạng thái "mất kết nối Supabase" đã ghi nhớ rồi tải lại giao diện, để
 * lần render kế tiếp thử lại Supabase ngay (dùng cho nút "Thử kết nối lại" ở
 * trang Cài đặt — không cần khởi động lại app).
 */
export async function retrySupabaseAction(): Promise<ActionResult> {
  const gate = await guard("settings.view");
  if (gate) return gate;
  resetSupabaseHealth();
  await supabaseProbe();
  revalidateAll();
  const status = dataStatus();
  return status.mode === "supabase"
    ? { ok: true, message: "Đã kết nối lại Supabase — dữ liệu thật đang được dùng." }
    : {
        ok: false,
        message: "Vẫn chưa kết nối được Supabase từ máy chạy app.",
        details: status.reason ? [status.reason] : undefined,
      };
}

/* ------------------------------ MEDIA ------------------------------- */

/**
 * Gắn link video vào hồ sơ (video không tải tệp lên — chỉ lưu link).
 */
export async function addMediaLinkAction(input: {
  ownerType: "product" | "supplier";
  ownerId: string;
  url: string;
  caption?: string | null;
  audience?: "buyer" | "internal";
}): Promise<ActionResult> {
  const gate = await guard("media.manage");
  if (gate) return gate;
  const url = (input.url ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: "Link video không hợp lệ (cần bắt đầu bằng http/https)." };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, message: "Link video không hợp lệ." };
  }
  if (input.ownerType !== "product" && input.ownerType !== "supplier") {
    return { ok: false, message: "Đối tượng không hợp lệ." };
  }

  try {
    await getStore().createMedia({
      owner_type: input.ownerType,
      product_id: input.ownerType === "product" ? input.ownerId : null,
      supplier_id: input.ownerType === "supplier" ? input.ownerId : null,
      kind: "video",
      audience: input.audience ?? "buyer",
      status: "unverified",
      expires_on: null,
      caption: (input.caption ?? "").trim() || parsed.hostname,
      storage_path: null,
      thumb_path: null,
      external_url: parsed.toString(),
      mime: null,
      bytes: null,
      width: null,
      height: null,
      sort_order: 0,
      created_by: null,
    });
    revalidateAll();
    return { ok: true, message: "Đã thêm link video (trạng thái: chưa xác minh)." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/** Sửa chú thích / trạng thái xác minh / người xem / ngày hết hạn của một tệp. */
export async function updateMediaAction(
  id: string,
  patch: {
    caption?: string | null;
    status?: "unverified" | "checked" | "expired";
    audience?: "buyer" | "internal";
    expires_on?: string | null;
  },
): Promise<ActionResult> {
  const gate = await guard("media.manage");
  if (gate) return gate;
  const store = getStore();
  try {
    const current = await store.getMedia(id);
    if (!current) return { ok: false, message: "Không tìm thấy tệp." };

    const next: typeof patch = { ...patch };
    // Giấy tờ nội bộ không bao giờ được chuyển sang chia sẻ buyer
    if (current.kind === "document") next.audience = "internal";

    await store.updateMedia(id, next);
    revalidateAll();
    return { ok: true, message: "Đã cập nhật tệp." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/** Xoá tệp khỏi hồ sơ và khỏi kho lưu trữ. */
export async function deleteMediaAction(id: string): Promise<ActionResult> {
  const gate = await guard("media.manage");
  if (gate) return gate;
  const store = getStore();
  try {
    const asset = await store.getMedia(id);
    if (!asset) return { ok: false, message: "Không tìm thấy tệp." };

    // Nếu sản phẩm đang ở trạng thái "sẵn sàng gửi buyer" thì kiểm tra lại sau khi xoá
    await store.deleteMedia(id);
    for (const path of [asset.storage_path, asset.thumb_path]) {
      if (path) {
        await deleteObject(path).catch(() => null);
      }
    }

    if (asset.product_id) {
      const product = await store.getProduct(asset.product_id);
      if (product?.ready_for_buyer) {
        const media = await store.listMedia("product", asset.product_id);
        if (!productReadiness(media).ready) {
          await store.updateProduct(asset.product_id, { ready_for_buyer: false });
        }
      }
    }

    revalidateAll();
    return { ok: true, message: "Đã xoá tệp." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/** Thử lưu lại tệp từ client (dùng khi trình duyệt gửi kèm ảnh đã nén). */
export async function storeMediaFileAction(
  path: string,
  base64: string,
  mime: string,
): Promise<ActionResult> {
  try {
    const bytes = new Uint8Array(Buffer.from(base64, "base64"));
    await putObject(path, bytes, mime);
    return { ok: true, message: "Đã lưu tệp." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}
