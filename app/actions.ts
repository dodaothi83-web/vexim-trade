"use server";

import { revalidatePath } from "next/cache";

import { dataStatus, getStore, resetSupabaseHealth, supabaseProbe } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { isOwnedBy, ownerScopeOf } from "@/lib/auth/scope";
import { MAX_FILES_PER_MAIL, MAX_TOTAL_BYTES, loadForSend, toRef } from "@/lib/mail/attachments";
import { deleteObject } from "@/lib/media/storage";
import { productReadiness } from "@/lib/media/readiness";
import { generateCompanyIntroduction } from "@/lib/ai/company-introduction";
import {
  saveDraft,
  sendManualMail,
  sendStageUpdate,
  sendSupplierAssigned,
  transport,
} from "@/lib/email/send";
import { getStage, isStage } from "@/lib/pipeline";
import { notifyRecipients } from "@/lib/mail/inbound";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import type {
  Buyer,
  BuyerInput,
  ProspectInput,
  ProspectActivityChannel,
  EmailAttachment,
  SupplierInput,
  SupplierProductInput,
} from "@/lib/types";

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
    revalidatePath(`/prospects/${id}`);
    revalidatePath("/prospects");
    return {
      ok: true,
      message: "Đã tạo phần giới thiệu công ty.",
      summary: result.summary,
      sources: result.sources,
      analyzedAt,
      reused: false,
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
      author: input.author ?? null,
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
        created_by: input.author ?? null,
      })
      .catch(() => null);
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

  const id = await saveDraft({
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
    author: input.author ?? null,
  });

  // Tệp của bản nháp: gắn với email nháp để mở lại vẫn còn, chưa coi là đã gửi
  if (id) {
    const store = getStore();
    for (const row of attachmentRows) {
      await store
        .updateAttachment(row.id, { message_id: id, status: "uploaded", last_error: null })
        .catch(() => null);
    }
    await syncMessageRefs(id, attachmentRows);
  }
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

  const res = await transport({
    to: msg.to_emails,
    cc: msg.cc_emails,
    bcc: msg.bcc_emails,
    subject: msg.subject,
    html: msg.body_html,
    text: msg.body_text,
    attachments: forSend,
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
  const gate = await guard("mail.view");
  if (gate) return gate;
  const now = new Date().toISOString();
  const store = getStore();
  const messages = await store.listMessages(500).catch(() => []);
  const targets = messages.filter(
    (m) => m.thread_id === threadIdValue && m.kind === "inbound" && !m.read_at,
  );
  for (const m of targets) {
    await store.updateMessage(m.id, { read_at: now }).catch(() => null);
  }
  revalidatePath("/mail");
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
  company_website: string;
}): Promise<ActionResult> {
  const thanks =
    "Thank you. Your enquiry is with our export desk, and we reply within one working day.";
  // Bot điền honeypot => giả vờ thành công, không ghi gì vào CRM
  if (input.company_website?.trim()) return { ok: true, message: thanks };

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Please provide a valid email address." };
  }
  if (!input.company.trim()) {
    return { ok: false, message: "Please tell us your company name." };
  }
  if (!input.message.trim()) {
    return { ok: false, message: "Please describe your requirement briefly." };
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
    const requestText = [...requestLines, input.message.trim()].join("\n");

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
        source: "Website veximtrade.com",
        priority: "normal",
        next_action: "Reply to website enquiry",
        next_action_date: null,
        notes: `Website enquiry ${new Date().toISOString().slice(0, 10)}:\n${
          input.lead_time?.trim() ? `Lead time required: ${input.lead_time.trim()}\n` : ""
        }${input.message.trim()}`,
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
          `Quốc gia: ${escapeHtml(input.country.trim() || "—")}</p>` +
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
          `<p>Thank you for contacting Vexim Trade. Your enquiry has reached our export desk ` +
          `and we will reply within one working day.</p>` +
          `<p>Best regards,<br/>Export Department &middot; Vexim Trade</p>`,
      });
      await transport({
        to: [email],
        subject: "Thank you for your enquiry – Vexim Trade",
        html,
        text: "Thank you for contacting Vexim Trade. Our export desk will reply within one working day.",
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
