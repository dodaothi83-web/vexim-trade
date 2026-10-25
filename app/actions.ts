"use server";

import { revalidatePath } from "next/cache";

import { refreshCrmBadges } from "@/lib/crm/badges";

import { dataStatus, getStore, resetSupabaseHealth, supabaseProbe } from "@/lib/db";
import { categorySchemaError } from "@/lib/db/category-schema-error";
import { saveProductAttributes, validateProductFields } from "@/lib/product-attributes";
import { assignProductCategory, assignSupplierCategories } from "@/lib/public/category-assignment";
import { isPlaceholderDisplayName } from "@/lib/public/display-name";
import { parseHarvestInput } from "@/lib/crm/harvest-input";
import { getSession, guard } from "@/lib/auth/session";
import { isOwnedBy, ownerScopeOf } from "@/lib/auth/scope";
import { MAX_FILES_PER_MAIL, MAX_TOTAL_BYTES, loadForSend, toRef } from "@/lib/mail/attachments";
import { deleteObject } from "@/lib/media/storage";
import { verificationMediaEditError } from "@/lib/media/verification-access";
import { isExpired, productReadiness } from "@/lib/media/readiness";
import { generateCompanyIntroduction } from "@/lib/ai/company-introduction";
import {
  buildFirstTouchLetter,
  joinProducts,
  subjectFormOf,
  toEnglishProduct,
  type FirstTouchMode,
  type SubjectForm,
} from "@/lib/ai/first-touch-draft";
import { extractCompanyProducts, type CompanyProducts } from "@/lib/ai/company-products";
import { productTranslationState } from "@/lib/ai/translate-content";
import { ensureProductEnglishTranslation } from "@/lib/ai/product-translation-service";
import { ensureSupplierProfileEnglish, type EnsureSupplierTranslationResult } from "@/lib/ai/supplier-translation-service";
import { readSiteSignals } from "@/lib/ai/site-signals";
import { hasPermission } from "@/lib/auth/permissions";
import { nextStatusOptions, statusMeta } from "@/lib/supplier";
import {
  resolveSender,
  saveDraft,
  updateDraft,
  sendManualMail,
  sendStageUpdate,
  sendSupplierAssigned,
  transport,
} from "@/lib/email/send";
import { getStage, isStage } from "@/lib/pipeline";
import { notifyRecipients } from "@/lib/mail/inbound";
import { isMyMail, type MailViewer } from "@/lib/mail/visibility";
import { loadMailboxData } from "@/lib/mail/mailbox-access";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import type {
  Buyer,
  Prospect,
  ProspectCompanySource,
  ProspectProductScan,
  BuyerInput,
  ProspectInput,
  ProspectActivityChannel,
  EmailAttachment,
  Supplier,
  SupplierInput,
  SupplierProductInput,
  Verification,
  Category,
  MediaOwnerType,
} from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  message: string;
  details?: string[];
  id?: string;
}

