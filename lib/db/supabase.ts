import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  Activity,
  AppUser,
  AppUserInput,
  AppUserRecord,
  Buyer,
  BuyerInput,
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
  Supplier,
  SupplierInput,
  SupplierProduct,
  SupplierProductInput,
  TemplateOverride,
  Post,
  PostInput,
  PostStatus,
} from "@/lib/types";
import type { DataStore } from "@/lib/db/types";

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
  return { ...rest, signature_html: row.signature_html ?? null, phone: row.phone ?? null, has_local_password };
}

function must(): SupabaseClient {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase chưa được cấu hình");
  return c;
}

function fail(op: string, error: { message: string } | null): never {
  throw new Error(`${op}: ${error?.message ?? "lỗi không xác định"}`);
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
    const { data, error } = await must()
      .from("supplier_products")
      .insert(input)
      .select()
      .single();
    if (error) fail("createProduct", error);
    return data as SupplierProduct;
  },
  async updateProduct(id, patch) {
    const { data, error } = await must()
      .from("supplier_products")
      .update({ ...cleanPatch(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateProduct", error);
    return data as SupplierProduct;
  },
  async deleteProduct(id) {
    const { error } = await must().from("supplier_products").delete().eq("id", id);
    if (error) fail("deleteProduct", error);
  },

  async listUsers() {
    const { data, error } = await must()
      .from("app_users")
      .select("id,email,name,role,auth_provider,password_hash,is_active,last_login_at,created_at,updated_at")
      .order("email", { ascending: true });
    if (error) fail("listUsers", error);
    return ((data ?? []) as AppUserRecord[]).map(toPublicUser);
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
    const column = ownerType === "product" ? "product_id" : "supplier_id";
    const { data, error } = await must()
      .from("media_assets")
      .select("*")
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
};
