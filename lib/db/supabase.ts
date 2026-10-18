import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  Activity,
  AppUser,
  AppUserInput,
  AppUserRecord,
  AuditLogEntry,
  Buyer,
  BuyerInput,
  Category,
  Certificate,
  Introduction,
  Prospect,
  ProspectInput,
  ProspectActivity,
  ProspectActivityChannel,
  ProspectOutreachTemplate,
  EmailAttachment,
  EmailMessage,
  MediaAsset,
  MediaInput,
  MediaOwnerType,
  Rfq,
  RfqAttachment,
  RfqMatch,
  SupplierRfqInvitation,
  SupplierNoticeRead,
  Supplier,
  SupplierInput,
  SupplierVerificationRequest,
  SupplierCategory,
  SupplierProduct,
  SupplierProductInput,
  TemplateOverride,
  Post,
  PostInput,
  PostStatus,
  Verification,
} from "@/lib/types";
import type { DataStore } from "@/lib/db/types";
import { isTestOnlyProduct, productBelongsToCategory, productReviewApproved } from "@/lib/public/product-selection";

/** Bỏ các khoá undefined khỏi patch để không vô tình ghi đè mất dữ liệu cũ. */
function cleanPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

let client: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

export function supabaseUrl(): string | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url ? url.trim().replace(/\/+$/, "") : null;
}

/** Mã dự án (ref) lấy từ URL, ví dụ axvphurlpczysvzabgkm */
export function supabaseProjectRef(): string | null {
  const url = supabaseUrl();
  if (!url) return null;
  const m = /^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)$/i.exec(url);
  return m ? m[1] : null;
}

/**
 * Client dùng cho TRUY VẤN DỮ LIỆU (PostgREST).
 *
 * TUYỆT ĐỐI không gọi `auth.signIn*` trên client này: supabase-js gắn token của
 * phiên đăng nhập vào mọi request REST qua `fetchWithAuth` (xem
 * node_modules/@supabase/supabase-js: `this.fetch = fetchWithAuth(key, url,
 * this._getSessionToken.bind(this))`). Nếu có phiên, mọi truy vấn sẽ chạy dưới
 * danh nghĩa người dùng vừa đăng nhập — lúc đó mới thấy dữ liệu, còn ở worker
 * khác (không có phiên) lại quay về khoá gốc → RLS ẩn dữ liệu → bị đá về /login.
 * Phần xác thực dùng getSupabaseAuthClient().
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  const url = supabaseUrl();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Client riêng chỉ để xác thực (signIn, admin.createUser, admin.updateUserById…). */
export function getSupabaseAuthClient(): SupabaseClient | null {
  if (authClient) return authClient;
  const url = supabaseUrl();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  authClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return authClient;
}

/**
 * Vai trò ghi trong khoá Supabase đang cấu hình (`anon` hay `service_role`).
 * Khoá anon KHÔNG bỏ qua RLS → app sẽ không đọc/ghi được bảng bật RLS như app_users.
 */
export function supabaseKeyRole(): "service_role" | "anon" | "unknown" | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl() || !key) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { role?: string };
    if (payload.role === "service_role") return "service_role";
    if (payload.role === "anon") return "anon";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function supabaseConfigured(): boolean {
  return getSupabaseClient() !== null;
}

/** Ẩn hash mật khẩu trước khi trả ra ngoài */
function toPublicUser(row: AppUserRecord): AppUser {
  const has_local_password = Boolean(row.password_hash);
  const { password_hash: _omit, ...rest } = row;
  void _omit;
  return {
    ...rest,
    signature_html: row.signature_html ?? null,
    phone: row.phone ?? null,
    // null = chưa đặt tay -> địa chỉ gửi tự sinh từ họ tên (lib/email/sender.ts)
    sender_email: row.sender_email ?? null,
    has_local_password,
  };
}

function must(): SupabaseClient {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase chưa được cấu hình");
  return c;
}

function fail(op: string, error: { message: string } | null): never {
  throw new Error(`${op}: ${error?.message ?? "lỗi không xác định"}`);
}