export interface SupplierSaveResult extends ActionResult {
  /** Dữ liệu sau cả bước dịch để form không ghi đè bản AI bằng giá trị cũ trong trình duyệt. */
  supplier?: Supplier;
  translationStatus?: EnsureSupplierTranslationResult["status"];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Tên hiển thị rỗng hoặc là chỗ trống ("Chưa xác định") thì coi như chưa soạn. */
function displayNameInput(v: unknown): string | null {
  const text = str(v);
  if (!text || isPlaceholderDisplayName(text)) return null;
  return text.slice(0, 120);
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

/** Nhân viên kinh doanh chỉ thao tác buyer mình phụ trách. Trả về lỗi nếu không được phép. */
async function denyIfNotOwnedBuyer(buyerId: string): Promise<ActionResult | null> {
  const scope = ownerScopeOf(await getSession());
  if (scope === null) return null;
  const buyer = await getStore().getBuyer(buyerId);
  if (!buyer || !isOwnedBy(buyer.owner, scope)) {
    return { ok: false, message: "Bạn không phụ trách buyer này." };
  }
  return null;
}

export async function createBuyerAction(
  raw: Partial<BuyerInput> & Record<string, unknown>,
): Promise<ActionResult & { id?: string }> {
  const gate = await guard("buyers.manage");
  if (gate) return gate;
  const input = parseBuyerInput(raw);
  const actor = await getSession();
  if (ownerScopeOf(actor) !== null) input.owner = actor?.name?.trim() || null;
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
  const denied = await denyIfNotOwnedBuyer(id);
  if (denied) return denied;
  const store = getStore();
  const before = await store.getBuyer(id);
  if (!before) return { ok: false, message: "Không tìm thấy khách hàng." };

  const patch = parseBuyerInput(raw);
  if (patch.email && !EMAIL_RE.test(patch.email)) {
    return { ok: false, message: "Email buyer không hợp lệ." };
  }
  // Nhân viên sale không tự chuyển buyer sang người khác; chỉ quản trị viên đổi phụ trách
  if (ownerScopeOf(await getSession()) !== null) patch.owner = before.owner;

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
  const denied = await denyIfNotOwnedBuyer(id);
  if (denied) return denied;
  try {
    await getStore().deleteBuyer(id);
    revalidateAll();
    return { ok: true, message: "Đã xoá buyer." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

const PROSPECT_STATUSES = [
  "new", "researched", "ready", "contacted", "replied", "meeting", "qualified",
  "converted", "disqualified", "unsubscribed",
] as const;
const PROSPECT_CHANNELS = ["email", "linkedin", "phone", "meeting", "note"] as const;

function cleanProspectInput(raw: Partial<ProspectInput>, owner: string | null): ProspectInput {
  const status = PROSPECT_STATUSES.includes(raw.status as (typeof PROSPECT_STATUSES)[number])
    ? raw.status!
    : "new";
  return {
    company: str(raw.company) ?? "",
    contact_name: str(raw.contact_name),
    contact_title: str(raw.contact_title),
    email: str(raw.email)?.toLowerCase() ?? null,
    email_status: str(raw.email_status),
    phone: str(raw.phone),
    country: str(raw.country),
    city: str(raw.city),
    website: str(raw.website),
    linkedin_url: str(raw.linkedin_url),
    company_linkedin_url: str(raw.company_linkedin_url),
    industry: str(raw.industry),
    employee_range: str(raw.employee_range),
    apollo_id: str(raw.apollo_id),
    data_source: str(raw.data_source) ?? "Tự nhập",
    source_list: str(raw.source_list),
    target_product: str(raw.target_product),
    status,
    owner: str(raw.owner) ?? owner,
    next_action: str(raw.next_action),
    next_action_at: str(raw.next_action_at),
    notes: str(raw.notes),
    converted_buyer_id: str(raw.converted_buyer_id),
  };
}

function normalizeMatch(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

export async function createProspectAction(raw: Partial<ProspectInput>): Promise<ActionResult & { id?: string }> {
  const gate = await guard("prospects.manage");
  if (gate) return gate;
  const session = await getSession();
  const forcedOwner = ownerScopeOf(session) !== null ? (session?.name ?? null) : undefined;
  const input = cleanProspectInput({ ...raw, status: "new", converted_buyer_id: null, owner: forcedOwner !== undefined ? forcedOwner : (str(raw.owner) ?? null) }, forcedOwner ?? null);
  if (!input.company) return { ok: false, message: "Vui lòng nhập tên công ty." };
  if (!input.email) return { ok: false, message: "Cần có email để thêm đầu mối vào danh sách." };
  if (!EMAIL_RE.test(input.email)) return { ok: false, message: "Email không hợp lệ." };
  try {
    const prospect = await getStore().createProspect(input);
    revalidateAll();
    return { ok: true, message: "Đã thêm đầu mối tiếp cận.", id: prospect.id };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Không thêm được đầu mối tiếp cận." };
  }
}

export async function importProspectsAction(rawRows: Partial<ProspectInput>[], lineOffset = 0): Promise<ActionResult & {
  created?: number;
  skipped?: number;
  matchedBuyers?: string[];
  duplicates?: string[];
  errors?: string[];
}> {
  const gate = await guard("prospects.manage");
  if (gate) return gate;
  if (!Array.isArray(rawRows) || rawRows.length === 0) return { ok: false, message: "Tệp không có dòng dữ liệu." };
  if (rawRows.length > 3000) return { ok: false, message: "Mỗi lần chỉ nhập tối đa 3.000 dòng." };
  const safeOffset = Number.isInteger(lineOffset) && lineOffset >= 0 && lineOffset <= 3000 ? lineOffset : 0;

  const session = await getSession();
  const store = getStore();
  const [existingProspects, buyers] = await Promise.all([store.listProspects(), store.listBuyers()]);
  // Lưu luôn người đang phụ trách để báo rõ khi dòng bị trùng
  const ownerLabel = (owner: string | null | undefined) => (owner ?? "").trim() || "chưa phân công";
  const seenEmails = new Map<string, string>();
  const seenLinks = new Map<string, string>();
  const seenApollo = new Map<string, string>();
  for (const p of existingProspects) {
    const label = `${p.contact_name || p.company} (phụ trách: ${ownerLabel(p.owner)})`;
    const e = normalizeMatch(p.email);
    const l = normalizeMatch(p.linkedin_url);
    const a = normalizeMatch(p.apollo_id);
    if (e && !seenEmails.has(e)) seenEmails.set(e, label);
    if (l && !seenLinks.has(l)) seenLinks.set(l, label);
    if (a && !seenApollo.has(a)) seenApollo.set(a, label);
  }
  const buyerEmails = new Map<string, string>();
  const buyerLinks = new Map<string, string>();
  for (const buyer of buyers) {
    const email = normalizeMatch(buyer.email);
    const link = normalizeMatch(buyer.linkedin);
    const label = `${buyer.company} (phụ trách: ${ownerLabel(buyer.owner)})`;
    if (email) buyerEmails.set(email, label);
    if (link) buyerLinks.set(link, label);
  }
  const errors: string[] = [];
  const matchedBuyers: string[] = [];
  const duplicates: string[] = [];
  let created = 0;
  let skipped = 0;

  const pending: { input: ProspectInput; line: number }[] = [];
  for (let i = 0; i < rawRows.length; i += 1) {
    const forcedOwner = ownerScopeOf(session) !== null ? (session?.name ?? null) : undefined;
    const rowOwner = forcedOwner !== undefined ? forcedOwner : (str(rawRows[i]?.owner) ?? null);
    const input = cleanProspectInput({ ...(rawRows[i] ?? {}), status: "new", converted_buyer_id: null, owner: rowOwner }, forcedOwner ?? null);
    const line = safeOffset + i + 2;
    if (!input.company) { errors.push(`Dòng ${line}: thiếu tên công ty.`); skipped += 1; continue; }
    if (!input.email) { errors.push(`Dòng ${line}: thiếu email, đã bỏ qua.`); skipped += 1; continue; }
    if (!EMAIL_RE.test(input.email)) { errors.push(`Dòng ${line}: email không hợp lệ, đã bỏ qua.`); skipped += 1; continue; }

    const emailKey = normalizeMatch(input.email);
    const linkKey = normalizeMatch(input.linkedin_url);
    const apolloKey = normalizeMatch(input.apollo_id);
    const selfLabel = `${input.contact_name || input.company} (phụ trách: ${ownerLabel(input.owner)})`;
    const dupLabel =
      (emailKey && seenEmails.get(emailKey)) ||
      (linkKey && seenLinks.get(linkKey)) ||
      (apolloKey && seenApollo.get(apolloKey)) ||
      null;
    if (dupLabel) {
      duplicates.push(`Dòng ${line}: ${input.contact_name || input.company} đã có: ${dupLabel}`);
      skipped += 1;
      continue;
    }
    const buyerMatch = (emailKey && buyerEmails.get(emailKey)) || (linkKey && buyerLinks.get(linkKey));
    if (buyerMatch) {
      matchedBuyers.push(`${input.contact_name || input.company} → Buyer hiện có: ${buyerMatch}`);
      skipped += 1;
      continue;
    }

    pending.push({ input: { ...input, source_list: input.source_list || "Apollo" }, line });
    if (emailKey) seenEmails.set(emailKey, selfLabel);
    if (linkKey) seenLinks.set(linkKey, selfLabel);
    if (apolloKey) seenApollo.set(apolloKey, selfLabel);
  }

  if (pending.length) {
    try {
      const prospects = await store.createProspects(pending.map(({ input }) => input));
      created += prospects.length;
      await store.addProspectActivities(prospects.map((prospect, index) => ({
        prospect_id: prospect.id,
        channel: "note" as const,
        summary: `Nhập từ Apollo${pending[index]?.input.source_list ? `: ${pending[index].input.source_list}` : ""}.`,
        created_by: session?.email ?? null,
      }))).catch(() => []);
    } catch (err) {
      skipped += pending.length;
      const message = err instanceof Error ? err.message : "lỗi lưu dữ liệu";
      errors.push(...pending.map(({ line }) => `Dòng ${line}: ${message}`));
    }
  }

  revalidateAll();
  return {
    ok: true,
    message: `Đã nhập ${created} đầu mối. Bỏ qua ${skipped} dòng trùng hoặc không hợp lệ.`,
    created,
    skipped,
    matchedBuyers,
    duplicates,
    errors,
  };
}

/** Nhân viên kinh doanh chỉ thao tác prospect mình phụ trách. */
async function denyIfNotOwnedProspect(prospectId: string): Promise<ActionResult | null> {
  const scope = ownerScopeOf(await getSession());
  if (scope === null) return null;
  const prospect = (await getStore().listProspects()).find((p) => p.id === prospectId);
  if (!prospect || !isOwnedBy(prospect.owner, scope)) {
    return { ok: false, message: "Bạn không phụ trách khách hàng mục tiêu này." };
  }
  return null;
}

export async function updateProspectAction(id: string, patch: Partial<ProspectInput>): Promise<ActionResult> {
  const gate = await guard("prospects.manage");
  if (gate) return gate;
  const denied = await denyIfNotOwnedProspect(id);
  if (denied) return denied;
  const allowedStatus = patch.status === undefined || PROSPECT_STATUSES.includes(patch.status as (typeof PROSPECT_STATUSES)[number]);
  if (!allowedStatus) return { ok: false, message: "Trạng thái tiếp cận không hợp lệ." };
  if (patch.status === "converted") return { ok: false, message: "Dùng thao tác đưa vào pipeline để liên kết Buyer và giữ lịch sử." };
  if (patch.status !== undefined) {
    const current = await getStore().getProspect(id);
    if (!current) return { ok: false, message: "Không tìm thấy đầu mối tiếp cận." };
    if (current.status === "converted") return { ok: false, message: "Đầu mối này đã được liên kết với Buyer, không thể mở lại trạng thái tiếp cận." };
  }
  try {
    const safePatch: Partial<ProspectInput> = {};
    if (patch.status !== undefined) safePatch.status = patch.status;
    if (patch.owner !== undefined && ownerScopeOf(await getSession()) === null) safePatch.owner = str(patch.owner);
    if (patch.next_action !== undefined) safePatch.next_action = str(patch.next_action);
    if (patch.next_action_at !== undefined) safePatch.next_action_at = str(patch.next_action_at);
    if (patch.notes !== undefined) safePatch.notes = str(patch.notes);
    await getStore().updateProspect(id, safePatch);
    revalidateAll();
    return { ok: true, message: "Đã cập nhật thông tin đầu mối." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Không cập nhật được đầu mối tiếp cận." };
  }
}

export async function addProspectActivityAction(input: {
  prospectId: string;
  channel: ProspectActivityChannel;
  summary: string;
}): Promise<ActionResult> {
  const gate = await guard("prospects.manage");
  if (gate) return gate;
  const deniedActivity = await denyIfNotOwnedProspect(input.prospectId);
  if (deniedActivity) return deniedActivity;
  if (!PROSPECT_CHANNELS.includes(input.channel)) return { ok: false, message: "Kênh liên hệ không hợp lệ." };
  const summary = str(input.summary);
  if (!summary) return { ok: false, message: "Vui lòng ghi nội dung trao đổi." };
  const session = await getSession();
  try {
    const store = getStore();
    await store.addProspectActivity({ prospect_id: input.prospectId, channel: input.channel, summary, created_by: session?.email ?? null });
    const prospect = await store.getProspect(input.prospectId);
    if (prospect && input.channel === "meeting" && ["new", "researched", "ready", "contacted", "replied"].includes(prospect.status)) {
      await store.updateProspect(input.prospectId, { status: "meeting" });
    } else if (prospect && ["new", "researched", "ready"].includes(prospect.status)) {
      await store.updateProspect(input.prospectId, { status: "contacted" });
    }
    revalidateAll();
    return { ok: true, message: "Đã ghi nhận lần liên hệ." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Không lưu được hoạt động." };
  }
}

export async function linkProspectToBuyerAction(prospectId: string, buyerId: string): Promise<ActionResult> {
  const gate = await guard("prospects.manage");
  if (gate) return gate;
  const denied = await denyIfNotOwnedProspect(prospectId);
  if (denied) return denied;
  const store = getStore();
  const [prospect, buyer] = await Promise.all([store.getProspect(prospectId), store.getBuyer(buyerId)]);
  if (!prospect || !buyer) return { ok: false, message: "Không tìm thấy đầu mối tiếp cận hoặc Buyer." };
  if (!prospect.email?.trim()) return { ok: false, message: "Đầu mối cần có email mới được liên kết với Buyer." };
  if (prospect.status !== "qualified") {
    return { ok: false, message: "Chỉ liên kết với Buyer khi đầu mối đã được xác nhận có nhu cầu sourcing thực tế." };
  }
  try {
    await store.updateProspect(prospectId, { status: "converted", converted_buyer_id: buyerId });
    const session = await getSession();
    await store.addProspectActivity({
      prospect_id: prospectId,
      channel: "note",
      summary: `Đã liên kết với Buyer hiện có: ${buyer.company}.`,
      created_by: session?.email ?? null,
    });
    revalidateAll();
    return { ok: true, message: `Đã liên kết với Buyer ${buyer.company}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Không liên kết được Buyer." };
  }
}

export async function convertProspectAction(prospectId: string): Promise<ActionResult & { buyerId?: string; matched?: boolean }> {
  const gate = await guard("prospects.manage");
  if (gate) return gate;
  const denied = await denyIfNotOwnedProspect(prospectId);
  if (denied) return denied;
  const store = getStore();
  const prospect = await store.getProspect(prospectId);
  if (!prospect) return { ok: false, message: "Không tìm thấy đầu mối tiếp cận." };
  if (!prospect.email?.trim()) return { ok: false, message: "Đầu mối cần có email trước khi vào pipeline Buyer." };
  if (prospect.status !== "qualified") {
    return { ok: false, message: "Chỉ đưa vào pipeline Buyer khi đã xác nhận nhu cầu sourcing thực tế." };
  }
  const buyers = await store.listBuyers();
  const emailKey = normalizeMatch(prospect.email);
  const linkKey = normalizeMatch(prospect.linkedin_url);
  const match = buyers.find((b) => (emailKey && normalizeMatch(b.email) === emailKey) || (linkKey && normalizeMatch(b.linkedin) === linkKey));
  try {
    let buyerId = match?.id;
    if (!buyerId) {
      const buyer = await store.createBuyer({
        company: prospect.company,
        contact_name: prospect.contact_name,
        email: prospect.email,
        cc_emails: null,
        phone: prospect.phone,
        country: prospect.country,
        website: prospect.website,
        linkedin: prospect.linkedin_url,
        instagram: null,
        product: null,
        spec: null,
        quantity: null,
        target_price: null,
        payment_method: null,
        payment_terms: null,
        incoterm: null,
        port: null,
        expected_ship_date: null,
        deal_value: null,
        supplier_id: null,
        hide_buyer_from_supplier: true,
        stage: "lead",
        owner: prospect.owner,
        source: [
          `Nguồn dữ liệu: ${prospect.data_source || "Chưa rõ"}`,
          prospect.source_list ? `Tệp tiếp cận: ${prospect.source_list}` : null,
          prospect.target_product ? `Nhóm hàng mục tiêu: ${prospect.target_product}` : null,
        ].filter(Boolean).join("; "),
        priority: "normal",
        next_action: null,
        next_action_date: null,
        notes: prospect.notes,
      });
      buyerId = buyer.id;
    }
    await store.updateProspect(prospect.id, { status: "converted", converted_buyer_id: buyerId });
    await store.addProspectActivity({
      prospect_id: prospect.id,
      channel: "note",
      summary: match ? `Đã ghép với Buyer hiện có: ${match.company}.` : `Đã chuyển thành Buyer mới: ${prospect.company}.`,
      created_by: (await getSession())?.email ?? null,
    });
    revalidateAll();
    return {
      ok: true,
      message: match ? `Đã liên kết đầu mối với Buyer hiện có ${match.company}.` : "Đã đưa đầu mối vào pipeline Buyer.",
      buyerId,
      matched: Boolean(match),
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Không thể đưa đầu mối vào pipeline Buyer." };
  }
}

function prospectCompanyIdentity(company: string, website: string | null, country: string | null): string {
  if (website) {
    try {
      const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
      return url.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      // Fall back to company name when the stored website is malformed.
    }
  }
  return `${company.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${(country ?? "").toLowerCase().trim()}`;
}

export async function generateProspectCompanyIntroductionAction(
  id: string,
  refresh = false,
): Promise<ActionResult & {
  summary?: string;
  sources?: { title: string; url: string }[];
  analyzedAt?: string;
  reused?: boolean;
  /** Danh mục + dạng hàng đọc từ website buyer (nguồn để điền thư tiếp cận) */
  products?: string[];
  group?: string | null;
  form?: "finished" | "raw" | "mixed" | "unknown";
  evidence?: string | null;
  imagesSeen?: number;
}> {
  const gate = await guard("prospects.manage");
  if (gate) return gate;
  const store = getStore();
  const prospect = await store.getProspect(id);
  if (!prospect) return { ok: false, message: "Không tìm thấy đầu mối tiếp cận." };

  if (prospect.ai_company_summary && !refresh) {
    return {
      ok: true,
      message: "Đã tải phần giới thiệu đã lưu.",
      summary: prospect.ai_company_summary,
      sources: prospect.ai_company_sources ?? [],
      analyzedAt: prospect.ai_company_analyzed_at ?? undefined,
      reused: true,
    };
  }

  if (!refresh) {
    const identity = prospectCompanyIdentity(prospect.company, prospect.website, prospect.country);
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const peer = (await store.listProspects()).find((candidate) =>
      candidate.id !== id
      && prospectCompanyIdentity(candidate.company, candidate.website, candidate.country) === identity
      && Boolean(candidate.ai_company_summary)
      && Boolean(candidate.ai_company_analyzed_at)
      && new Date(candidate.ai_company_analyzed_at!).getTime() >= cutoff,
    );
    if (peer?.ai_company_summary) {
      const analyzedAt = peer.ai_company_analyzed_at ?? new Date().toISOString();
      const sources = peer.ai_company_sources ?? [];
      await store.updateProspect(id, {
        ai_company_summary: peer.ai_company_summary,
        ai_company_sources: sources,
        ai_company_analyzed_at: analyzedAt,
      });
      revalidatePath(`/prospects/${id}`);
      return { ok: true, message: "Đã dùng phần giới thiệu gần đây của cùng công ty.", summary: peer.ai_company_summary, sources, analyzedAt, reused: true };
    }
  }

  try {
    const result = await generateCompanyIntroduction({
      company: prospect.company,
      website: prospect.website,
      country: prospect.country,
    });
    const analyzedAt = new Date().toISOString();
    await store.updateProspect(id, {
      ai_company_summary: result.summary,
      ai_company_sources: result.sources,
      ai_company_analyzed_at: analyzedAt,
    });
    // Cùng lúc thì quét luôn website + ảnh sản phẩm: đây là thứ thư tiếp cận cần, bấm một lần
    const scan = await ensureCompanyScan({
      company: prospect.company,
      website: prospect.website,
      country: prospect.country,
      context: prospect.industry ? `ngành ghi trong hồ sơ: ${prospect.industry}` : null,
      prospectId: id,
      cached: prospect.ai_products ?? null,
      refresh: true,
    });
    revalidatePath(`/prospects/${id}`);
    revalidatePath("/prospects");
    return {
      ok: true,
      message: scan.scan.products.length
        ? `Đã tạo phần giới thiệu công ty và đọc được ${scan.scan.products.length} sản phẩm trên website.`
        : "Đã tạo phần giới thiệu công ty. Chưa đọc được sản phẩm nào từ website của họ.",
      summary: result.summary,
      sources: result.sources,
      analyzedAt,
      reused: false,
      products: scan.scan.products,
      group: scan.scan.group,
      form: scan.scan.form,
      evidence: scan.scan.evidence,
      imagesSeen: scan.scan.imagesSeen,
    };
  } catch (err) {
    console.error("[company-introduction] không phân tích được:", err);
    const detail = err instanceof Error ? err.message : "";
    if (/ai_company_(summary|sources|analyzed_at)/i.test(detail) && /column|schema cache|does not exist/i.test(detail)) {
      return { ok: false, message: "Chưa cập nhật cấu trúc dữ liệu. Hãy chạy migration 20261008_prospect_company_ai.sql trong Supabase." };
    }
    return { ok: false, message: detail || "Không phân tích được công ty lúc này." };
  }
}

/* ---------------- AI: VIẾT EMAIL TIẾP CẬN ĐẦU TIÊN ---------------- */

/** Thư theo mẫu cố định — AI chỉ được điền ô "sản phẩm + dạng hàng của buyer", không viết văn */
type CompanyScan = Pick<CompanyProducts, "products" | "group" | "form" | "evidence" | "note" | "imagesSeen">;

const BLANK_SCAN: CompanyScan = { products: [], group: null, form: "unknown", evidence: null, note: null, imagesSeen: 0 };

/** Bản quét website dùng lại trong 90 ngày, cùng tuổi với quy tắc của nút "Xem công ty" */
const AI_SCAN_FRESH_DAYS = 90;

function isFreshScan(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && Date.now() - time <= AI_SCAN_FRESH_DAYS * 86_400_000;
}

function toScanShape(record: ProspectProductScan | null | undefined): CompanyScan & { sources: ProspectCompanySource[] } {
  return {
    products: Array.isArray(record?.products) ? record!.products.slice(0, 6) : [],
    group: record?.group ?? null,
    form: record?.form ?? "unknown",
    evidence: record?.evidence ?? null,
    note: record?.note ?? null,
    imagesSeen: record?.images_seen ?? 0,
    sources: Array.isArray(record?.sources) ? record!.sources : [],
  };
}

/** Ghép một dòng tín hiệu cho prompt, bỏ khi dữ liệu trống */
function signal(label: string, value: string | null | undefined, max = 400): string {
  const raw = (value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  return `${label}: ${raw.length > max ? `${raw.slice(0, max).trimEnd()}…` : raw}`;
}

/**
 * Sản phẩm mà công ty buyer đang cung cấp — ô duy nhất AI được phép "tìm" cho thư.
 * - Prospect: có chỗ lưu (prospects.ai_products) nên chỉ tốn một lần gọi web, lần sau dùng lại.
 * - Buyer thường: biểu mẫu chưa có cột lưu -> quét cho lần viết này, không ghi vào hồ sơ.
 * Quét lỗi KHÔNG chặn viết thư: thân thư vẫn dựng đúng mẫu, chỉ để placeholder để người soạn
 * điền tay (thà có chỗ trống nhìn thấy còn hơn một câu bịa).
 */
async function ensureCompanyScan(options: {
  company: string;
  website: string | null;
  country: string | null;
  context: string | null;
  prospectId: string | null;
  cached: ProspectProductScan | null | undefined;
  refresh: boolean;
}): Promise<{ scan: CompanyScan & { sources: ProspectCompanySource[] }; scanned: boolean; error: string | null }> {
  const fresh = toScanShape(options.cached);
  if (!options.refresh && options.prospectId && isFreshScan(options.cached?.scanned_at) && fresh.products.length > 0) {
    return { scan: fresh, scanned: false, error: null };
  }
  try {
    // 1) tự đọc website buyer: danh mục bằng chữ + vài ảnh sản phẩm để model NHÌN
    const signals = await readSiteSignals(options.website);
    // Không có gì để đọc (chưa nhập website, site chết, không phải HTML) thì KHÔNG gọi model:
    // model sẽ phải đoán, mà đoán trong thư chào lạnh là mất khách.
    const nothingToRead =
      Boolean(signals.error) && !signals.productNames.length && !signals.headings.length && !signals.images.length;
    if (nothingToRead) {
      return { scan: { ...BLANK_SCAN, note: signals.error, sources: [] }, scanned: false, error: signals.error };
    }
    // 2) một lần gọi model với cả chữ lẫn ảnh
    const result = await extractCompanyProducts({
      company: options.company,
      country: options.country,
      signals,
      context: [options.context, signals.error ? `lỗi đọc website: ${signals.error}` : ""].filter(Boolean).join(" · ") || null,
    });
    const scan = {
      products: result.products.slice(0, 6),
      group: result.group,
      form: result.form,
      evidence: result.evidence,
      note: result.note ?? signals.error,
      imagesSeen: result.imagesSeen,
      sources: result.sources,
    };
    if (options.prospectId) {
      await getStore()
        .updateProspect(options.prospectId, {
          ai_products: {
            products: scan.products,
            group: scan.group,
            form: scan.form,
            evidence: scan.evidence,
            note: scan.note,
            images_seen: scan.imagesSeen,
            sources: scan.sources,
            scanned_at: new Date().toISOString(),
          },
        })
        .catch(() => null);
      revalidatePath(`/prospects/${options.prospectId}`);
      revalidatePath("/prospects");
    }
    return {
      scan: scan.note ? scan : { ...scan, note: signals.error },
      scanned: true,
      error: signals.error && !scan.products.length ? signals.error : null,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "";
    return { scan: { ...BLANK_SCAN, sources: [] }, scanned: false, error: detail || "không truy cập được website của công ty" };
  }
}

/**
 * Nhu cầu buyer để lại trong hồ sơ -> câu mở đầu phần 2.
 * Số lượng/điều khoản chỉ thêm khi không chứa tiếng Việt (thư 100% tiếng Anh),
 * phần bị lệch ngôn ngữ nhân viên sẽ thấy và sửa.
 */
function statedNeedLine(buyer: Buyer | null): string | null {
  if (!buyer) return null;
  const product = toEnglishProduct([buyer.product, buyer.spec].filter(Boolean).join(" — "));
  if (!product) return null;
  const quantity = (buyer.quantity ?? "").trim();
  const asciiOnly = Boolean(quantity) && !/[^\x00-\x7F]/.test(quantity);
  const incoterm = (buyer.incoterm ?? "").trim();
  const port = (buyer.port ?? "").trim();
  // "CIF Hamburg" + cảng "Hamburg" là một — ghép lặp lại trông rất lỗi
  const terms = !port || incoterm.toLowerCase().includes(port.toLowerCase()) ? incoterm : `${incoterm} ${port}`;
  const termsAscii = Boolean(terms) && !/[^\x00-\x7F]/.test(terms);
  const extras = [asciiOnly ? quantity : "", termsAscii ? terms : ""].filter(Boolean);
  return extras.length ? `${product} (${extras.join(", ")})` : product;
}

/** Dạng tiêu đề của lá thư buyer gần nhất cho hồ sơ này — để không lặp lại cùng một dạng */
async function lastBuyerSubjectForm(ids: {
  buyerId: string | null;
  prospectId: string | null;
  email: string | null;
}): Promise<SubjectForm | null> {
  const store = getStore();
  const messages = await Promise.resolve(store.listMessages(200)).catch(() => []);
  const recent = (messages as {
    direction: string;
    status: string;
    subject: string;
    created_at: string;
    buyer_id: string | null;
    prospect_id?: string | null;
    to_emails: string[];
  }[])
    .filter((m) => m.direction === "buyer" && m.status !== "draft")
    .filter(
      (m) =>
        (ids.buyerId && m.buyer_id === ids.buyerId) ||
        (ids.prospectId && m.prospect_id === ids.prospectId) ||
        (ids.email && (m.to_emails ?? []).some((address) => (address ?? "").toLowerCase() === ids.email)),
    )
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
  return recent ? subjectFormOf(recent.subject) : null;
}

/**
 * Nút "AI viết tiếp cận" trong trình soạn.
 *
 * Nguyên tắc:
 * - Nội dung thư CỐ ĐỊNH theo mẫu bên mình chốt (lib/ai/first-touch-draft.ts). Model chỉ
 *   đọc website buyer để lấy tên sản phẩm + nhóm hàng; không có dữ liệu thì để placeholder.
 * - Hai luồng: khách hàng mục tiêu -> "tôi biết ông đang cung cấp X"; buyer đã để lại nhu cầu
 *   -> "ông đã hỏi X".
 * - Không đổi pipeline, không lưu nội dung thư. Riêng bản quét sản phẩm thì lưu vào hồ sơ đầu
 *   mối (cột prospects.ai_products) để dùng lại 90 ngày và để nhân viên đối chiếu.
 * - Không tên/giá nhà cung cấp, không số liệu thương mại: đây là thư chào lạnh.
 */
export async function generateFirstTouchDraftAction(input: {
  buyerId?: string | null;
  prospectId?: string | null;
  email?: string | null;
  /** true = quét lại website buyer, bỏ cache trong hồ sơ */
  refresh?: boolean;
}): Promise<ActionResult & {
  subject?: string;
  body?: string;
  words?: number;
  who?: string;
  missing?: string[];
  mode?: FirstTouchMode;
  scanned?: boolean;
  scanNote?: string | null;
}> {
  const gate = await guard("mail.send");
  if (gate) return gate;
  const session = await getSession();
  if (!session) {
    return { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
  }

  const store = getStore();
  const canSeeProspects = hasPermission(session.role, "prospects.manage");
  const email = (str(input.email) ?? "").toLowerCase();
  const list = <T,>(promise: Promise<T[]>): Promise<T[]> => promise.catch(() => [] as T[]);

  let buyer = input.buyerId ? await store.getBuyer(input.buyerId).catch(() => null) : null;
  let prospect = input.prospectId ? await store.getProspect(input.prospectId).catch(() => null) : null;

  // Soạn tự do (gõ địa chỉ nhận): khớp hồ sơ theo email
  if ((!buyer || !prospect) && EMAIL_RE.test(email)) {
    const [buyers, prospects] = await Promise.all([
      buyer ? Promise.resolve([] as Buyer[]) : list(store.listBuyers()),
      prospect || !canSeeProspects ? Promise.resolve([] as Prospect[]) : list(store.listProspects()),
    ]);
    if (!buyer) buyer = buyers.find((b) => (b.email ?? "").trim().toLowerCase() === email) ?? null;
    if (!prospect) prospect = prospects.find((pr) => (pr.email ?? "").trim().toLowerCase() === email) ?? null;
  }

  // Buyer từng là đầu mối thì bản quét sản phẩm/phan tích nằm ở hồ sơ đầu mối
  if (buyer && !prospect && canSeeProspects) {
    const buyerEmail = (buyer.email ?? "").trim().toLowerCase();
    const buyerCompany = (buyer.company ?? "").trim().toLowerCase();
    prospect =
      (await list(store.listProspects())).find(
        (pr) =>
          (buyerEmail && (pr.email ?? "").trim().toLowerCase() === buyerEmail) ||
          (buyerCompany && (pr.company ?? "").trim().toLowerCase() === buyerCompany),
      ) ?? null;
  }

  const holder = buyer ?? prospect;
  if (!holder) {
    return {
      ok: false,
      message: "Chưa tìm thấy hồ sơ buyer cho địa chỉ này. Chọn buyer/đầu mối từ danh sách để AI viết đúng.",
    };
  }
  const company = str(holder.company) ?? "";
  if (!company && !str(holder.contact_name)) {
    return { ok: false, message: "Hồ sơ chưa có tên công ty hay người nhận để viết thư." };
  }

  // ---- 1. Buyer đã để lại nhu cầu thì nhắc lại nhu cầu; chưa có thì đọc website của họ ----
  const need = statedNeedLine(buyer);
  const mode: FirstTouchMode = need ? "demand" : "target";

  let scan: CompanyScan & { sources: ProspectCompanySource[] } = { ...BLANK_SCAN, sources: [] };
  let scanned = false;
  let scanError: string | null = null;

  if (mode === "target") {
    const segmentHint = [str(prospect?.industry), str(prospect?.notes), signal("Hồ sơ lấy từ danh sách", prospect?.data_source)]
      .filter(Boolean)
      .join(" · ");
    const result = await ensureCompanyScan({
      company,
      website: str(holder.website),
      country: str(holder.country),
      // target_product CHỈ là giả định để định hướng tìm, không phải bằng chứng về ngành của họ
      context: [segmentHint, str(prospect?.target_product) ? `target segment in our list: ${str(prospect?.target_product)}` : ""]
        .filter(Boolean)
        .join(" · ") || null,
      prospectId: prospect?.id ?? null,
      cached: prospect?.ai_products ?? null,
      refresh: Boolean(input.refresh),
    });
    scan = result.scan;
    scanned = result.scanned;
    scanError = result.error;
  }

  // ---- 2. Dựng thư theo khung cố định ----
  const productInterest = [str(buyer?.product), str(prospect?.target_product)].filter(Boolean).join(" · ") || null;
  const productsText = joinProducts(scan.products) || null;
  const group = scan.group || toEnglishProduct(productInterest) || null;
  const avoidSubjectForm = await lastBuyerSubjectForm({
    buyerId: buyer?.id ?? null,
    prospectId: prospect?.id ?? null,
    email: email || str(holder.email) || null,
  });

  const letter = buildFirstTouchLetter(
    {
      recipientName: str(holder.contact_name),
      senderName: str(session.name),
      company: company || null,
      products: productsText,
      group,
      statedNeed: need,
      form: scan.form,
    },
    {
      // Chỉ tên hàng — quy cách/số lượng dài sẽ làm tiêu đề vụn khi cắt còn 8 từ
      product: toEnglishProduct(buyer?.product ?? "") || group,
      company: company || null,
      moq: buyer?.quantity ?? null,
      avoidForm: avoidSubjectForm,
    },
  );

  const missingNote = letter.missing.length
    ? ` Còn chỗ trống ${letter.missing.join(", ")} — anh/chị điền tay nhé.`
    : "";
  const formLabel =
    scan.form === "finished"
      ? "hàng thành phẩm có nhãn"
      : scan.form === "raw"
        ? "nông sản thô / chưa chín"
        : scan.form === "mixed"
          ? "cả thành phẩm lẫn hàng thô"
          : "chưa rõ dạng hàng";
  const scanNote = scanError
    ? `Không đọc được website (${scanError}).`
    : scanned
      ? `Đã đọc website${scan.imagesSeen ? ` và ${scan.imagesSeen} ảnh sản phẩm` : " (không tải được ảnh)"}: ${scan.products.length} sản phẩm, ${formLabel}${scan.evidence ? ` — ${scan.evidence}` : ""}.`
      : scan.note;
  const basis =
    mode === "demand"
      ? "Thư nhắc lại đúng nhu cầu buyer để lại trong hồ sơ (mẫu cố định)"
      : productsText
        ? `Thư chào theo mẫu cố định, có ${scan.products.length} sản phẩm đọc từ website của họ`
        : "Thư chào theo mẫu cố định — chưa đọc được sản phẩm nào từ website của họ";

  return {
    ok: true,
    message: `${basis}. Bản nháp ${letter.words} từ.${missingNote}${scanNote ? ` ${scanNote}` : ""}`,
    subject: letter.subject,
    body: letter.body,
    words: letter.words,
    who: company || "buyer",
    missing: letter.missing,
    mode,
    scanned,
    scanNote,
  };
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
  const denied = await denyIfNotOwnedBuyer(buyerId);
  if (denied) return denied;
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
  const gate = await guard("buyers.manage");
  if (gate) return gate;
  const denied = await denyIfNotOwnedBuyer(buyerId);
  if (denied) return denied;

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
  const types = ["manufacturer", "trading", "cooperative"];
  const statuses = [
    "new","verifying","verified","paused",
    "draft","submitted","in_verification","published","suspended","archived",
  ];
  function arr(v: unknown): string[] {
    if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
    if (typeof v === "string") return v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    return [];
  }
  function i18n(v: unknown): Record<string, string> {
    if (v && typeof v === "object") return v as Record<string, string>;
    return { en: typeof v === "string" ? v : "" };
  }
  const slug = str(raw.slug);
  return {
    name: str(raw.name) ?? "",
    trade_name: str(raw.trade_name),
    display_name: str(raw.display_name),
    slug: slug ? slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : null,
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
    supplier_type: raw.supplier_type && types.includes(String(raw.supplier_type))
      ? String(raw.supplier_type) as SupplierInput["supplier_type"]
      : null,
    markets: str(raw.markets),
    products: str(raw.products),
    tax_id: str(raw.tax_id),
    payment_terms: str(raw.payment_terms),
    lead_time_days: num(raw.lead_time_days),
    rating: rating === null ? null : Math.max(1, Math.min(5, Math.round(rating))),
    notes: str(raw.notes),
    status: (statuses.includes(String(raw.status)) ? String(raw.status) : "draft") as SupplierInput["status"],
    founded_year: num(raw.founded_year),
    employees: num(raw.employees),
    summary_i18n: i18n(raw.summary_i18n),
    intro_source: str(raw.intro_source)?.slice(0, 1500) ?? null,
    moq_text: str(raw.moq_text),
    capacity_per_month: str(raw.capacity_per_month),
    ports: arr(raw.ports),
    incoterms: arr(raw.incoterms),
    export_markets: arr(raw.export_markets),
    private_label: bool(raw.private_label, false),
    verification_level: (() => {
      const n = num(raw.verification_level);
      return n === null ? 0 : Math.max(0, Math.min(3, Math.round(n)));
    })(),
    verified_at: str(raw.verified_at),
    // Giá chỉ lưu ở supplier_products; các cột FOB cũ của NCC được giữ nguyên để tương thích.
    // Timestamp ở đây là lần xác nhận quyền chia sẻ giá của NCC, không phải ngày cập nhật giá.
    fob_updated_at: str(raw.fob_updated_at),
    fob_publicly_visible: bool(raw.fob_publicly_visible, false),
  };
}

/** Rebuild supplier industries from its products and the supplier's product summary. */
async function syncSupplierIndustries(supplierId: string): Promise<string | null> {
  try {
    const store = getStore();
    const [supplier, products, categories] = await Promise.all([
      store.getSupplier(supplierId), store.listProductsBySupplier(supplierId), store.listCategories({ publishedOnly: false }),
    ]);
    if (!supplier) return "Không tìm thấy NCC để đồng bộ ngành.";
    if (supplier.categories_reviewed_at) return null; // Staff's explicit decision wins over keyword inference.
    const assignment = assignSupplierCategories(supplier.products, products, categories);
    // No evidence of an industry yet: do not erase a previously linked category or
    // require the supplier_categories table just to save a name-only draft.
    if (!assignment.ids.length) return null;
    await store.setSupplierCategories(supplierId, assignment.ids, assignment.primaryId);
    return null;
  } catch (error) {
    console.error("[supplier-industries] sync failed", error instanceof Error ? error.name : "unknown");
    return "Đã lưu hồ sơ nhưng chưa đồng bộ được ngành NCC; kiểm tra bảng supplier_categories rồi thử lưu lại.";
  }
}

export async function createSupplierAction(
  raw: Partial<SupplierInput> & Record<string, unknown>,
): Promise<SupplierSaveResult> {
  const gate = await guard("suppliers.manage");
  if (gate) return gate;
  const input = parseSupplierInput(raw);
  // Tạo hồ sơ chỉ là lưu nháp; cấp xác minh phải đến từ đợt kiểm đã duyệt.
  input.status = "draft";
  input.verification_level = 0;
  input.verified_at = null;
  input.fob_updated_at = input.fob_publicly_visible ? new Date().toISOString() : null;
  if (!input.name) return { ok: false, message: "Vui lòng nhập tên nhà cung cấp." };
  if (input.email && !EMAIL_RE.test(input.email)) {
    return { ok: false, message: "Email nhà cung cấp không hợp lệ." };
  }
  try {
    const created = await getStore().createSupplier(input);
    const warning = await syncSupplierIndustries(created.id);
    revalidateAll();
    return {
      ok: true,
      message: `Đã thêm nhà cung cấp "${created.name}".${warning ? ` ${warning}` : ""}`,
      id: created.id,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function updateSupplierAction(
  id: string,
  raw: Partial<SupplierInput> & Record<string, unknown>,
): Promise<SupplierSaveResult> {
  const gate = await guard("suppliers.manage");
  if (gate) return gate;
  const input = parseSupplierInput(raw);
  if (!input.name) return { ok: false, message: "Vui lòng nhập tên nhà cung cấp." };
  if (input.email && !EMAIL_RE.test(input.email)) {
    return { ok: false, message: "Email nhà cung cấp không hợp lệ." };
  }
  try {
    const store = getStore();
    const existing = await store.getSupplier(id);
    if (!existing) return { ok: false, message: "Không tìm thấy nhà cung cấp." };
    // Không tự cấp lại quyền công khai giá khi chỉ sửa hồ sơ. Chỉ một lần xác nhận
    // mới (bật từ trạng thái tắt, hoặc checkbox được chọn lại) gia hạn thêm 180 ngày.
    if (!Object.hasOwn(raw, "fob_publicly_visible")) {
      input.fob_publicly_visible = existing.fob_publicly_visible ?? false;
      input.fob_updated_at = existing.fob_updated_at ?? null;
    } else if (input.fob_publicly_visible) {
      input.fob_updated_at = existing.fob_publicly_visible && input.fob_updated_at === existing.fob_updated_at
        ? existing.fob_updated_at : new Date().toISOString();
    } else {
      input.fob_updated_at = existing.fob_updated_at ?? null;
    }
    // Lưu nội dung không tự đổi trạng thái. Chỉ thao tác chuyển riêng mới được
    // gửi status mới, và không cho bỏ qua các bước của quy trình.
    if (input.status !== existing.status) {
      if (!nextStatusOptions(existing.status).includes(input.status)) {
        return { ok: false, message: "Trạng thái không hợp lệ. Tải lại trang và thử lại." };
      }
      const session = await getSession();
      if ((input.status === "published" || existing.status === "published") &&
        (!session || !hasPermission(session.role, "suppliers.publish"))) {
        return { ok: false, message: "Bạn không có quyền công khai hoặc ẩn hồ sơ nhà cung cấp." };
      }
    }
    // Form không được quyền cấp L1–L3, kể cả khi request bị sửa thủ công.
    // Không gửi các trường này để tránh ghi đè kết quả duyệt đồng thời.
    const { verification_level: _level, verified_at: _verifiedAt, ...safeInput } = input;
    void _level; void _verifiedAt;
    await store.updateSupplier(id, safeInput);
    // Giữ bản tiếng Anh của MOQ, thị trường xuất khẩu và phần giới thiệu luôn khớp hồ sơ mới lưu;
    // hàm này tự bỏ qua khi bản dịch còn mới và không chặn việc lưu khi AI lỗi.
    const actorSession = await getSession();
    // Nhân viên vừa sửa tay bản giới thiệu tiếng Anh mà không đổi câu chuyện gốc của NCC
    // thì giữ bản đã chốt, không để AI dịch đè trong lần lưu này và các lần lưu sau.
    const staffEditedSummary = (safeInput.summary_i18n?.en ?? "") !== (existing.summary_i18n?.en ?? "");
    const introChanged = (safeInput.intro_source ?? null) !== (existing.intro_source ?? null);
    let translation: EnsureSupplierTranslationResult | null = null;
    try {
      translation = await ensureSupplierProfileEnglish(store, id,
        actorSession ? { id: actorSession.uid, email: actorSession.email } : null,
        { preserveSummary: staffEditedSummary && !introChanged });
    } catch (error) {
      // Nội dung gốc đã lưu; báo lỗi dịch để nhân sự biết cần thử lại, không báo mất hồ sơ.
      console.error("[supplier-translation] staff save", error);
    }
    const translationNote = translation?.status === "translated"
      ? " Đã cập nhật bản dịch tiếng Anh."
      : translation?.status === "unconfigured"
        ? " Chưa dịch tự động vì máy chủ chưa cấu hình OPENAI_API_KEY. Nội dung gốc đã được lưu."
        : translation?.status === "failed"
          ? ` Chưa cập nhật được bản dịch tiếng Anh: ${translation.message} Nội dung gốc đã được lưu.`
          : translation?.status === "current"
            ? " Bản dịch tiếng Anh đang khớp nội dung gốc."
            : " Chưa cập nhật được bản dịch tiếng Anh. Nội dung gốc đã được lưu; hãy lưu lại để thử dịch lần nữa.";
    const warning = await syncSupplierIndustries(id);
    revalidateAll();
    return {
      ok: true,
      message: (input.status !== existing.status ? `Đã chuyển sang ${statusMeta(input.status).label}.` : "Đã lưu thông tin nhà cung cấp.") +
        (warning ? ` ${warning}` : "") + translationNote,
      supplier: translation?.supplier ?? { ...existing, ...safeInput },
      translationStatus: translation?.status ?? "failed",
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function deleteSupplierAction(id: string): Promise<ActionResult> {
  // Chỉ quản trị viên được xóa NCC (xóa kéo theo toàn bộ sản phẩm của NCC)
  const gate = await guard("suppliers.delete");
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
    display_name: displayNameInput(raw.display_name),
    slug: str(raw.slug) || null,
    name_i18n: (raw.name_i18n && typeof raw.name_i18n === "object"
      ? (raw.name_i18n as Record<string, string>)
      : undefined),
    category: str(raw.category),
    description: str(raw.description)?.slice(0, 1500) ?? null,
    description_detail: str(raw.description_detail)?.slice(0, 6000) ?? null,
    spec: str(raw.spec),
    specs: (raw.specs && typeof raw.specs === "object" ? (raw.specs as Record<string, unknown>) : undefined),
    unit: str(raw.unit),
    moq: str(raw.moq),
    moq_qty: num(raw.moq_qty),
    moq_unit: str(raw.moq_unit),
    monthly_capacity: str(raw.monthly_capacity),
    lead_time_days: num(raw.lead_time_days),
    packaging: str(raw.packaging),
    oem: bool(raw.oem, false),
    odm: bool(raw.odm, false),
    certifications: str(raw.certifications),
    export_port: str(raw.export_port),
    ref_price: num(raw.ref_price),
    ref_price_max: num(raw.ref_price_max),
    price_publicly_visible: bool(raw.price_publicly_visible, false),
    currency: str(raw.currency) ?? (num(raw.ref_price) !== null ? "USD" : null),
    price_valid_until: str(raw.price_valid_until),
    incoterm: str(raw.incoterm),
    incoterm_place: str(raw.incoterm_place),
    payment_terms: str(raw.payment_terms),
    samples: bool(raw.samples, false),
    ready_for_buyer: bool(raw.ready_for_buyer, false),
    images: Array.isArray(raw.images) ? (raw.images as string[]) : undefined,
  };
}

function priceRangeInputError(raw: Record<string, unknown>, input: SupplierProductInput): string | null {
  const upper = raw.ref_price_max;
  if (upper == null || String(upper).trim() === "") return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(upper).trim()) || input.ref_price_max == null ||
      input.ref_price_max > 999999999999.99 || input.ref_price == null || input.ref_price <= 0 ||
      input.ref_price_max < input.ref_price) {
    return "Giá đến phải lớn hơn hoặc bằng giá từ (> 0); bỏ trống nếu chỉ có một mức giá.";
  }
  return null;
}

async function autoAssignProduct(input: SupplierProductInput, requestedSlug?: string | null): Promise<Category | null> {
  const store = getStore();
  const [categories, supplier, links] = await Promise.all([
    store.listCategories({ publishedOnly: false }), store.getSupplier(input.supplier_id),
    store.listSupplierCategories(input.supplier_id).catch(() => []),
  ]);
  if (!supplier) throw new Error("Không tìm thấy NCC của sản phẩm.");
  const linked = links.map((link) => categories.find((c) => c.id === link.category_id)?.slug).filter((slug): slug is string => !!slug);
  const fallback = linked.length ? linked : assignSupplierCategories(supplier.products, [], categories).slugs;
  const inferred = assignProductCategory(input, categories, fallback);
  // An explicit choice is used only if text inference cannot identify a category;
  // never let a forged or out-of-scope form value override a known commodity.
  const allowed = supplier.requested_category_slugs?.length ? supplier.requested_category_slugs : fallback;
  const ambiguous = !inferred && requestedSlug && categories.filter((category) =>
    assignProductCategory({ ...input, category: null }, [category])?.id === category.id).length > 1;
  const chosen = !inferred && !ambiguous && requestedSlug && allowed.includes(requestedSlug)
    ? categories.find((category) => category.slug === requestedSlug) ?? null : null;
  const match = inferred ?? chosen;
  input.category = match?.slug ?? null;
  return categories.find((category) => category.id === match?.id) ?? null;
}

export async function createProductAction(
  raw: Partial<SupplierProductInput> & Record<string, unknown>,
): Promise<ActionResult & { id?: string }> {
  const gate = await guard("products.manage");
  if (gate) return gate;
  const input = parseProductInput(raw);
  if (!input.supplier_id) return { ok: false, message: "Thiếu nhà cung cấp." };
  if (!input.name.trim()) return { ok: false, message: "Vui lòng nhập tên sản phẩm." };
  const rangeError = priceRangeInputError(raw, input);
  if (rangeError) return { ok: false, message: rangeError };
  // Hồ sơ vừa tạo chưa thể có ảnh/catalogue nên luôn bắt đầu ở trạng thái chưa sẵn sàng.
  input.ready_for_buyer = false;
  input.category = null;
  try {
    const assigned = await autoAssignProduct(input, str(raw.category));
    input.specs = saveProductAttributes(assigned, raw.product_attributes);
    const created = await getStore().createProduct(input);
    const warning = await syncSupplierIndustries(created.supplier_id);
    revalidateAll();
    return { ok: true, message: `Đã thêm sản phẩm “${created.name}”. ${assigned ? `Hệ thống gán ngành ${assigned.name_i18n.en || assigned.slug}.` : "Chưa nhận diện được ngành; sản phẩm vẫn là bản nháp."} Tải ảnh/catalogue chia sẻ buyer vào hồ sơ sản phẩm rồi bật “Sẵn sàng gửi buyer” nếu muốn hiển thị công khai.${warning ? ` ${warning}` : ""}`, id: created.id };
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
  const rangeError = priceRangeInputError(raw, input);
  if (rangeError) return { ok: false, message: rangeError };
  const store = getStore();
  try {
    const existing = await store.getProduct(id);
    if (!existing) return { ok: false, message: "Không tìm thấy sản phẩm." };
    // Supplier products use one staff action to publish. A normal form save
    // cannot switch the internal readiness flag or bypass that action.
    const supplierProduct = !!(existing.supplier_originated || existing.supplier_category_proposal);
    if (supplierProduct) {
      input.ready_for_buyer = existing.ready_for_buyer;
      input.reviewed_category_slug = existing.reviewed_category_slug ?? null;
    }
    // Supplier/category are not chosen by arbitrary client payloads.
    input.supplier_id = existing.supplier_id;
    input.category = existing.category;
    const assigned = await autoAssignProduct(input, str(raw.category));
    const productCategory = existing.reviewed_category_slug && (supplierProduct || ![input.name !== existing.name, input.spec !== existing.spec, input.description !== existing.description].some(Boolean))
      ? await store.getCategoryBySlug(existing.reviewed_category_slug) : assigned;
    input.specs = saveProductAttributes(productCategory, raw.product_attributes,
      productCategory?.slug === (existing.reviewed_category_slug ?? existing.category) ? existing.specs : {});
    const identityChanged = input.name !== existing.name || input.spec !== existing.spec || input.description !== existing.description || input.description_detail !== (existing.description_detail ?? null) ||
      JSON.stringify(input.specs) !== JSON.stringify(existing.specs ?? {});
    // The human-reviewed category outranks text inference. Supplier products
    // keep that staff decision and their internal readiness during ordinary saves.
    if (existing.reviewed_category_slug && (supplierProduct || !identityChanged)) input.category = existing.reviewed_category_slug;
    else if (!assigned && !supplierProduct) input.ready_for_buyer = false;
    // CRM-created products retain the legacy identity-change invalidation.
    if (existing.reviewed_category_slug && identityChanged && !supplierProduct) {
      input.reviewed_category_slug = null;
      input.ready_for_buyer = false;
    }

    // Supplier-authored products cannot use the legacy keyword fallback to turn buyer-ready on.
    if (input.ready_for_buyer && supplierProduct && !input.reviewed_category_slug &&
        !existing.reviewed_category_slug) return { ok: false, message: "Vexim cần chốt danh mục sản phẩm trước khi bật sẵn sàng gửi buyer." };
    let translationWarning = "";
    // Only buyer-shareable media can make a classified CRM-created product ready.
    // Supplier readiness is changed only by Duyệt và đăng, not this form.
    if (input.ready_for_buyer && !supplierProduct) {
      if (existing.reviewed_category_slug) {
        const reviewed = await store.getCategoryBySlug(existing.reviewed_category_slug);
        if (!reviewed || reviewed.status !== "published" || !reviewed.is_published)
          return { ok: false, message: "Danh mục đã chốt không còn xuất bản; Vexim cần chọn lại." };
      }
      const readiness = productReadiness(await store.listMedia("product", id));
      if (!readiness.ready) return { ok: false, message: `Chưa thể đánh dấu “Sẵn sàng gửi buyer”: ${readiness.message}` };
      // Trang buyer chỉ hiển thị bản tiếng Anh: chưa có bản dịch thì AI dịch ngay tại bước này;
      // không dịch được và cũng chưa có bản dịch nào thì không cho công khai để tránh lộ nội dung tiếng Việt.
      const merged = { ...existing, ...input };
      if (!merged.name_i18n) merged.name_i18n = existing.name_i18n;
      if (!productTranslationState(merged).current) {
        const translation = await ensureProductEnglishTranslation(store, id, null, merged);
        if (translation.status === "failed" || translation.status === "unconfigured") {
          if (!merged.name_i18n?.en?.trim())
            return { ok: false, message: "Chưa thể đánh dấu “Sẵn sàng gửi buyer”: sản phẩm chưa có bản dịch tiếng Anh và AI chưa dịch được. Hãy mở mục Bản dịch tiếng Anh trong trang sửa sản phẩm để dịch lại hoặc nhập tay." };
          translationWarning = " Lưu ý: chưa dịch lại được bản tiếng Anh theo nội dung mới nhất; bản dịch hiện tại có thể đã cũ.";
        }
      }
    }
    await store.updateProduct(id, input);
    const warning = await syncSupplierIndustries(existing.supplier_id);
    revalidateAll();
    const categoryNotice = existing.reviewed_category_slug
      ? identityChanged && !supplierProduct
        ? "Nội dung sản phẩm đã đổi; cần Vexim chốt lại danh mục trước khi công khai."
        : "Danh mục Vexim đã chốt được giữ nguyên."
      : assigned ? `Hệ thống phân loại ${assigned.name_i18n.en || assigned.slug}; không tự công khai.` : "Chưa nhận diện được ngành; đã tắt sẵn sàng gửi buyer.";
    return { ok: true, message: `Đã lưu hồ sơ sản phẩm. ${categoryNotice}${translationWarning}${warning ? ` ${warning}` : ""}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  const gate = await guard("products.manage");
  if (gate) return gate;
  try {
    const store = getStore();
    const existing = await store.getProduct(id);
    if (!existing) return { ok: false, message: "Không tìm thấy sản phẩm." };
    await store.deleteProduct(id);
    const warning = await syncSupplierIndustries(existing.supplier_id);
    revalidateAll();
    return { ok: true, message: `Đã xoá sản phẩm.${warning ? ` ${warning}` : ""}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/* ------------------------------ EMAIL ------------------------------- */

const EMAIL_LIST_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface MailDraftInput {
  buyerId?: string | null;
  supplierId?: string | null;
  prospectId?: string | null;
  direction: "buyer" | "supplier";
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  /** bản thuần chữ song song với html (tăng deliverability) */
  bodyText?: string;
  /** chỉ metadata: tệp thật đã nằm trong Supabase Storage, không gửi base64 qua đây */
  attachments?: { id: string; name?: string; size?: number; type?: string }[];
  author?: string | null;
  /**
   * id bản nháp đang mở. Có giá trị này là LƯU ĐỀ (giữ một bản nháp duy nhất cho một
   * lần soạn, như Gmail) thay vì chèn thêm dòng "Nháp" mới mỗi lần bấm Lưu.
   */
  draftId?: string | null;
  /** Trả lời thư đến: RFC Message-ID của thư đang trả lời */
  inReplyTo?: string | null;
  /** Chuỗi References của mạch thư */
  references?: string | null;
  }

  /** Đọc các dòng metadata tệp đính kèm và kiểm tra quyền sử dụng. */
  async function resolveAttachments(
    refs: MailDraftInput["attachments"],
    email: string,
    role: string,
  ): Promise<{ rows: EmailAttachment[] } | { error: string }> {
    const ids = Array.from(
      new Set((refs ?? []).map((r) => String(r?.id ?? "").trim()).filter(Boolean)),
    );
    if (!ids.length) return { rows: [] };
    if (ids.length > MAX_FILES_PER_MAIL) {
      return { error: `Chỉ được đính kèm tối đa ${MAX_FILES_PER_MAIL} tệp mỗi email.` };
    }
    const rows = await getStore().listAttachments(ids);
    if (rows.length !== ids.length) {
      return { error: "Có tệp đính kèm không còn tồn tại. Vui lòng tải lại tệp đó." };
    }
    if (rows.some((r) => r.status === "deleted")) {
      return { error: "Có tệp đính kèm đã bị xoá. Vui lòng bỏ tệp đó khỏi email." };
    }
    if (role !== "admin") {
      const foreign = rows.filter(
        (r) => r.created_by && r.created_by.toLowerCase() !== email.toLowerCase(),
      );
      if (foreign.length) {
        return { error: "Bạn không có quyền dùng tệp đính kèm do người khác tải lên." };
      }
    }
    const total = rows.reduce((sum, r) => sum + (r.size_bytes || 0), 0);
    if (total > MAX_TOTAL_BYTES) {
      return {
        error: `Tổng dung lượng tệp đính kèm vượt quá ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB.`,
      };
    }
    return { rows };
  }

  /** Đồng bộ lại tham chiếu tệp trong email (trạng thái mới nhất) để hiển thị đúng. */
  async function syncMessageRefs(messageId: string, rows: EmailAttachment[]) {
    if (!rows.length) return;
    const store = getStore();
    const fresh = await store.listAttachments(rows.map((r) => r.id));
    await store
      .updateMessage(messageId, { attachments: fresh.map(toRef) })
      .catch(() => null);
  }

  /** Gắn tệp vào email vừa gửi/lưu và ghi trạng thái để luôn truy vết được. */
  async function bindAttachments(
    rows: EmailAttachment[],
    messageId: string | null,
    ok: boolean,
    error: string | null,
  ) {
    const store = getStore();
    for (const row of rows) {
      await store
        .updateAttachment(
          row.id,
          ok
            ? { message_id: messageId, status: "attached", last_error: null }
            : { message_id: messageId, status: "failed", last_error: error },
        )
        .catch(() => null);
    }
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
  const refs = input.attachments ?? [];
  if (refs.length > MAX_FILES_PER_MAIL) {
    return `Chỉ được đính kèm tối đa ${MAX_FILES_PER_MAIL} tệp mỗi email.`;
  }
  if (refs.some((a) => !a.id)) return "Có tệp đính kèm chưa tải lên xong.";
  const totalSize = refs.reduce((s, a) => s + (a.size || 0), 0);
  if (totalSize > MAX_TOTAL_BYTES) {
    return `Tổng dung lượng file đính kèm vượt quá ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB.`;
  }
  return null;
}

/**
 * Gửi thư từ bản nháp xong thì dọn bản nháp đó (như Gmail: một lần soạn chỉ còn một dấu
 * vết). Tệp đã gắn vào thư gửi chỉ đổi message_id nên vẫn còn nguyên; tệp bị bỏ khỏi thư
 * thì xóa cả dòng lẫn tệp trong Storage, vì hàng dọn tệp mồ côi không thấy được những
 * dòng bị xóa dây chuyền theo bản nháp.
 */
async function discardDraftAfterSend(draftId: string, keep: Set<string>) {
  const store = getStore();
  const rows = await store.listAttachmentsForMessage(draftId).catch(() => [] as EmailAttachment[]);
  for (const row of rows) {
    if (keep.has(row.id)) continue;
    await store.deleteAttachment(row.id).catch(() => null);
    await deleteObject(row.storage_path).catch(() => null);
  }
  await store.deleteMessage(draftId).catch(() => null);
}

export async function sendMailAction(input: MailDraftInput): Promise<ActionResult> {
  const gate = await guard("mail.send");
  if (gate) return gate;
  const err = validateMail(input);
  if (err) return { ok: false, message: err };

  const session = await getSession();
  if (!session) {
    return { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
  }
  if (input.prospectId) {
    const prospectGate = await guard("prospects.manage");
    if (prospectGate) return prospectGate;
    const prospect = await getStore().getProspect(input.prospectId);
    if (!prospect) return { ok: false, message: "Không tìm thấy đầu mối được liên kết." };
    if (!prospect.email?.trim()) return { ok: false, message: "Đầu mối cần có email mới được gửi thư." };
    if (["unsubscribed", "disqualified", "converted"].includes(prospect.status)) {
      return { ok: false, message: "Đầu mối này đang ở trạng thái không được phép tiếp cận." };
    }
    if (prospect.email && !cleanList(input.to).some((address) => address.toLowerCase() === prospect.email?.toLowerCase())) {
      return { ok: false, message: "Email người nhận không khớp với đầu mối này. Hãy chọn đúng địa chỉ email." };
    }
  }

  // Ai là người soạn: ghi theo TÊN hiển thị, cùng hệ quy chiếu với buyers.owner và với bộ
  // lọc phạm vi của Hộp thư (lib/mail/visibility.ts). Trước đây giá trị này lấy từ client
  // mà không trang nào gửi lên => created_by = NULL => thư gửi buyer CHƯA có trong hệ
  // thống (không buyer_id, không prospect_id) bị ẩn khỏi Hộp thư của nhân viên, chỉ admin thấy.
  const author = input.author?.trim() || session.name?.trim() || session.email;

  // Tệp đính kèm: DB chỉ có metadata, nội dung nằm trong Storage và nạp ngay lúc gửi
  const resolved = await resolveAttachments(input.attachments, session.email, session.role);
  if ("error" in resolved) return { ok: false, message: resolved.error };
  const attachmentRows = resolved.rows;

  let res;
  try {
    res = await sendManualMail({
      buyerId: input.buyerId ?? null,
      supplierId: input.supplierId ?? null,
      prospectId: input.prospectId ?? null,
      direction: input.direction,
      to: cleanList(input.to),
      cc: cleanList(input.cc),
      bcc: cleanList(input.bcc),
      subject: input.subject.trim(),
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      attachments: attachmentRows,
      author,
      // Gửi từ địa chỉ mang tên người soạn (deliverability — lib/email/sender.ts)
      authorEmail: session.email,
      inReplyTo: input.inReplyTo ?? null,
      references: input.references ?? null,
    });
  } catch (errSend) {
    // Chưa gửi được gì (thường do không đọc được tệp) — giữ tệp lại để gửi lại an toàn
    return {
      ok: false,
      message: errSend instanceof Error ? errSend.message : "Không đọc được tệp đính kèm.",
    };
  }

  // Ghi lại tệp thuộc email nào + lần gửi này thành công hay cần gửi lại
  await bindAttachments(attachmentRows, res.messageId, res.ok, res.error);
  if (res.messageId) await syncMessageRefs(res.messageId, attachmentRows);

  if (res.ok && input.buyerId) {
    await getStore()
      .addActivity({
        buyer_id: input.buyerId,
        type: "email",
        message: `Gửi email thủ công: ${input.subject.trim()}`,
        created_by: author,
      })
      .catch(() => null);
  }
  // Buyer mới (Khách mới) chuyển sang Đã liên hệ sau email đầu tiên.
  // Chỉ áp dụng cho giai đoạn lead; các giai đoạn sau do nhân viên tự chuyển.
  if (res.ok && input.buyerId) {
    const store = getStore();
    const buyer = await store.getBuyer(input.buyerId).catch(() => null);
    if (buyer && (buyer.stage ?? "lead") === "lead") {
      await store.updateBuyer(buyer.id, { stage: "contacted" }).catch(() => null);
      await store
        .addActivity({
          buyer_id: buyer.id,
          type: "stage_change",
          from_stage: "lead",
          to_stage: "contacted",
          message: "Khách mới → Đã liên hệ (tự động sau email đầu tiên)",
          created_by: author,
        })
        .catch(() => null);
    }
  }

  if (res.ok && input.prospectId) {
    const store = getStore();
    const prospect = await store.getProspect(input.prospectId).catch(() => null);
    if (prospect && ["new", "researched", "ready"].includes(prospect.status)) {
      await store.updateProspect(prospect.id, { status: "contacted" }).catch(() => null);
    }
    await store.addProspectActivity({
      prospect_id: input.prospectId,
      channel: "email",
      summary: `Gửi email: ${input.subject.trim()}`,
      created_by: session.email,
    }).catch(() => null);
  }
  // Gửi từ một bản nháp đang mở => không để lại bản nháp trùng nội dung trong Hộp thư
  const sentFromDraft = str(input.draftId);
  if (res.ok && sentFromDraft && sentFromDraft !== res.messageId) {
    await discardDraftAfterSend(sentFromDraft, new Set(attachmentRows.map((row) => row.id)));
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
  const session = await getSession();
  if (!session) {
    return { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
  }
  // Bản nháp cũng phải mang tên người soạn, nếu không thì người vừa lưu không thấy lại
  // bản nháp của mình trong Hộp thư (cùng lý do với sendMailAction ở trên).
  const author = input.author?.trim() || session.name?.trim() || session.email;
  if (input.prospectId) {
    const prospectGate = await guard("prospects.manage");
    if (prospectGate) return prospectGate;
    const prospect = await getStore().getProspect(input.prospectId);
    if (!prospect) return { ok: false, message: "Không tìm thấy đầu mối được liên kết." };
    if (!prospect.email?.trim()) return { ok: false, message: "Đầu mối cần có email mới được lưu thư liên kết." };
  }
  const resolved = await resolveAttachments(input.attachments, session.email, session.role);
  if ("error" in resolved) return { ok: false, message: resolved.error };
  const attachmentRows = resolved.rows;

  const draft = {
    buyerId: input.buyerId ?? null,
    supplierId: input.supplierId ?? null,
    prospectId: input.prospectId ?? null,
    direction: input.direction,
    to: cleanList(input.to),
    cc: cleanList(input.cc),
    bcc: cleanList(input.bcc),
    subject: input.subject.trim() || "(không có tiêu đề)",
    bodyHtml: input.bodyHtml,
    attachments: attachmentRows,
    author,
  };

  // Bản nháp đang mở thì ghi đè lên nó. Chỉ ghi đè được khi đúng là nháp và thuộc về
  // người này (hoặc người xem được tất cả) — của người khác thì lưu thành bản mới,
  // không phá bài của họ và cũng không âm thầm ghi đè.
  const store = getStore();
  const wantedId = str(input.draftId);
  let reuseId: string | null = null;
  let fallbackNote = "";
  if (wantedId) {
    const existing = await store.getMessage(wantedId).catch(() => null);
    if (!existing) fallbackNote = " Bản nháp cũ không còn nên app lưu thành bản mới.";
    else if (existing.status !== "draft") fallbackNote = " Bản nháp cũ đã được gửi nên app lưu thành bản mới.";
    else {
      const viewer: MailViewer = {
        name: session.name ?? null,
        email: session.email,
        senderAddress: null,
        scope: ownerScopeOf(session),
      };
      if (viewer.scope === null || isMyMail(existing, viewer)) reuseId = existing.id;
      else fallbackNote = " Bản nháp đó do người khác soạn nên app lưu thành bản nháp mới của bạn.";
    }
  }
  const updated = reuseId ? (await updateDraft(reuseId, draft) ? reuseId : null) : null;
  const id = updated ?? (await saveDraft(draft));

  // Tệp của bản nháp: gắn với email nháp để mở lại vẫn còn, chưa coi là đã gửi
  if (id) {
    for (const row of attachmentRows) {
      await store
        .updateAttachment(row.id, { message_id: id, status: "uploaded", last_error: null })
        .catch(() => null);
    }
    await syncMessageRefs(id, attachmentRows);
  }
  revalidateAll();
  return id
    ? {
        ok: true,
        message: `${reuseId ? "Đã cập nhật bản nháp." : "Đã lưu bản nháp."}${fallbackNote}`,
        id,
      }
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
  // Tệp đính kèm đọc lại từ kho lưu trữ (DB chỉ giữ metadata)
  const attachmentRows = await store.listAttachmentsForMessage(id);
  let forSend: { filename: string; content: string; contentType: string }[] | undefined;
  if (attachmentRows.length) {
    try {
      forSend = await loadForSend(attachmentRows);
    } catch (errAttach) {
      return {
        ok: false,
        message: errAttach instanceof Error ? errAttach.message : "Không đọc được tệp đính kèm.",
      };
    }
  }

  // Gửi lại thì phải đi đúng địa chỉ của lần gửi trước: buyer/nhân viên tự soạn
  // gửi từ địa chỉ cá nhân người phụ trách, thư NCC gửi từ địa chỉ chức năng.
  const sender =
    msg.kind === "inbound"
      ? null
      : msg.kind === "manual" || msg.direction === "buyer"
        ? await resolveSender({ byName: msg.created_by })
        : null;
  const res = await transport({
    to: msg.to_emails,
    cc: msg.cc_emails,
    bcc: msg.bcc_emails,
    subject: msg.subject,
    html: msg.body_html,
    text: msg.body_text,
    attachments: forSend,
    from: sender?.header ?? null,
    replyTo: sender?.address ?? null,
  });
  await store
    .updateMessage(id, {
      status: res.status,
      provider: res.provider,
      error: res.error,
      sent_at: res.ok ? new Date().toISOString() : msg.sent_at,
    })
    .catch(() => null);
  if (attachmentRows.length) {
    await bindAttachments(attachmentRows, id, res.ok, res.error);
    await syncMessageRefs(id, attachmentRows);
  }
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
  const gate = await guard("users.manage");
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

async function logEvidenceChange(v: Verification, mediaId: string, action: string) {
  const session = await getSession();
  await getStore().addAuditLog({
    actor_id: session?.uid ?? null, actor_email: session?.email ?? null,
    entity: "supplier", entity_id: v.supplier_id,
    action: `verification.media.${action}.l${v.target_level}`,
    before: null, after: { verification_id: v.id, media_id: mediaId },
  }).catch((err) => console.error("[audit] media change failed", err));
}

/**
 * Gắn link video vào hồ sơ (video không tải tệp lên — chỉ lưu link).
 */
export async function addMediaLinkAction(input: {
  ownerType: MediaOwnerType;
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

  try {
    const store = getStore();
    let supplierId: string | null = null;
    let productId: string | null = null;
    let verificationId: string | null = null;
    let verification: Verification | null = null;
    if (input.ownerType === "product") {
      productId = input.ownerId;
      const p = await store.getProduct(input.ownerId);
      supplierId = p?.supplier_id ?? null;
    } else if (input.ownerType === "supplier") {
      supplierId = input.ownerId;
    } else if (input.ownerType === "verification") {
      verificationId = input.ownerId;
      const v = await store.getVerification(input.ownerId);
      if (!v) return { ok: false, message: "Không tìm thấy đợt kiểm." };
      const blocked = await verificationMediaEditError(v);
      if (blocked) return { ok: false, message: blocked };
      verification = v;
      supplierId = v.supplier_id;
    } else {
      // Bằng chứng tự gửi (owner_type = "submission") chỉ nhận link nguồn qua
      // addSourceLinkAction, không nhận link video ở đây.
      return { ok: false, message: "Loại hồ sơ không hỗ trợ thêm link video." };
    }
    const created = await store.createMedia({
      owner_type: input.ownerType,
      product_id: productId,
      supplier_id: supplierId,
      verification_id: verificationId,
      kind: "video",
      audience: input.ownerType === "verification" ? "internal" : (input.audience ?? "buyer"),
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
    if (verification) await logEvidenceChange(verification, created.id, "add_link");
    revalidateAll();
    return { ok: true, message: "Đã thêm link (trạng thái: chưa xác minh)." };
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
    let verification: Verification | null = null;
    if (current.owner_type === "verification") {
      const v = current.verification_id && await store.getVerification(current.verification_id);
      if (!v) return { ok: false, message: "Không tìm thấy đợt kiểm." };
      const blocked = await verificationMediaEditError(v);
      if (blocked) return { ok: false, message: blocked };
      verification = v;
    }

    const next: typeof patch = { ...patch };
    if (current.owner_type === "verification") next.audience = "internal";
    // Giấy tờ nội bộ không bao giờ được chuyển sang chia sẻ buyer
    if (current.kind === "document") next.audience = "internal";

    const updated = await store.updateMedia(id, next);
    if (verification) await logEvidenceChange(verification, id, "update");
    if (current.product_id) {
      const product = await store.getProduct(current.product_id);
      const revokeCover = product?.featured_media_id === id &&
        (updated.audience !== "buyer" || updated.kind !== "image" || isExpired(updated));
      const revokeReady = product?.ready_for_buyer && !productReadiness(await store.listMedia("product", current.product_id)).ready;
      if (revokeCover || revokeReady) await store.updateProduct(current.product_id, {
        ...(revokeCover ? { featured_media_id: null } : {}), ...(revokeReady ? { ready_for_buyer: false } : {}),
      });
    }
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
    let verification: Verification | null = null;
    if (asset.owner_type === "verification") {
      const v = asset.verification_id && await store.getVerification(asset.verification_id);
      if (!v) return { ok: false, message: "Không tìm thấy đợt kiểm." };
      const blocked = await verificationMediaEditError(v);
      if (blocked) return { ok: false, message: blocked };
      verification = v;
    }

    // Nếu sản phẩm đang ở trạng thái "sẵn sàng gửi buyer" thì kiểm tra lại sau khi xoá
    await store.deleteMedia(id);
    if (verification) await logEvidenceChange(verification, id, "delete");
    for (const path of [asset.storage_path, asset.thumb_path]) {
      if (path) {
        await deleteObject(path).catch(() => null);
      }
    }

    if (asset.product_id) {
      const product = await store.getProduct(asset.product_id);
      const revokeReady = product?.ready_for_buyer &&
        !productReadiness(await store.listMedia("product", asset.product_id)).ready;
      const revokeCover = product?.featured_media_id === id;
      if (revokeReady || revokeCover) await store.updateProduct(asset.product_id, {
        ...(revokeReady ? { ready_for_buyer: false } : {}), ...(revokeCover ? { featured_media_id: null } : {}),
      });
    }

    revalidateAll();
    return { ok: true, message: "Đã xoá tệp." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/** Thử lưu lại tệp từ client (dùng khi trình duyệt gửi kèm ảnh đã nén). */

/* -------- Đánh dấu đã đọc thư đến trong một mạch thư -------- */

export async function saveTemplateOverrideAction(input: {
  stage: string;
  dir: "buyer" | "supplier";
  subject: string;
  body: string;
  action: string;
  tasks: string;
  deadline: string;
}): Promise<ActionResult> {
  const gate = await guard("templates.manage");
  if (gate) return gate;
  if (!input.subject.trim()) return { ok: false, message: "Tiêu đề không được để trống." };
  if (!input.body.trim()) return { ok: false, message: "Nội dung không được để trống." };
  try {
    await getStore().saveTemplateOverride({
      stage: input.stage,
      dir: input.dir,
      subject: input.subject.trim(),
      body: input.body.trim(),
      action: input.action.trim() || null,
      tasks: input.tasks.trim() || null,
      deadline: input.deadline.trim() || null,
    });
    revalidateAll();
    return { ok: true, message: "Đã lưu template — email tự động lần sau sẽ dùng nội dung này." };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Lỗi không xác định";
    return {
      ok: false,
      message:
        "Không lưu được template. Nếu dùng Supabase, chạy câu CREATE TABLE email_template_overrides trong supabase/schema.sql.",
      details: ["Lỗi gốc: " + raw],
    };
  }
}

export async function clearTemplateOverrideAction(
  stage: string,
  dir: "buyer" | "supplier",
): Promise<ActionResult> {
  const gate = await guard("templates.manage");
  if (gate) return gate;
  try {
    await getStore().clearTemplateOverride(stage, dir);
    revalidateAll();
    return { ok: true, message: "Đã khôi phục nội dung mặc định của giai đoạn này." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function saveProspectOutreachTemplateAction(input: {
  id: string;
  label: string;
  subject: string;
  body: string;
}): Promise<ActionResult> {
  const gate = await guard("templates.manage");
  if (gate) return gate;
  if (input.id !== "intro" && input.id !== "followup") return { ok: false, message: "Mẫu không hợp lệ." };
  const label = str(input.label);
  const subject = str(input.subject);
  const body = str(input.body);
  if (!label || !subject || !body) return { ok: false, message: "Tên mẫu, tiêu đề và nội dung đều bắt buộc." };
  if (label.length > 100 || subject.length > 500 || body.length > 10000) {
    return { ok: false, message: "Nội dung vượt quá giới hạn cho phép." };
  }
  try {
    await getStore().saveProspectOutreachTemplateOverride({ id: input.id, label, subject, body });
    revalidateAll();
    return { ok: true, message: "Đã lưu mẫu tiếp cận khách hàng mục tiêu." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Không lưu được mẫu." };
  }
}

export async function clearProspectOutreachTemplateAction(id: string): Promise<ActionResult> {
  const gate = await guard("templates.manage");
  if (gate) return gate;
  if (id !== "intro" && id !== "followup") return { ok: false, message: "Mẫu không hợp lệ." };
  try {
    await getStore().clearProspectOutreachTemplateOverride(id);
    revalidateAll();
    return { ok: true, message: "Đã khôi phục mẫu khách hàng mục tiêu mặc định." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Không khôi phục được mẫu." };
  }
}

export async function markThreadReadAction(threadIdValue: string): Promise<ActionResult> {
  // Reading alone must not mutate shared mail state. Only touch messages this
  // staff member is actually allowed to see in the buyer mailbox.
  const gate = await guard("mail.send");
  if (gate) return gate;
  const session = await getSession();
  if (!session) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  const mailbox = await loadMailboxData(session, { tolerateErrors: false });
  const targets = mailbox.mailMessages.filter(
    (m) => m.thread_id === threadIdValue && m.kind === "inbound" && !m.read_at,
  );
  if (!targets.length) return { ok: true, message: "Không có thư chưa đọc thuộc quyền xem của bạn." };
  const now = new Date().toISOString();
  const store = getStore();
  for (const m of targets) await store.updateMessage(m.id, { read_at: now });
  revalidatePath("/crm/mail");
  // Huy hiệu Hộp thư nằm trong layout: không làm mới layout thì số chưa đọc không giảm.
  refreshCrmBadges();
  return { ok: true, message: `Đã đánh dấu đọc ${targets.length} thư.` };
}

/* ----------------------- Lead từ landing page (công khai) ----------------------- */

/**
 * Form "Request a quote" trên landing veximtrade.com: tạo buyer stage `lead`
 * (nguồn "Website veximtrade.com") và gửi mail cảm ơn best-effort.
 * Không cần đăng nhập — chống bot bằng ô honeypot `company_website`.
 */
export async function submitQuoteLeadAction(input: {
  company: string;
  name: string;
  email: string;
  country: string;
  product: string;
  quantity: string;
  incoterm?: string;
  payment_method?: string;
  lead_time?: string;
  message: string;
  /** Trang gửi form: "cashew" = trang /cashew, để trống = trang chủ. CRM dùng để tách nguồn. */
  landing?: string;
  /** Chuỗi utm_ / gclid của lượt truy cập — lưu vào hồ sơ để đo quảng cáo theo nhóm. */
  attribution?: string | null;
  company_website: string;
}): Promise<ActionResult> {
  const thanks =
    "Thank you. Your enquiry is with our export desk, and you will have a written reply by the " +
    "start of your next business day.";
  // Bot điền honeypot => giả vờ thành công, không ghi gì vào CRM
  if (input.company_website?.trim()) return { ok: true, message: thanks };

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Please provide a valid email address." };
  }
  if (!input.company.trim()) {
    return { ok: false, message: "Please tell us your company name." };
  }
  // Form chỉ đánh dấu * ở company, email và product nên server cũng chỉ bắt buộc đúng ba ô đó.
  // Ô "Anything else we should know" được phép trống; chỉ chặn khi thiếu MÔ TẢ (product hoặc message)
  // thay vì chặn riêng ô message như trước — lời trên form và luật của server phải khớp nhau.
  if (!input.product.trim() && !input.message.trim()) {
    return { ok: false, message: "Please tell us what you are sourcing — one line is enough." };
  }

  const store = getStore();
  try {
    const buyers = await store.listBuyers();
    const existing = buyers.find(
      (b) => (b.email ?? "").trim().toLowerCase() === email,
    );
    const today = new Date().toISOString().slice(0, 10);
    const requestLines = [
      input.product.trim() ? `Sản phẩm: ${input.product.trim()}` : "",
      input.quantity.trim() ? `Số lượng: ${input.quantity.trim()}` : "",
      input.incoterm?.trim() ? `Incoterm: ${input.incoterm.trim()}` : "",
      input.payment_method?.trim() ? `Thanh toán: ${input.payment_method.trim()}` : "",
      input.lead_time?.trim() ? `Thời gian cần: ${input.lead_time.trim()}` : "",
    ].filter(Boolean);
    // Trang /cashew chạy quảng cáo riêng: giữ utm_* và đánh dấu nguồn lead để đối chiếu chi phí
    // quảng cáo với hồ sơ thật, và để phòng sale biết lead đến từ trang nào.
    const leadSource =
      input.landing === "cashew" ? "Website veximtrade.com/cashew" : "Website veximtrade.com";
    const campaign = input.attribution?.replace(/[\r\n]+/g, " ").trim().slice(0, 240) ?? "";
    const requestText = [
      [...requestLines, input.message.trim()].filter(Boolean).join("\n"),
      campaign ? `Campaign: ${campaign}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (existing) {
      // Buyer đã có: không bỏ qua yêu cầu mới, ghi thêm vào hồ sơ để người phụ trách thấy
      await store.updateBuyer(existing.id, {
        notes: `${existing.notes ?? ""}\n\n[Website ${today}] Yêu cầu sourcing mới:\n${requestText}`.trim(),
      });
    } else {
      await store.createBuyer({
        company: input.company.trim().slice(0, 200),
        contact_name: input.name.trim() || null,
        email,
        cc_emails: null,
        phone: null,
        country: input.country.trim() || null,
        website: null,
        linkedin: null,
        instagram: null,
        product: input.product.trim() || null,
        spec: null,
        quantity: input.quantity.trim() || null,
        target_price: null,
        payment_method: input.payment_method?.trim() || null,
        payment_terms: null,
        incoterm: input.incoterm?.trim() || null,
        port: null,
        expected_ship_date: null,
        deal_value: null,
        supplier_id: null,
        hide_buyer_from_supplier: true,
        stage: "lead",
        owner: null,
        source: leadSource,
        priority: "normal",
        next_action: "Reply to website enquiry",
        next_action_date: null,
        // requestText đã gồm sản phẩm/số lượng/Incoterm/thanh toán/thời gian +Campaign,
        // không cần ghép riêng ô lead_time như trước.
        notes: `Website enquiry ${new Date().toISOString().slice(0, 10)}:\n${requestText}`,
      });
    }

    // Báo đội ngũ best-effort: buyer mới → admin + sale; buyer đã có → người phụ trách
    try {
      const recipients = await notifyRecipients("", existing?.owner ?? null, Boolean(existing));
      if (recipients.length) {
        const title = existing
          ? `Yêu cầu sourcing mới từ buyer đã có: ${existing.company}`
          : `Buyer mới từ website: ${input.company.trim()}`;
        const body =
          `<p><strong>${escapeHtml(title)}</strong></p>` +
          `<p>Người gửi: ${escapeHtml(input.name.trim() || "—")} &lt;${escapeHtml(email)}&gt;<br/>` +
          `Công ty: ${escapeHtml(input.company.trim())}<br/>` +
          `Quốc gia: ${escapeHtml(input.country.trim() || "—")}<br/>` +
          `Trang nguồn: ${escapeHtml(leadSource)}` +
          `${campaign ? `<br/>Campaign: ${escapeHtml(campaign)}` : ""}</p>` +
          `<p>${requestLines.map((l) => escapeHtml(l)).join("<br/>")}</p>` +
          `<p>${escapeHtml(input.message.trim()).replace(/\n/g, "<br/>")}</p>` +
          `<p>Vào CRM &rarr; Buyer để xử lý.</p>`;
        await transport({
          to: recipients,
          subject: title,
          html: wrapPlainEmail({ title, body }),
          text: `${title}\n${email}\n${requestText}`,
        });
      }
    } catch {
      /* lead đã lưu; thông báo lỗi không làm mất yêu cầu */
    }

    // Mail cảm ơn best-effort (chế độ demo / lỗi Resend không làm mất lead)
    try {
      const html = wrapPlainEmail({
        title: "Thank you for your enquiry – Vexim Trade",
        body:
          `<p>Dear ${escapeHtml(input.name.trim() || input.company.trim())},</p>` +
          `<p>Thank you for contacting Vexim Trade. Your enquiry has reached our export desk, ` +
          `and you will have a written reply by the start of your next business day.</p>` +
          `<p>Best regards,<br/>Export Department &middot; Vexim Trade</p>`,
      });
      await transport({
        to: [email],
        subject: "Thank you for your enquiry – Vexim Trade",
        html,
        text: "Thank you for contacting Vexim Trade. Our export desk will reply by the start of your next business day.",
      });
    } catch {
      /* bỏ qua — lead đã lưu */
    }

    revalidateAll();
    return { ok: true, message: thanks };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not save your enquiry, please email us directly.",
    };
  }
}

/* ----------------------------- CATEGORIES ----------------------------- */

function parseJsonList(raw: unknown): unknown[] {
  if (!raw || typeof raw !== "string") return [];
  const t = raw.trim();
  if (!t) return [];
  try {
    const parsed = JSON.parse(t);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseCategoryInput(raw: Record<string, unknown>) {
  const slug = (str(raw.slug) ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const name_en = str(raw.name_en) ?? "";
  const intro_en = str(raw.intro_en) ?? "";
  const h1_en = str(raw.h1_en) ?? "";
  const body_en = str(raw.body_en) ?? "";
  const seoTitleEn = str(raw.seo_title_en);
  const seoDescEn = str(raw.seo_desc_en);
  const kickerEn = str(raw.kicker_en);
  const heroAltEn = str(raw.hero_alt_en);
  const heroImage = str(raw.hero_image) || null;
  const specColumns = parseJsonList(raw.spec_columns);
  const specRows = parseJsonList(raw.spec_rows);
  const buyingFacts = parseJsonList(raw.buying_facts);
  const faqs = parseJsonList(raw.faqs);
  const filters = parseJsonList(raw.filters);
  const harvest = parseHarvestInput(raw.harvest);
  const priceUnitRaw = str(raw.price_unit)?.trim().toLowerCase();
  // Lưu dạng chuẩn "mt"; "t", "ton", "tonne" chỉ là cách viết khác của cùng một đơn vị.
  const priceUnit = priceUnitRaw === "kg" || priceUnitRaw === "lb"
    ? priceUnitRaw
    : priceUnitRaw && ["mt", "t", "ton", "tonne"].includes(priceUnitRaw)
      ? "mt"
      : null;
  // Unlike editorial lists, an invalid product-field payload must not silently erase the schema.
  let productFieldInput: unknown = [];
  if (raw.product_fields !== undefined) {
    if (typeof raw.product_fields !== "string") throw new Error("Cấu hình thông số sản phẩm không hợp lệ.");
    try { productFieldInput = JSON.parse(raw.product_fields); }
    catch { throw new Error("Cấu hình thông số sản phẩm không phải JSON hợp lệ."); }
  }
  const productFields = validateProductFields(productFieldInput);
  const status = bool(raw.is_published, false) ? "published" : "draft";
  const seoIndexable = bool(raw.seo_indexable, false);
  const activeHome = bool(raw.active_on_homepage, false);
  return {
    slug,
    parent_id: str(raw.parent_id) || null,
    name_i18n: name_en ? ({ en: name_en } as Category["name_i18n"]) : undefined,
    intro_i18n: { en: intro_en } as Category["intro_i18n"],
    h1_i18n: h1_en ? ({ en: h1_en } as Category["h1_i18n"]) : null,
    body_i18n: body_en ? ({ en: body_en } as Category["body_i18n"]) : null,
    faq_i18n: faqs as Category["faq_i18n"],
    spec_columns: specColumns as Category["spec_columns"],
    spec_rows: specRows as unknown as Category["spec_rows"],
    buying_facts: buyingFacts as Category["buying_facts"],
    filters: filters as Category["filters"],
    ...(harvest === undefined ? {} : { harvest }),
    ...(raw.price_unit === undefined ? {} : { price_unit: priceUnit }),
    product_fields: productFields,
    seo_title_i18n: { en: seoTitleEn ?? "" } as Category["seo_title_i18n"],
    seo_desc_i18n: { en: seoDescEn ?? "" } as Category["seo_desc_i18n"],
    homepage_kicker_i18n: kickerEn ? ({ en: kickerEn } as Category["homepage_kicker_i18n"]) : null,
    hero_alt_i18n: heroAltEn ? ({ en: heroAltEn } as Category["hero_alt_i18n"]) : null,
    hero_image: heroImage,
    active_on_homepage: activeHome,
    seo_indexable: seoIndexable,
    status,
    is_published: status === "published",
    sort_order: num(raw.sort_order) ?? 0,
  };
}

export async function createCategoryAction(raw: Record<string, unknown>) {
  // Tạo mới mặc định là nháp; không cần quyền publish.
  const gate = await guard("categories.manage");
  if (gate) return gate;
  const store = getStore();
  const session = await getSession();
  const input = parseCategoryInput(raw);
  // Tạo mới LUÔN ở trạng thái nháp (admin sẽ bật công khai ở lượt sửa sau khi duyệt nội dung).
  input.status = "draft";
  input.is_published = false;
  if (!input.slug) return { ok: false, message: "Slug không được để trống." };
  if (!input.name_i18n?.en) return { ok: false, message: "Vui lòng nhập tên danh mục (tiếng Anh)." };
  if (await store.getCategoryBySlug(input.slug)) return { ok: false, message: `Slug "${input.slug}" đã tồn tại. Chọn slug khác.` };
  try {
    const created = await store.createCategory({
      ...(input as Partial<Category>),
      created_by: session?.uid ?? null,
      updated_by: session?.uid ?? null,
    });
    // Audit log
    await store.addAuditLog({
      actor_id: session?.uid ?? null,
      actor_email: session?.email ?? null,
      entity: "category",
      entity_id: created.id,
      action: "create",
      before: null,
      after: pickForAudit(created),
    });
    revalidateAll();
    return { ok: true, message: `Đã tạo danh mục "${created.name_i18n?.en ?? created.slug}" (trạng thái Nháp).`, id: created.id };
  } catch (err) {
    return { ok: false, message: categorySchemaError(err) ?? (err instanceof Error ? err.message : "Lỗi") };
  }
}

export async function updateCategoryAction(id: string, raw: Record<string, unknown>) {
  const gate = await guard("categories.manage");
  if (gate) return gate;
  const session = await getSession();
  const store = getStore();
  const existing = await store.getCategory(id);
  if (!existing) return { ok: false, message: "Danh mục không tồn tại." };

  const input = parseCategoryInput(raw);
  if (!Object.hasOwn(raw, "product_fields")) input.product_fields = existing.product_fields ?? [];

  // Content saves cannot also approve publication. Keep a separate status-only decision.
  const wasPublished = existing.is_published && existing.status === "published";
  const wantsPublished = input.is_published && input.status === "published";
  if (wantsPublished !== wasPublished) {
    return { ok: false, message: "Lưu nội dung trước, rồi xác nhận công khai/ẩn danh mục bằng thao tác riêng." };
  }

  // Nếu người chỉnh sửa KHÔNG có quyền publish → KHÔNG cho thay đổi trạng thái (giữ nguyên trạng thái cũ).
  const canPublish = !!(session && hasPermission(session.role, "categories.publish"));
  if (!canPublish) {
    input.status = existing.status ?? "draft";
    input.is_published = existing.is_published;
    // Hai cờ này cũng làm thay đổi nơi/khả năng xuất hiện trên website.
    if (input.active_on_homepage !== !!existing.active_on_homepage ||
      input.seo_indexable !== !!existing.seo_indexable) {
      return { ok: false, message: "Bạn không có quyền thay đổi hiển thị trang chủ hoặc lập chỉ mục." };
    }
  }

  // Slug unique check
  if (input.slug && input.slug !== existing.slug) {
    const dup = await store.getCategoryBySlug(input.slug);
    if (dup && dup.id !== id) return { ok: false, message: `Slug "${input.slug}" đã được dùng bởi danh mục khác.` };
  }

  // Body sanitize (chỉ cho phép p/h2-h4/ul/ol/li/a/strong/em/br).
  if (input.body_i18n?.en) {
    const { sanitizeHtml } = await import("@/lib/public/sanitize");
    input.body_i18n = { en: sanitizeHtml(input.body_i18n.en as string) };
  }

  const patch: Partial<Category> = { ...(input as Partial<Category>), updated_by: session?.uid ?? null };

  try {
    const updated = await store.updateCategory(id, patch);
    await store.addAuditLog({
      actor_id: session?.uid ?? null,
      actor_email: session?.email ?? null,
      entity: "category",
      entity_id: id,
      action: wantsPublished && !wasPublished ? "publish" : !wantsPublished && wasPublished ? "unpublish" : "update",
      before: pickForAudit(existing),
      after: pickForAudit(updated),
    });
    revalidateAll();
    return { ok: true, message: "Đã lưu danh mục." };
  } catch (err) {
    return { ok: false, message: categorySchemaError(err) ?? (err instanceof Error ? err.message : "Lỗi") };
  }
}

export async function deleteCategoryAction(id: string) {
  const gate = await guard("categories.manage");
  if (gate) return gate;
  const session = await getSession();
  const store = getStore();
  const cat = await store.getCategory(id);
  if (!cat) return { ok: false, message: "Danh mục không tồn tại." };
  const [products, rfqs] = await Promise.all([store.listProducts(), store.listRfqs({})]);
  const hasProducts = products.some((p) => (p.category ?? "").toLowerCase() === cat.slug);
  const hasRfqs = rfqs.some((r) => (r as { category?: string }).category === cat.slug);
  if (hasProducts || hasRfqs) {
    return {
      ok: false,
      message:
        "Không thể xoá vì đã có hồ sơ NCC/sản phẩm hoặc RFQ liên quan. Hãy chuyển trạng thái sang Nháp để ẩn khỏi trang công khai, thay vì xoá.",
    };
  }
  try {
    await store.deleteCategory(id);
    await store.addAuditLog({
      actor_id: session?.uid ?? null,
      actor_email: session?.email ?? null,
      entity: "category",
      entity_id: id,
      action: "delete",
      before: pickForAudit(cat),
      after: null,
    });
    revalidateAll();
    return { ok: true, message: "Đã xoá danh mục." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi" };
  }
}

/** Lấy bản tóm tắt các field hiển thị trong audit log (không log HTML body đầy đủ để khỏi rác). */
function pickForAudit(c: Category): Record<string, unknown> {
  return {
    slug: c.slug,
    name: c.name_i18n,
    status: c.status,
    is_published: c.is_published,
    active_on_homepage: c.active_on_homepage,
    seo_indexable: c.seo_indexable,
    hero_image: c.hero_image,
    previous_slugs: c.previous_slugs,
    sort_order: c.sort_order,
  };
}