/** Only this exact PostgREST schema-cache mismatch gets a single-price compatibility retry. */
function missingProductPriceRangeColumn(error: { code?: string; message: string } | null): boolean {
  return !!error && (error.code === "PGRST204" || /schema cache/i.test(error.message)) &&
    /['"]ref_price_max['"]/.test(error.message) && /supplier_products/.test(error.message);
}

function priceRangeMigrationRequired(): never {
  // Never silently discard an entered upper bound: the buyer could see a false single price.
  throw new Error("Chưa lưu giá đến: PostgREST chưa nhận diện cột supplier_products.ref_price_max (migration chưa áp dụng hoặc schema cache chưa cập nhật). Vexim cần kiểm tra đúng project, áp dụng migration 20261017_product_reference_price_range.sql nếu thiếu cột hoặc nạp lại schema cache nếu cột đã có; các thay đổi trong lần lưu này chưa được ghi.");
}

/** public_page_ready is derived on read; never send it back to PostgREST. */
async function decorateCategoryReadiness(rows: Category[]): Promise<Category[]> {
  if (!rows.length) return rows;
  const [productsResult, suppliersResult] = await Promise.all([
    must().from("supplier_products").select("supplier_id, name, category, spec, description, ready_for_buyer, supplier_review_status, supplier_originated, reviewed_category_slug"),
    must().from("suppliers").select("id, status, is_demo"),
  ]);
  if (productsResult.error) fail("categoryReadiness:products", productsResult.error);
  if (suppliersResult.error) fail("categoryReadiness:suppliers", suppliersResult.error);
  const published = new Set((suppliersResult.data ?? []).filter((s) => s.status === "published" &&
    (!s.is_demo || process.env.VEXIM_SHOW_DEMO === "true")).map((s) => s.id));
  const demoIds = new Set((suppliersResult.data ?? []).filter((s) => s.is_demo && process.env.VEXIM_SHOW_DEMO === "true").map((s) => s.id));
  const visible = (productsResult.data ?? []).filter((p) => published.has(p.supplier_id) &&
    productReviewApproved(p) && !isTestOnlyProduct(p.name) && (p.ready_for_buyer || demoIds.has(p.supplier_id)));
  return rows.map((c) => ({ ...c, public_page_ready: visible.some((p) =>
    productBelongsToCategory(p, c, rows)) }));
}

export const supabaseStore: DataStore = {
  mode: "supabase",

  async listSuppliers() {
    const { data, error } = await must()
      .from("suppliers")
      .select("*")
      .order("name", { ascending: true });
    if (error) fail("listSuppliers", error);
    return (data ?? []) as Supplier[];
  },
  async getSupplier(id) {
    const { data, error } = await must()
      .from("suppliers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) fail("getSupplier", error);
    return (data as Supplier) ?? null;
  },
  async createSupplier(input: SupplierInput) {
    const { data, error } = await must()
      .from("suppliers")
      .insert(input)
      .select()
      .single();
    if (error) fail("createSupplier", error);
    return data as Supplier;
  },
  async updateSupplier(id, patch) {
    const { data, error } = await must()
      .from("suppliers")
      .update({ ...cleanPatch(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateSupplier", error);
    return data as Supplier;
  },
  async deleteSupplier(id) {
    const { error } = await must().from("suppliers").delete().eq("id", id);
    if (error) fail("deleteSupplier", error);
  },

  async listSupplierVerificationRequests(supplierId) {
    let query = must().from("supplier_verification_requests").select("*").order("requested_at", { ascending: false });
    if (supplierId) query = query.eq("supplier_id", supplierId);
    const { data, error } = await query;
    if (error) fail("listSupplierVerificationRequests", error);
    return (data ?? []) as SupplierVerificationRequest[];
  },
  async createSupplierVerificationRequest(supplierId, level) {
    const { data, error } = await must().from("supplier_verification_requests")
      .insert({ supplier_id: supplierId, target_level: level, status: "requested" }).select().single();
    if (error) fail("createSupplierVerificationRequest", error);
    return data as SupplierVerificationRequest;
  },
  async markSupplierVerificationContacted(supplierId, level, actorId) {
    const { data, error } = await must().from("supplier_verification_requests")
      .update({ status: "contacted", contacted_at: new Date().toISOString(), contacted_by: actorId })
      .eq("supplier_id", supplierId).eq("target_level", level).eq("status", "requested").select().maybeSingle();
    if (error) fail("markSupplierVerificationContacted", error);
    if (data) return data as SupplierVerificationRequest;
    const existing = (await this.listSupplierVerificationRequests(supplierId)).find((r) => r.target_level === level);
    if (!existing) throw new Error("Không có yêu cầu này.");
    return existing;
  },

  async listProducts() {
    const { data, error } = await must()
      .from("supplier_products")
      .select("*")
      .order("name", { ascending: true });
    if (error) fail("listProducts", error);
    return (data ?? []) as SupplierProduct[];
  },
  async getProduct(id) {
    const { data, error } = await must()
      .from("supplier_products")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) fail("getProduct", error);
    return (data as SupplierProduct) ?? null;
  },
  async listProductsBySupplier(supplierId) {
    const { data, error } = await must()
      .from("supplier_products")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("name", { ascending: true });
    if (error) fail("listProductsBySupplier", error);
    return (data ?? []) as SupplierProduct[];
  },
  async createProduct(input: SupplierProductInput) {
    const write = (payload: Partial<SupplierProductInput>) => must()
      .from("supplier_products").insert(payload).select().single();
    let result = await write(input);
    if (missingProductPriceRangeColumn(result.error)) {
      if (input.ref_price_max != null) priceRangeMigrationRequired();
      // Old databases can still create a SINGLE-price product. Do not drop a real upper bound.
      const { ref_price_max: _missing, ...legacy } = input;
      void _missing;
      result = await write(legacy);
    }
    if (result.error) fail("createProduct", result.error);
    return result.data as SupplierProduct;
  },
  async updateProduct(id, patch) {
    const write = (payload: Partial<SupplierProductInput> & { updated_at: string }) => must()
      .from("supplier_products").update(payload).eq("id", id).select().single();
    const fields = { ...cleanPatch(patch), updated_at: new Date().toISOString() };
    let result = await write(fields);
    if (missingProductPriceRangeColumn(result.error)) {
      if (patch.ref_price_max != null) priceRangeMigrationRequired();
      // Retrying only a missing NULL preserves old single-price saves without weakening other gates.
      const { ref_price_max: _missing, ...legacy } = fields;
      void _missing;
      result = await write(legacy);
    }
    if (result.error) fail("updateProduct", result.error);
    return result.data as SupplierProduct;
  },
  async deleteProduct(id) {
    const { error } = await must().from("supplier_products").delete().eq("id", id);
    if (error) fail("deleteProduct", error);
  },

  async listUsers() {
    const cols =
      "id,email,name,role,auth_provider,password_hash,is_active,last_login_at,sender_email,created_at,updated_at";
    const res = await must().from("app_users").select(cols).order("email", { ascending: true });
    // Chưa chạy migration 20261012_user_sender_email.sql -> chưa có cột sender_email.
    // Không để trang đăng nhập/hồ sơ chết vì cột này: đọc lại không lấy cột đó, coi như null
    // (địa chỉ gửi khi đó vẫn tự sinh đúng, chỉ không lưu được bản đặt tay).
    if (res.error && /sender_email/.test(res.error.message)) {
      const retry = await must()
        .from("app_users")
        .select(cols.replace(",sender_email", ""))
        .order("email", { ascending: true });
      if (!retry.error) return ((retry.data ?? []) as unknown as AppUserRecord[]).map(toPublicUser);
    }
    if (res.error) fail("listUsers", res.error);
    return ((res.data ?? []) as unknown as AppUserRecord[]).map(toPublicUser);
  },
  async countUsers() {
    const { count, error } = await must()
      .from("app_users")
      .select("id", { count: "exact", head: true });
    if (error) fail("countUsers", error);
    return count ?? 0;
  },
  async getUser(id) {
    const { data, error } = await must()
      .from("app_users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) fail("getUser", error);
    return (data as AppUserRecord) ?? null;
  },
  async getUserByEmail(email) {
    const { data, error } = await must()
      .from("app_users")
      .select("*")
      .ilike("email", email.trim())
      .maybeSingle();
    if (error) fail("getUserByEmail", error);
    return (data as AppUserRecord) ?? null;
  },
  async getUserBySupplierId(supplierId) {
    const { data, error } = await must()
      .from("app_users")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) fail("getUserBySupplierId", error);
    return ((data ?? [])[0] as AppUserRecord) ?? null;
  },
  async createUser(input: AppUserInput) {
    const { data, error } = await must()
      .from("app_users")
      .insert(input)
      .select()
      .single();
    if (error) fail("createUser", error);
    return data as AppUserRecord;
  },
  async updateUser(id, patch) {
    const { data, error } = await must()
      .from("app_users")
      .update({ ...cleanPatch(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateUser", error);
    return data as AppUserRecord;
  },
  async claimSupplierForUser(userId, supplierId) {
    const { data, error } = await must().from("app_users")
      .update({ supplier_id: supplierId, updated_at: new Date().toISOString() })
      .eq("id", userId).eq("role", "supplier").eq("is_active", true)
      .is("supplier_id", null).select("id");
    if (error) fail("claimSupplierForUser", error);
    return (data?.length ?? 0) === 1;
  },
  async deleteUser(id) {
    const { error } = await must().from("app_users").delete().eq("id", id);
    if (error) fail("deleteUser", error);
  },
  async touchUserLogin(id) {
    await must()
      .from("app_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", id);
  },

  async listMedia(ownerType: MediaOwnerType, ownerId: string) {
    const column =
      ownerType === "product" ? "product_id" :
      ownerType === "verification" ? "verification_id" :
      "supplier_id";
    const { data, error } = await must()
      .from("media_assets")
      .select("*")
      .eq("owner_type", ownerType)
      .eq(column, ownerId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) fail("listMedia", error);
    return (data ?? []) as MediaAsset[];
  },
  async listMediaForProducts(productIds) {
    if (!productIds.length) return [];
    const { data, error } = await must()
      .from("media_assets")
      .select("*")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) fail("listMediaForProducts", error);
    return (data ?? []) as MediaAsset[];
  },
  async listMediaForSuppliers(supplierIds) {
    if (!supplierIds.length) return [];
    const { data, error } = await must()
      .from("media_assets")
      .select("*")
      .in("supplier_id", supplierIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) fail("listMediaForSuppliers", error);
    return (data ?? []) as MediaAsset[];
  },
  async getMedia(id) {
    const { data, error } = await must()
      .from("media_assets")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) fail("getMedia", error);
    return (data as MediaAsset) ?? null;
  },
  async getMediaByPath(storagePath) {
    const { data, error } = await must()
      .from("media_assets")
      .select("*")
      .or(`storage_path.eq.${storagePath},thumb_path.eq.${storagePath}`)
      .limit(1)
      .maybeSingle();
    if (error) fail("getMediaByPath", error);
    return (data as MediaAsset) ?? null;
  },
  async createMedia(input: MediaInput) {
    const { data, error } = await must()
      .from("media_assets")
      .insert(input)
      .select()
      .single();
    if (error) fail("createMedia", error);
    return data as MediaAsset;
  },
  async updateMedia(id, patch) {
    const { data, error } = await must()
      .from("media_assets")
      .update({ ...cleanPatch(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateMedia", error);
    return data as MediaAsset;
  },
  async deleteMedia(id) {
    const { error } = await must().from("media_assets").delete().eq("id", id);
    if (error) fail("deleteMedia", error);
  },

  async listBuyers() {
    const { data, error } = await must()
      .from("buyers")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) fail("listBuyers", error);
    return (data ?? []) as Buyer[];
  },
  async getBuyer(id) {
    const { data, error } = await must()
      .from("buyers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) fail("getBuyer", error);
    return (data as Buyer) ?? null;
  },
  async createBuyer(input: BuyerInput) {
    const { data, error } = await must()
      .from("buyers")
      .insert(input)
      .select()
      .single();
    if (error) fail("createBuyer", error);
    return data as Buyer;
  },
  async updateBuyer(id, patch) {
    const { data, error } = await must()
      .from("buyers")
      .update({ ...cleanPatch(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateBuyer", error);
    return data as Buyer;
  },
  async deleteBuyer(id) {
    const { error } = await must().from("buyers").delete().eq("id", id);
    if (error) fail("deleteBuyer", error);
  },

  async listProspects() {
    const { data, error } = await must()
      .from("prospects")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) fail("listProspects", error);
    return (data ?? []) as Prospect[];
  },
  async getProspect(id) {
    const { data, error } = await must()
      .from("prospects")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) fail("getProspect", error);
    return (data as Prospect) ?? null;
  },
  async createProspect(input: ProspectInput) {
    const { data, error } = await must()
      .from("prospects")
      .insert(input)
      .select()
      .single();
    if (error) fail("createProspect", error);
    return data as Prospect;
  },
  async createProspects(inputs: ProspectInput[]) {
    if (!inputs.length) return [];
    const { data, error } = await must()
      .from("prospects")
      .insert(inputs)
      .select();
    if (error) fail("createProspects", error);
    return (data ?? []) as Prospect[];
  },
  async updateProspect(id, patch) {
    const { data, error } = await must()
      .from("prospects")
      .update({ ...cleanPatch(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateProspect", error);
    return data as Prospect;
  },
  async deleteProspect(id) {
    const { error } = await must().from("prospects").delete().eq("id", id);
    if (error) fail("deleteProspect", error);
  },
  async listProspectActivities(prospectId) {
    const { data, error } = await must()
      .from("prospect_activities")
      .select("*")
      .eq("prospect_id", prospectId)
      .order("created_at", { ascending: false });
    if (error) fail("listProspectActivities", error);
    return (data ?? []) as ProspectActivity[];
  },
  async addProspectActivity(input: {
    prospect_id: string;
    channel: ProspectActivityChannel;
    summary: string;
    created_by?: string | null;
  }) {
    const { data, error } = await must()
      .from("prospect_activities")
      .insert(input)
      .select()
      .single();
    if (error) fail("addProspectActivity", error);
    return data as ProspectActivity;
  },
  async addProspectActivities(inputs) {
    if (!inputs.length) return [];
    const { data, error } = await must()
      .from("prospect_activities")
      .insert(inputs)
      .select();
    if (error) fail("addProspectActivities", error);
    return (data ?? []) as ProspectActivity[];
  },

  async listActivities(buyerId) {
    let q = must().from("buyer_activities").select("*");
    if (buyerId) q = q.eq("buyer_id", buyerId);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) fail("listActivities", error);
    return (data ?? []) as Activity[];
  },
  async addActivity(input) {
    const { data, error } = await must()
      .from("buyer_activities")
      .insert(input)
      .select()
      .single();
    if (error) fail("addActivity", error);
    return data as Activity;
  },

  async listMessages(limit = 200) {
    const { data, error } = await must()
      .from("email_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) fail("listMessages", error);
    return (data ?? []) as EmailMessage[];
  },
  async listMessagesForRfq(rfqId) {
    const { data, error } = await must()
      .from("email_messages")
      .select("*")
      .eq("rfq_id", rfqId)
      .order("created_at", { ascending: false });
    if (error) fail("listMessagesForRfq", error);
    return (data ?? []) as EmailMessage[];
  },
  async getMessage(id) {
    const { data, error } = await must()
      .from("email_messages")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) fail("getMessage", error);
    return (data as EmailMessage) ?? null;
  },
  async addMessage(input) {
    const { data, error } = await must()
      .from("email_messages")
      .insert(input)
      .select()
      .single();
    if (error) fail("addMessage", error);
    return data as EmailMessage;
  },
  async updateMessage(id, patch) {
    const { data, error } = await must()
      .from("email_messages")
      .update(cleanPatch(patch))
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateMessage", error);
    return data as EmailMessage;
  },
  async deleteMessage(id) {
    const { error } = await must().from("email_messages").delete().eq("id", id);
    if (error) fail("deleteMessage", error);
  },

  /* ----------------------- ghi đè nội dung template ----------------------- */
  async listTemplateOverrides() {
    try {
      const { data, error } = await must().from("email_template_overrides").select("*");
      if (error) fail("listTemplateOverrides", error);
      return (data ?? []) as TemplateOverride[];
    } catch {
      // Chưa tạo bảng trên Supabase => dùng nội dung mặc định, không chặn gửi thư
      return [];
    }
  },
  async saveTemplateOverride(o) {
    const { error } = await must()
      .from("email_template_overrides")
      .upsert({ ...o, updated_at: new Date().toISOString() }, { onConflict: "stage,dir" });
    if (error) fail("saveTemplateOverride", error);
  },
  async clearTemplateOverride(stage, dir) {
    const { error } = await must()
      .from("email_template_overrides")
      .delete()
      .eq("stage", stage)
      .eq("dir", dir);
    if (error) fail("clearTemplateOverride", error);
  },
  async listProspectOutreachTemplateOverrides() {
    try {
      const { data, error } = await must().from("prospect_outreach_templates").select("*");
      if (error) fail("listProspectOutreachTemplateOverrides", error);
      return (data ?? []) as ProspectOutreachTemplate[];
    } catch {
      return [];
    }
  },
  async saveProspectOutreachTemplateOverride(input) {
    const { error } = await must()
      .from("prospect_outreach_templates")
      .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) fail("saveProspectOutreachTemplateOverride", error);
  },
  async clearProspectOutreachTemplateOverride(id) {
    const { error } = await must().from("prospect_outreach_templates").delete().eq("id", id);
    if (error) fail("clearProspectOutreachTemplateOverride", error);
  },

  /* ----------------------- tệp đính kèm email (metadata) ----------------------- */
  async createAttachment(input) {
    const { data, error } = await must()
      .from("email_attachments")
      .insert(input)
      .select()
      .single();
    if (error) fail("createAttachment", error);
    return data as EmailAttachment;
  },
  async getAttachment(id) {
    const { data, error } = await must()
      .from("email_attachments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) fail("getAttachment", error);
    return (data as EmailAttachment) ?? null;
  },
  async listAttachments(ids) {
    if (!ids.length) return [];
    const { data, error } = await must().from("email_attachments").select("*").in("id", ids);
    if (error) fail("listAttachments", error);
    return (data ?? []) as EmailAttachment[];
  },
  async listAttachmentsForMessage(messageId) {
    const { data, error } = await must()
      .from("email_attachments")
      .select("*")
      .eq("message_id", messageId)
      .neq("status", "deleted")
      .order("created_at", { ascending: true });
    if (error) fail("listAttachmentsForMessage", error);
    return (data ?? []) as EmailAttachment[];
  },
  async listOrphanAttachments(olderThanISO) {
    const { data, error } = await must()
      .from("email_attachments")
      .select("*")
      .is("message_id", null)
      .neq("status", "deleted")
      .lt("created_at", olderThanISO)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) fail("listOrphanAttachments", error);
    return (data ?? []) as EmailAttachment[];
  },
  async updateAttachment(id, patch) {
    const { data, error } = await must()
      .from("email_attachments")
      .update(cleanPatch(patch))
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateAttachment", error);
    return data as EmailAttachment;
  },
  async deleteAttachment(id) {
    const { error } = await must().from("email_attachments").delete().eq("id", id);
    if (error) fail("deleteAttachment", error);
  },

  /* ----------------------------- bài viết blog ----------------------------- */
  async listPosts(options?: { status?: PostStatus }) {
    let query = must().from("posts").select("*").order("published_at", { ascending: false, nullsFirst: false });
    if (options?.status) query = query.eq("status", options.status);
    const { data, error } = await query;
    if (error) fail("listPosts", error);
    return (data ?? []) as Post[];
  },
  async getPost(id) {
    const { data, error } = await must().from("posts").select("*").eq("id", id).maybeSingle();
    if (error) fail("getPost", error);
    return (data as Post | null) ?? null;
  },
  async getPostBySlug(slug, options) {
    let query = must().from("posts").select("*").eq("slug", slug);
    if (options?.publishedOnly) query = query.eq("status", "published");
    const { data, error } = await query.maybeSingle();
    if (error) fail("getPostBySlug", error);
    return (data as Post | null) ?? null;
  },
  async createPost(input) {
    const { data, error } = await must().from("posts").insert(input).select("*").single();
    if (error) fail("createPost", error);
    return data as Post;
  },
  async updatePost(id, patch) {
    const { data, error } = await must()
      .from("posts")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) fail("updatePost", error);
    return data as Post;
  },
  async deletePost(id) {
    const { error } = await must().from("posts").delete().eq("id", id);
    if (error) fail("deletePost", error);
  },

  /* ----------------------- RFQ FOUNDATION (GĐ0-GĐ2) ----------------------- */

  // --- Categories ---
  async listCategories(options?: { publishedOnly?: boolean }) {
    let q = must().from("categories").select("*").order("sort_order", { ascending: true });
    if (options?.publishedOnly) q = q.eq("is_published", true);
    const { data, error } = await q;
    if (error) fail("listCategories", error);
    return decorateCategoryReadiness((data ?? []) as Category[]);
  },
  async getCategory(id) {
    const { data, error } = await must().from("categories").select("*").eq("id", id).maybeSingle();
    if (error) fail("getCategory", error);
    if (!data) return null;
    return (await decorateCategoryReadiness([data as Category]))[0];
  },
  async getCategoryBySlug(slug) {
    const { data, error } = await must().from("categories").select("*").eq("slug", slug).maybeSingle();
    if (error) fail("getCategoryBySlug", error);
    if (!data) return null;
    return (await decorateCategoryReadiness([data as Category]))[0];
  },
  async createCategory(input) {
    const { public_page_ready: _computed, ...fields } = input;
    void _computed;
    const { data, error } = await must().from("categories").insert(cleanPatch(fields)).select().single();
    if (error) fail("createCategory", error);
    return data as Category;
  },
  async updateCategory(id, patch) {
    const { public_page_ready: _computed, ...fields } = patch;
    void _computed;
    const { data, error } = await must()
      .from("categories")
      .update(cleanPatch({ ...fields, updated_at: new Date().toISOString() }))
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateCategory", error);
    return data as Category;
  },
  async deleteCategory(id) {
    const { error } = await must().from("categories").delete().eq("id", id);
    if (error) fail("deleteCategory", error);
  },

  // --- Supplier categories (N-N) ---
  async setSupplierCategories(supplierId, categoryIds, primaryId) {
    const existing = await this.listSupplierCategories(supplierId);
    const ids = [...new Set(categoryIds)];
    // Upsert first: an insertion failure must not erase existing supplier industries.
    if (ids.length) {
      const rows = ids.map((cid) => ({
        supplier_id: supplierId, category_id: cid,
        is_primary: primaryId ? cid === primaryId : cid === ids[0],
      }));
      const { error } = await must().from("supplier_categories").upsert(rows, { onConflict: "supplier_id,category_id" });
      if (error) fail("setSupplierCategories:upsert", error);
    }
    const stale = existing.filter((row) => !ids.includes(row.category_id)).map((row) => row.category_id);
    if (stale.length) {
      const { error } = await must().from("supplier_categories").delete().eq("supplier_id", supplierId).in("category_id", stale);
      if (error) fail("setSupplierCategories:delete", error);
    }
  },
  async listSupplierCategories(supplierId) {
    const { data, error } = await must()
      .from("supplier_categories")
      .select("*")
      .eq("supplier_id", supplierId);
    if (error) fail("listSupplierCategories", error);
    return (data ?? []) as SupplierCategory[];
  },

  // --- Certificates ---
  async listCertificates(supplierId) {
    const { data, error } = await must()
      .from("certificates")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false });
    if (error) fail("listCertificates", error);
    return (data ?? []) as Certificate[];
  },
  async getCertificate(id) {
    const { data, error } = await must().from("certificates").select("*").eq("id", id).maybeSingle();
    if (error) fail("getCertificate", error);
    return (data as Certificate) ?? null;
  },
  async createCertificate(input) {
    const { data, error } = await must().from("certificates").insert(cleanPatch(input)).select().single();
    if (error) fail("createCertificate", error);
    return data as Certificate;
  },
  async updateCertificate(id, patch) {
    const { data, error } = await must()
      .from("certificates")
      .update(cleanPatch({ ...patch, updated_at: new Date().toISOString() }))
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateCertificate", error);
    return data as Certificate;
  },
  async deleteCertificate(id) {
    const { error } = await must().from("certificates").delete().eq("id", id);
    if (error) fail("deleteCertificate", error);
  },

  // --- Verifications ---
  async listVerifications(supplierId) {
    let q = must().from("verifications").select("*").order("created_at", { ascending: false });
    if (supplierId) q = q.eq("supplier_id", supplierId);
    const { data, error } = await q;
    if (error) fail("listVerifications", error);
    return (data ?? []) as Verification[];
  },
  async getVerification(id) {
    const { data, error } = await must().from("verifications").select("*").eq("id", id).maybeSingle();
    if (error) fail("getVerification", error);
    return (data as Verification | null) ?? null;
  },
  async createVerification(input) {
    const { data, error } = await must().from("verifications").insert(cleanPatch(input)).select().single();
    if (error) fail("createVerification", error);
    return data as Verification;
  },
  async updateVerification(id, patch) {
    const { data, error } = await must()
      .from("verifications")
      .update(cleanPatch({ ...patch, updated_at: new Date().toISOString() }))
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateVerification", error);
    const v = data as Verification;
    // Recompute supplier verification_level.
    try {
      const { data: approved } = await must()
        .from("verifications")
        .select("target_level")
        .eq("supplier_id", v.supplier_id)
        .eq("status", "approved");
      const lvl = (approved ?? []).reduce((m, x) => Math.max(m, Number(x.target_level) || 0), 0);
      const { data: supplier, error: readError } = await must()
        .from("suppliers").select("verification_level,verified_at").eq("id", v.supplier_id).single();
      if (readError) throw readError;
      if (Number(supplier.verification_level ?? 0) !== lvl || (lvl > 0 && !supplier.verified_at)) {
        const { error: updateError } = await must().from("suppliers")
          .update({ verification_level: lvl, verified_at: lvl > 0 ? new Date().toISOString() : null })
          .eq("id", v.supplier_id);
        if (updateError) throw updateError;
      }
    } catch (error) { console.error("[verification] could not sync supplier badge", error); }
    return v;
  },

  // --- RFQs ---
  async listRfqs(options) {
    let q = must().from("rfqs").select("*").order("created_at", { ascending: false });
    if (options?.status) q = q.eq("status", options.status);
    if (options?.assignedTo !== undefined) {
      if (options.assignedTo === null) q = q.is("assigned_to", null);
      else q = q.eq("assigned_to", options.assignedTo);
    }
    const { data, error } = await q;
    if (error) fail("listRfqs", error);
    return (data ?? []) as Rfq[];
  },
  async getRfq(id) {
    const { data, error } = await must().from("rfqs").select("*").eq("id", id).maybeSingle();
    if (error) fail("getRfq", error);
    return (data as Rfq | null) ?? null;
  },
  async getRfqByToken(token) {
    const { data, error } = await must().from("rfqs").select("*").eq("access_token", token).maybeSingle();
    if (error) fail("getRfqByToken", error);
    return (data as Rfq | null) ?? null;
  },
  async getRfqByCode(code) {
    const { data, error } = await must().from("rfqs").select("*").eq("code", code).maybeSingle();
    if (error) fail("getRfqByCode", error);
    return (data as Rfq | null) ?? null;
  },
  async createRfq(input) {
    const { data, error } = await must().from("rfqs").insert(cleanPatch(input)).select().single();
    if (error) fail("createRfq", error);
    return data as Rfq;
  },
  async updateRfq(id, patch) {
    const { data, error } = await must()
      .from("rfqs")
      .update(cleanPatch({ ...patch, updated_at: new Date().toISOString() }))
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateRfq", error);
    return data as Rfq;
  },

  // --- RFQ attachments ---
  async listRfqAttachments(rfqId) {
    const { data, error } = await must()
      .from("rfq_attachments")
      .select("*")
      .eq("rfq_id", rfqId)
      .order("created_at", { ascending: true });
    if (error) fail("listRfqAttachments", error);
    return (data ?? []) as RfqAttachment[];
  },
  async createRfqAttachment(input) {
    const { data, error } = await must().from("rfq_attachments").insert(cleanPatch(input)).select().single();
    if (error) fail("createRfqAttachment", error);
    return data as RfqAttachment;
  },
  async deleteRfqAttachment(id) {
    const { error } = await must().from("rfq_attachments").delete().eq("id", id);
    if (error) fail("deleteRfqAttachment", error);
  },

  // --- RFQ matches ---
  async listRfqMatches(rfqId) {
    const { data, error } = await must()
      .from("rfq_matches")
      .select("*")
      .eq("rfq_id", rfqId)
      .order("created_at", { ascending: true });
    if (error) fail("listRfqMatches", error);
    return (data ?? []) as RfqMatch[];
  },
  async listSupplierRfqInvitations(supplierId) {
    const all: SupplierRfqInvitation[] = [];
    // Page deliberately: PostgREST defaults to 1,000 rows, which would silently undercount reports.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await must().from("rfq_matches")
        .select("id,rfq_id,supplier_id,status,sent_to_supplier_at,response_due_at,supplier_replied_at,quote_price,quote_currency,quote_unit,created_at,updated_at,rfq:rfqs!inner(code,product_text,quantity,unit,destination_country,incoterm,needed_by,source_product_id)")
        .eq("supplier_id", supplierId).not("sent_to_supplier_at", "is", null).neq("status", "proposed")
        .order("sent_to_supplier_at", { ascending: false }).range(offset, offset + 499);
      if (error) fail("listSupplierRfqInvitations", error);
      const batch = (data ?? []) as unknown as SupplierRfqInvitation[];
      all.push(...batch);
      if (batch.length < 500) break;
    }
    return all;
  },
  async listSupplierNoticeReads(supplierId) {
    const all: SupplierNoticeRead[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await must().from("supplier_portal_notice_reads").select("*")
        .eq("supplier_id", supplierId).order("read_at", { ascending: false }).range(offset, offset + 499);
      if (error) fail("listSupplierNoticeReads", error);
      const batch = (data ?? []) as SupplierNoticeRead[];
      all.push(...batch);
      if (batch.length < 500) break;
    }
    return all;
  },
  async markSupplierNoticeRead(supplierId, noticeKey) {
    const { error } = await must().from("supplier_portal_notice_reads")
      .upsert({ supplier_id: supplierId, notice_key: noticeKey }, { onConflict: "supplier_id,notice_key", ignoreDuplicates: true });
    if (error) fail("markSupplierNoticeRead", error);
  },
  async getRfqMatch(id) {
    const { data, error } = await must()
      .from("rfq_matches")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) fail("getRfqMatch", error);
    return (data ?? null) as RfqMatch | null;
  },
  async createRfqMatch(input) {
    const { data, error } = await must().from("rfq_matches").insert(cleanPatch(input)).select().single();
    if (error) fail("createRfqMatch", error);
    return data as RfqMatch;
  },
  async updateRfqMatch(id, patch) {
    const { data, error } = await must()
      .from("rfq_matches")
      .update(cleanPatch({ ...patch, updated_at: new Date().toISOString() }))
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateRfqMatch", error);
    return data as RfqMatch;
  },
  async deleteRfqMatch(id) {
    const { error } = await must().from("rfq_matches").delete().eq("id", id);
    if (error) fail("deleteRfqMatch", error);
  },

  // --- Introductions ---
  async findIntroduction(buyerId, supplierId) {
    const { data, error } = await must()
      .from("introductions")
      .select("*")
      .eq("buyer_id", buyerId)
      .eq("supplier_id", supplierId)
      .maybeSingle();
    if (error) fail("findIntroduction", error);
    return (data as Introduction | null) ?? null;
  },
  async createIntroduction(input) {
    const { data, error } = await must().from("introductions").insert(cleanPatch(input)).select().single();
    if (error) fail("createIntroduction", error);
    return data as Introduction;
  },

  // --- Audit log ---
  async addAuditLog(entry) {
    const { data, error } = await must()
      .from("audit_log")
      .insert({
        actor_id: entry.actor_id ?? null,
        actor_email: entry.actor_email ?? null,
        entity: entry.entity,
        entity_id: entry.entity_id,
        action: entry.action,
        before: entry.before ?? null,
        after: entry.after ?? null,
      })
      .select()
      .single();
    if (error) fail("addAuditLog", error);
    return data as AuditLogEntry;
  },
};
