import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_EXTRAS_COLUMNS, type ProductExtrasColumn } from "@/lib/products/product-extras";

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
  CertificateScope,
  ProductCertificateOptout,
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
  SponsoredPush,
  SponsoredPushDaily,
  SponsoredRequest,
  SupplierRfqInvitation,
  SupplierNoticeRead,
  Supplier,
  SupplierInput,
  SupplierSubmission,
  SupplierSubmissionItem,
  SupplierSubmissionLink,
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
import { isTestOnlyProduct, publicProductCategorySlug, productReviewApproved } from "@/lib/public/product-selection";

/** Bỏ các khoá undefined khỏi patch để không vô tình ghi đè mất dữ liệu cũ. */
function cleanPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Cột jsonb có thể về null/kiểu lạ; luôn trả mảng cờ để UI không phải phòng thủ. */
function normalizeSubmission(row: SupplierSubmission): SupplierSubmission {
  return { ...row, flags: Array.isArray(row.flags) ? row.flags : [], ai_review: row.ai_review ?? null };
}

function normalizeSubmissionItem(row: SupplierSubmissionItem): SupplierSubmissionItem {
  return { ...row, flags: Array.isArray(row.flags) ? row.flags : [], has_exif: row.has_exif ?? false };
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

// PostgREST can enforce a server row cap smaller than the requested page. Use a
// stable UUID keyset and read until an empty page, not until a short page.
// This avoids offset shifts under inserts/deletes, but separate requests are NOT
// a transaction snapshot: concurrent changes can still affect the result.
const READ_PAGE_SIZE = 500;
const ID_BATCH_SIZE = 80;
const PARALLEL_ID_BATCHES = 4;
type ReadError = { message: string; code?: string };
type PageResult = { data: unknown; error: ReadError | null };

/** A paginated remote read must not silently switch to a different local dataset. */
function failPagedRead(op: string, error: unknown): never {
  const detail = error && typeof error === "object" && "message" in error
    ? String(error.message) : String(error ?? "lỗi không xác định");
  const failure = new Error(`${op}: ${detail}`) as Error & { preventLocalFallback: true };
  failure.preventLocalFallback = true;
  throw failure;
}

async function readAllById<T extends { id: string }>(
  op: string,
  page: (after: string | null) => PromiseLike<PageResult>,
  allowMissingTable = false,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    let result: PageResult;
    try { result = await page(after); } catch (error) { failPagedRead(op, error); }
    const { data, error } = result;
    if (error) {
      if (allowMissingTable && after === null && (error.code === "42P01" || error.code === "PGRST205")) return [];
      failPagedRead(op, error);
    }
    if (!Array.isArray(data)) failPagedRead(op, "kết quả phân trang không hợp lệ");
    if (!data.length) return rows;
    for (const row of data as T[]) {
      if (typeof row?.id !== "string" || !row.id || (after !== null && row.id <= after)) {
        failPagedRead(op, "thứ tự phân trang không hợp lệ");
      }
      rows.push(row);
      after = row.id;
    }
  }
}

/** Bounded IN lists prevent oversized URLs; one failed batch fails the whole read. */
async function readByIds<T extends { id: string }>(
  op: string, table: string, column: string, ids: readonly string[],
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += ID_BATCH_SIZE) chunks.push(unique.slice(i, i + ID_BATCH_SIZE));
  const rows: T[] = [];
  for (let i = 0; i < chunks.length; i += PARALLEL_ID_BATCHES) {
    const pages = await Promise.all(chunks.slice(i, i + PARALLEL_ID_BATCHES).map((chunk) =>
      readAllById<T>(op, (after) => {
        let query = must().from(table).select("*").in(column, chunk)
          .order("id", { ascending: true }).limit(READ_PAGE_SIZE);
        if (after) query = query.gt("id", after);
        return query;
      })));
    for (const page of pages) rows.push(...page);
  }
  return rows;
}

function byName<T extends { id: string; name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id);
}
function mediaOrder(a: MediaAsset, b: MediaAsset): number {
  return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}
function newestFirst<T extends { id: string; created_at: string }>(a: T, b: T): number {
  return Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id);
}

/** Only this exact PostgREST schema-cache mismatch gets a single-price compatibility retry. */
function missingProductPriceRangeColumn(error: { code?: string; message: string } | null): boolean {
  return !!error && (error.code === "PGRST204" || /schema cache/i.test(error.message)) &&
    /['"]ref_price_max['"]/.test(error.message) && /supplier_products/.test(error.message);
}

function priceRangeMigrationRequired(): never {
  // Never silently discard an entered upper bound: the buyer could see a false single price.
  // Chi tiết kỹ thuật: PostgREST chưa có cột supplier_products.ref_price_max (migration
  // 20261017_product_reference_price_range.sql chưa áp dụng hoặc schema cache chưa cập nhật).
  throw new Error("Chưa lưu được giá đến. Báo người phụ trách kỹ thuật rồi thử lại.");
}

/** Same single-retry rule for the optional buyer display name column. */
function missingDisplayNameColumn(error: { code?: string; message: string } | null): boolean {
  return !!error && (error.code === "PGRST204" || /schema cache/i.test(error.message)) &&
    /['"]display_name['"]/.test(error.message) && /supplier_products/.test(error.message);
}

function displayNameMigrationRequired(): never {
  // Chi tiết kỹ thuật: PostgREST chưa có cột supplier_products.display_name (migration
  // 20261030_product_display_name.sql chưa áp dụng hoặc schema cache chưa cập nhật).
  throw new Error("Chưa lưu được tên hiển thị. Báo người phụ trách kỹ thuật rồi thử lại.");
}

/**
 * Phase 2: PostgREST chưa thấy một trong các cột từ khoá / giá mẫu / đóng gói.
 * Xử lý giống `ref_price_max`: chỉ bỏ qua khi giá trị đang rỗng, không bao giờ
 * âm thầm nuốt dữ liệu người dùng vừa nhập.
 */
function missingProductExtrasColumn(error: { code?: string; message: string } | null): boolean {
  if (!error || !(error.code === "PGRST204" || /schema cache/i.test(error.message))) return false;
  if (!/supplier_products/.test(error.message)) return false;
  return PRODUCT_EXTRAS_COLUMNS.some((column) => error.message.includes(`'${column}'`) ||
    error.message.includes(`"${column}"`) || error.message.includes(`.${column}`));
}

function productExtrasMigrationRequired(): never {
  // Chi tiết kỹ thuật: PostgREST chưa có cột keywords / sample_price_usd / package_* /
  // units_per_carton (migration 20261072_product_keywords_sample_price_packaging.sql
  // chưa áp dụng hoặc schema cache chưa cập nhật).
  throw new Error("Chưa lưu được từ khoá và đóng gói. Báo người phụ trách kỹ thuật rồi thử lại.");
}

/** Bỏ các cột Phase 2 đang rỗng; trả null khi không còn gì để bỏ. */
function withoutEmptyProductExtras<T extends Partial<Record<ProductExtrasColumn, unknown>>>(payload: T): T | null {
  const empty = PRODUCT_EXTRAS_COLUMNS.filter((column) => {
    const value = payload[column];
    if (value === undefined || value === null) return true;
    return Array.isArray(value) && value.length === 0;
  });
  if (!empty.length) return null;
  const rest = { ...payload };
  for (const column of empty) delete rest[column];
  return rest as T;
}

/** Bỏ cột tùy chọn khi nó đang rỗng, để cơ sở dữ liệu cũ vẫn lưu được phần còn lại. */
function withoutEmptyDisplayName<T extends { display_name?: string | null }>(payload: T): T | null {
  if (payload.display_name) return null;
  const { display_name: _empty, ...rest } = payload;
  void _empty;
  return rest as T;
}

/** public_page_ready is derived on read; never send it back to PostgREST. */
async function decorateCategoryReadiness(rows: Category[]): Promise<Category[]> {
  if (!rows.length) return rows;
  type ReadinessProduct = Pick<SupplierProduct, "id" | "supplier_id" | "name" | "category" | "spec" | "description" |
    "ready_for_buyer" | "supplier_review_status" | "supplier_originated" | "reviewed_category_slug">;
  type ReadinessSupplier = Pick<Supplier, "id" | "status" | "is_demo">;
  const [products, suppliers] = await Promise.all([
    readAllById<ReadinessProduct>("categoryReadiness:products", (after) => {
      let query = must().from("supplier_products").select("id, supplier_id, name, category, spec, description, ready_for_buyer, supplier_review_status, supplier_originated, reviewed_category_slug")
        .order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      return query;
    }),
    readAllById<ReadinessSupplier>("categoryReadiness:suppliers", (after) => {
      let query = must().from("suppliers").select("id, status, is_demo")
        .order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      return query;
    }),
  ]);
  const published = new Set(suppliers.filter((s) => s.status === "published" &&
    (!s.is_demo || process.env.VEXIM_SHOW_DEMO === "true")).map((s) => s.id));
  const demoIds = new Set(suppliers.filter((s) => s.is_demo && process.env.VEXIM_SHOW_DEMO === "true").map((s) => s.id));
  const readySlugs = new Set<string>();
  for (const p of products) {
    if (!published.has(p.supplier_id) || !productReviewApproved(p) || isTestOnlyProduct(p.name) ||
      !(p.ready_for_buyer || demoIds.has(p.supplier_id))) continue;
    const slug = publicProductCategorySlug(p, rows);
    if (slug) readySlugs.add(slug);
  }
  return rows.map((c) => ({ ...c, public_page_ready: readySlugs.has(c.slug) }));
}

export const supabaseStore: DataStore = {
  mode: "supabase",

  async listSuppliers() {
    const rows = await readAllById<Supplier>("listSuppliers", (after) => {
      let query = must().from("suppliers").select("*").order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      return query;
    });
    return rows.sort(byName);
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
    const rows = await readAllById<SupplierProduct>("listProducts", (after) => {
      let query = must().from("supplier_products").select("*").order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      return query;
    });
    return rows.sort(byName);
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
    const rows = await readAllById<SupplierProduct>("listProductsBySupplier", (after) => {
      let query = must().from("supplier_products").select("*").eq("supplier_id", supplierId)
        .order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      return query;
    });
    return rows.sort(byName);
  },
  async createProduct(input: SupplierProductInput) {
    const write = (payload: Partial<SupplierProductInput>) => must()
      .from("supplier_products").insert(payload).select().single();
    let result = await write(input);
    if (missingDisplayNameColumn(result.error)) {
      const legacy = withoutEmptyDisplayName(input);
      if (!legacy) displayNameMigrationRequired();
      result = await write(legacy);
    }
    if (missingProductPriceRangeColumn(result.error)) {
      if (input.ref_price_max != null) priceRangeMigrationRequired();
      // Old databases can still create a SINGLE-price product. Do not drop a real upper bound.
      const { ref_price_max: _missing, ...legacy } = input;
      void _missing;
      result = await write(legacy);
    }
    if (missingProductExtrasColumn(result.error)) {
      const legacy = withoutEmptyProductExtras(result.error ? (input as Record<string, unknown>) : {});
      if (!legacy) productExtrasMigrationRequired();
      result = await write(legacy as SupplierProductInput);
    }
    if (result.error) fail("createProduct", result.error);
    return result.data as SupplierProduct;
  },
  async updateProduct(id, patch) {
    const write = (payload: Partial<SupplierProductInput> & { updated_at: string }) => must()
      .from("supplier_products").update(payload).eq("id", id).select().single();
    const fields = { ...cleanPatch(patch), updated_at: new Date().toISOString() };
    let result = await write(fields);
    if (missingDisplayNameColumn(result.error)) {
      const legacy = withoutEmptyDisplayName(fields);
      if (!legacy) displayNameMigrationRequired();
      result = await write(legacy);
    }
    if (missingProductPriceRangeColumn(result.error)) {
      if (patch.ref_price_max != null) priceRangeMigrationRequired();
      // Retrying only a missing NULL preserves old single-price saves without weakening other gates.
      const { ref_price_max: _missing, ...legacy } = fields;
      void _missing;
      result = await write(legacy);
    }
    if (missingProductExtrasColumn(result.error)) {
      const legacy = withoutEmptyProductExtras(fields);
      if (!legacy) productExtrasMigrationRequired();
      result = await write(legacy);
    }
    if (result.error) fail("updateProduct", result.error);
    return result.data as SupplierProduct;
  },
  async deleteProduct(id) {
    const { error } = await must().from("supplier_products").delete().eq("id", id);
    if (error) fail("deleteProduct", error);
  },
  async updateSupplierProductIfState(id, supplierId, expected, patch) {
    let query = must().from("supplier_products")
      .update({ ...cleanPatch(patch), updated_at: new Date().toISOString() })
      .eq("id", id).eq("supplier_id", supplierId).eq("ready_for_buyer", expected.ready);
    query = expected.review === null
      ? query.is("supplier_review_status", null)
      : query.eq("supplier_review_status", expected.review);
    const { data, error } = await query.select().maybeSingle();
    if (error) fail("updateSupplierProductIfState", error);
    return (data as SupplierProduct | null) ?? null;
  },
  async deleteSupplierDraftProduct(id, supplierId) {
    const { data, error } = await must().rpc("delete_supplier_draft_product", {
      p_product_id: id, p_supplier_id: supplierId,
    });
    if (error) fail("deleteSupplierDraftProduct", error);
    if (data?.status === "deleted" && Array.isArray(data.paths))
      return { status: "deleted", paths: data.paths.filter((path: unknown): path is string => typeof path === "string") };
    if (data?.status === "not_deletable" || data?.status === "has_links") return { status: data.status };
    throw new Error("Kết quả xóa bản nháp không hợp lệ.");
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
  async countSupplierAccountsPending() {
    const [profiles, logins] = await Promise.all([
      must().from("suppliers").select("id", { count: "exact", head: true })
        .eq("onboarding_status", "pending").or("is_demo.is.null,is_demo.eq.false"),
      must().from("app_users").select("id", { count: "exact", head: true })
        .eq("role", "supplier").eq("is_active", true).is("supplier_id", null),
    ]);
    if (profiles.error) fail("countSupplierAccountsPending", profiles.error);
    if (logins.error) fail("countSupplierAccountsPending", logins.error);
    return (profiles.count ?? 0) + (logins.count ?? 0);
  },
  async countProductsPendingReview() {
    // Bảng thật là supplier_products. Trước đây truy vấn gõ "products" nên production
    // trả lỗi "relation does not exist"; layout bắt lỗi và trả 0, thành ra sản phẩm NCC
    // gửi lên không bao giờ hiện huy hiệu chờ duyệt dù email đã gửi.
    const { count, error } = await must()
      .from("supplier_products")
      .select("id", { count: "exact", head: true })
      .eq("supplier_review_status", "pending");
    if (error) fail("countProductsPendingReview", error);
    return count ?? 0;
  },
  async countReviewsAwaitingApproval() {
    const { count, error } = await must()
      .from("verifications").select("id", { count: "exact", head: true }).eq("status", "submitted");
    if (error) fail("countReviewsAwaitingApproval", error);
    return count ?? 0;
  },
  async countSubmissionsPendingReview() {
    const { count, error } = await must()
      .from("supplier_submissions").select("id", { count: "exact", head: true }).eq("status", "pending_review");
    // Bảng chưa có trên bản chưa chạy migration: không có việc gì để hiện, không làm hỏng badge khác.
    if (error) return 0;
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

  async listSponsoredPushes({ surface, categorySlug, now }) {
    if (surface === "category" && !categorySlug) return [];
    // Only a missing table (42P01/PGRST205) on the first page is optional.
    return readAllById<SponsoredPush>("listSponsoredPushes", (after) => {
      let query = must().from("sponsored_pushes").select("*")
        .eq("surface", surface).eq("status", "approved")
        .lte("starts_at", now).gt("ends_at", now)
        .order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (surface === "category") query = query.eq("category_slug", categorySlug!);
      if (after) query = query.gt("id", after);
      return query;
    }, true);
  },
  async listAllSponsoredPushes() {
    // Không nuốt lỗi: CRM phân biệt được "chưa bán" với "không đọc được".
    const rows = await readAllById<SponsoredPush>("listAllSponsoredPushes", (after) => {
      let query = must().from("sponsored_pushes").select("*").order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      return query;
    });
    return rows.sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at) || a.id.localeCompare(b.id));
  },
  async listSponsoredPushesForSupplier(supplierId) {
    const rows = await readAllById<SponsoredPush>("listSponsoredPushesForSupplier", (after) => {
      let query = must().from("sponsored_pushes").select("*").eq("supplier_id", supplierId)
        .order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      return query;
    });
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  },
  async listSponsoredRequestsForSupplier(supplierId) {
    const rows = await readAllById<SponsoredRequest>("listSponsoredRequestsForSupplier", (after) => {
      let query = must().from("sponsored_requests").select("*").eq("supplier_id", supplierId)
        .order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      return query;
    });
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  },
  async listSponsoredRequests() {
    const rows = await readAllById<SponsoredRequest>("listSponsoredRequests", (after) => {
      let query = must().from("sponsored_requests").select("*").order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      return query;
    });
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  },
  async countNewSponsoredRequests() {
    const { count, error } = await must().from("sponsored_requests").select("id", { count: "exact", head: true }).eq("status", "new");
    if (error) fail("countNewSponsoredRequests", error);
    if (count === null) throw new Error("countNewSponsoredRequests: missing count");
    return count;
  },
  async createSponsoredRequest(input) {
    const { data, error } = await must().from("sponsored_requests").insert(input).select().single();
    if (error?.code === "23505") throw new Error("SPONSORED_REQUEST_ALREADY_OPEN");
    if (error) fail("createSponsoredRequest", error);
    return data as SponsoredRequest;
  },
  async updateSponsoredRequestIfStatus(id, expected, status, userId) {
    const { data, error } = await must().from("sponsored_requests")
      .update({ status, updated_by: userId }).eq("id", id).eq("status", expected).select().maybeSingle();
    if (error) fail("updateSponsoredRequestIfStatus", error);
    return (data as SponsoredRequest | null) ?? null;
  },
  async createSponsoredPush(input) {
    const { data, error } = await must()
      .from("sponsored_pushes")
      .insert({ ...input, status: input.status ?? "draft" })
      .select()
      .single();
    if (error) fail("createSponsoredPush", error);
    return data as SponsoredPush;
  },
  async updateSponsoredPushIfStatus(id, expected, patch) {
    const { data, error } = await must()
      .from("sponsored_pushes")
      .update(cleanPatch(patch))
      .eq("id", id)
      .eq("status", expected)
      .select()
      .maybeSingle();
    if (error) fail("updateSponsoredPushIfStatus", error);
    return (data as SponsoredPush | null) ?? null;
  },
  async deleteSponsoredDraft(id) {
    const { data, error } = await must().from("sponsored_pushes").delete()
      .eq("id", id).eq("status", "draft").select("id").maybeSingle();
    if (error) fail("deleteSponsoredDraft", error);
    return data !== null;
  },
  async listSponsoredPushDaily(pushIds, sinceDay) {
    const unique = [...new Set(pushIds.filter(Boolean))];
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += ID_BATCH_SIZE) chunks.push(unique.slice(i, i + ID_BATCH_SIZE));
    const all: SponsoredPushDaily[] = [];
    for (let i = 0; i < chunks.length; i += PARALLEL_ID_BATCHES) {
      const parts = await Promise.all(chunks.slice(i, i + PARALLEL_ID_BATCHES).map(async (ids) => {
        const rows: SponsoredPushDaily[] = [];
        let cursor: SponsoredPushDaily | null = null;
        for (;;) {
          let query = must().from("sponsored_push_consented_daily").select("*").in("push_id", ids).gte("day", sinceDay)
            .order("push_id", { ascending: true }).order("day", { ascending: true })
            .order("event_type", { ascending: true }).limit(READ_PAGE_SIZE);
          if (cursor) {
            // Values come from UUID/date/enum database columns, not a URL or form.
            query = query.or(`push_id.gt.${cursor.push_id},and(push_id.eq.${cursor.push_id},day.gt.${cursor.day}),and(push_id.eq.${cursor.push_id},day.eq.${cursor.day},event_type.gt.${cursor.event_type})`);
          }
          let result: PageResult;
          try { result = await query; } catch (error) { failPagedRead("listSponsoredPushDaily", error); }
          const { data, error } = result;
          if (error) failPagedRead("listSponsoredPushDaily", error);
          if (!Array.isArray(data)) failPagedRead("listSponsoredPushDaily", "kết quả phân trang không hợp lệ");
          if (!data.length) return rows;
          for (const row of data as SponsoredPushDaily[]) {
            if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(row.push_id) ||
              !/^\d{4}-\d{2}-\d{2}$/.test(row.day) || !["click", "impression"].includes(row.event_type) ||
              (cursor && (row.push_id < cursor.push_id || (row.push_id === cursor.push_id &&
                (row.day < cursor.day || (row.day === cursor.day && row.event_type <= cursor.event_type)))))) {
              failPagedRead("listSponsoredPushDaily", "thứ tự phân trang không hợp lệ");
            }
            rows.push(row);
            cursor = row;
          }
        }
      }));
      for (const part of parts) all.push(...part);
    }
    return all;
  },
  async listMedia(ownerType: MediaOwnerType, ownerId: string) {
    const column =
      ownerType === "product" ? "product_id" :
      ownerType === "verification" ? "verification_id" :
      ownerType === "submission" ? "submission_id" :
      "supplier_id";
    const rows = await readAllById<MediaAsset>("listMedia", (after) => {
      let query = must().from("media_assets").select("*").eq("owner_type", ownerType).eq(column, ownerId)
        .order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      return query;
    });
    return rows.sort(mediaOrder);
  },
  async listMediaForProducts(productIds) {
    return (await readByIds<MediaAsset>("listMediaForProducts", "media_assets", "product_id", productIds)).sort(mediaOrder);
  },
  async listMediaForSuppliers(supplierIds) {
    return (await readByIds<MediaAsset>("listMediaForSuppliers", "media_assets", "supplier_id", supplierIds)).sort(mediaOrder);
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
  async deleteSupplierProductMedia(productId, supplierId, userId, mediaId) {
    const { data, error } = await must().rpc("delete_supplier_product_media", {
      p_product_id: productId, p_supplier_id: supplierId, p_user_id: userId, p_media_id: mediaId,
    });
    if (error) fail("deleteSupplierProductMedia", error);
    if (data?.status === "deleted" && Array.isArray(data.paths) &&
        ["image", "catalogue", "certificate", "document", "video"].includes(data.kind))
      return { status: "deleted", kind: data.kind, paths: data.paths.filter((path: unknown): path is string => typeof path === "string") };
    if (["forbidden", "state_changed", "last_file", "has_links"].includes(data?.status)) return { status: data.status };
    throw new Error("Kết quả xóa tệp không hợp lệ.");
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
    const rows = await readAllById<Category>("listCategories", (after) => {
      let query = must().from("categories").select("*").order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (options?.publishedOnly) query = query.eq("is_published", true);
      if (after) query = query.gt("id", after);
      return query;
    });
    rows.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
    return decorateCategoryReadiness(rows);
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
    let res = await must().from("categories").insert(cleanPatch(fields)).select().single();
    if (res.error && /\bmoq_units\b/i.test(res.error.message ?? "") && fields.moq_units == null) {
      const { moq_units: _omitted, ...legacyFields } = fields;
      void _omitted;
      res = await must().from("categories").insert(cleanPatch(legacyFields)).select().single();
    }
    if (res.error) fail("createCategory", res.error);
    return res.data as Category;
  },
  async updateCategory(id, patch) {
    const { public_page_ready: _computed, ...fields } = patch;
    void _computed;
    let res = await must()
      .from("categories")
      .update(cleanPatch({ ...fields, updated_at: new Date().toISOString() }))
      .eq("id", id)
      .select()
      .single();
    if (res.error && /\bmoq_units\b/i.test(res.error.message ?? "") && fields.moq_units == null) {
      const { moq_units: _omitted, ...legacyFields } = fields;
      void _omitted;
      res = await must()
        .from("categories")
        .update(cleanPatch({ ...legacyFields, updated_at: new Date().toISOString() }))
        .eq("id", id)
        .select()
        .single();
    }
    if (res.error) fail("updateCategory", res.error);
    return res.data as Category;
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
    return (await readByIds<Certificate>("listCertificates", "certificates", "supplier_id", [supplierId])).sort(newestFirst);
  },
  async listCertificatesForSuppliers(supplierIds) {
    return (await readByIds<Certificate>("listCertificatesForSuppliers", "certificates", "supplier_id", supplierIds)).sort(newestFirst);
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

  async listCertificateScopes(certificateIds) {
    return (await readByIds<CertificateScope>("listCertificateScopes", "certificate_scopes", "certificate_id", certificateIds))
      .sort(newestFirst);
  },
  async createCertificateScope(input) {
    const { data, error } = await must().from("certificate_scopes").insert(cleanPatch(input)).select().single();
    if (error) fail("createCertificateScope", error);
    return data as CertificateScope;
  },
  async deleteCertificateScope(id) {
    const { error } = await must().from("certificate_scopes").delete().eq("id", id);
    if (error) fail("deleteCertificateScope", error);
  },
  async listCertificateOptouts(supplierId) {
    return (await readByIds<ProductCertificateOptout>(
      "listCertificateOptouts", "product_certificate_optouts", "supplier_id", [supplierId],
    )).sort(newestFirst);
  },
  async setCertificateOptout(supplierId, productId, certificateId, on) {
    const client = must();
    if (!on) {
      const { error } = await client.from("product_certificate_optouts")
        .delete().eq("product_id", productId).eq("certificate_id", certificateId);
      if (error) fail("setCertificateOptout", error);
      return;
    }
    const { error } = await client.from("product_certificate_optouts")
      .upsert({ supplier_id: supplierId, product_id: productId, certificate_id: certificateId },
        { onConflict: "product_id,certificate_id" });
    if (error) fail("setCertificateOptout", error);
  },

  // --- Verifications ---
  async listVerifications(supplierId) {
    const rows = await readAllById<Verification>("listVerifications", (after) => {
      let query = must().from("verifications").select("*").order("id", { ascending: true }).limit(READ_PAGE_SIZE);
      if (supplierId) query = query.eq("supplier_id", supplierId);
      if (after) query = query.gt("id", after);
      return query;
    });
    return rows.sort(newestFirst);
  },
  async listVerificationsForSuppliers(supplierIds) {
    return (await readByIds<Verification>("listVerificationsForSuppliers", "verifications", "supplier_id", supplierIds)).sort(newestFirst);
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

  // --- Hồ sơ NCC tự gửi L2/L3 (supplier_submissions) ---
  async listSubmissions(supplierId, level) {
    let q = must().from("supplier_submissions").select("*").order("updated_at", { ascending: false });
    if (supplierId) q = q.eq("supplier_id", supplierId);
    if (level) q = q.eq("target_level", level);
    const { data, error } = await q;
    if (error) fail("listSubmissions", error);
    return (data ?? []).map((row) => normalizeSubmission(row as SupplierSubmission));
  },
  async getSubmission(id) {
    const { data, error } = await must().from("supplier_submissions").select("*").eq("id", id).maybeSingle();
    if (error) fail("getSubmission", error);
    return data ? normalizeSubmission(data as SupplierSubmission) : null;
  },
  async createSubmission(input) {
    const { data, error } = await must().from("supplier_submissions").insert(cleanPatch(input)).select().single();
    if (error) fail("createSubmission", error);
    return normalizeSubmission(data as SupplierSubmission);
  },
  async updateSubmission(id, patch) {
    const { data, error } = await must()
      .from("supplier_submissions")
      .update(cleanPatch({ ...patch, updated_at: new Date().toISOString() }))
      .eq("id", id)
      .select()
      .single();
    if (error) fail("updateSubmission", error);
    return normalizeSubmission(data as SupplierSubmission);
  },
  async updateEditableSubmission(id, patch, expectedStatus) {
    const query = must().from("supplier_submissions")
      .update(cleanPatch({ ...patch, updated_at: new Date().toISOString() }))
      .eq("id", id);
    const { data, error } = await (expectedStatus
      ? query.eq("status", expectedStatus)
      : query.in("status", ["draft", "returned"])).select().maybeSingle();
    if (error) fail("updateEditableSubmission", error);
    return data ? normalizeSubmission(data as SupplierSubmission) : null;
  },
  async listSubmissionItems(submissionId) {
    const { data, error } = await must().from("supplier_submission_items").select("*")
      .eq("submission_id", submissionId).order("uploaded_at", { ascending: true });
    if (error) fail("listSubmissionItems", error);
    return (data ?? []).map((row) => normalizeSubmissionItem(row as SupplierSubmissionItem));
  },
  async getSubmissionItem(id) {
    const { data, error } = await must().from("supplier_submission_items").select("*").eq("id", id).maybeSingle();
    if (error) fail("getSubmissionItem", error);
    return data ? normalizeSubmissionItem(data as SupplierSubmissionItem) : null;
  },
  async createSubmissionItem(input) {
    const { data, error } = await must().from("supplier_submission_items").insert(cleanPatch(input)).select().single();
    if (error) fail("createSubmissionItem", error);
    return normalizeSubmissionItem(data as SupplierSubmissionItem);
  },
  async updateSubmissionItem(id, patch) {
    const { data, error } = await must().from("supplier_submission_items")
      .update(cleanPatch(patch)).eq("id", id).select().single();
    if (error) fail("updateSubmissionItem", error);
    return normalizeSubmissionItem(data as SupplierSubmissionItem);
  },
  async deleteSubmissionItem(id) {
    const { error } = await must().from("supplier_submission_items").delete().eq("id", id);
    if (error) fail("deleteSubmissionItem", error);
  },
  async listSubmissionLinks(submissionId) {
    const { data, error } = await must().from("supplier_submission_links").select("*")
      .eq("submission_id", submissionId).order("created_at", { ascending: true });
    if (error) fail("listSubmissionLinks", error);
    return (data ?? []) as SupplierSubmissionLink[];
  },
  async createSubmissionLink(input) {
    const { data, error } = await must().from("supplier_submission_links").insert(cleanPatch(input)).select().single();
    if (error) fail("createSubmissionLink", error);
    return data as SupplierSubmissionLink;
  },
  async updateSubmissionLink(id, patch) {
    const { data, error } = await must().from("supplier_submission_links")
      .update(cleanPatch(patch)).eq("id", id).select().single();
    if (error) fail("updateSubmissionLink", error);
    return data as SupplierSubmissionLink;
  },
  async deleteSubmissionLink(id) {
    const { error } = await must().from("supplier_submission_links").delete().eq("id", id);
    if (error) fail("deleteSubmissionLink", error);
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
  async listRfqMatchesBySupplier(supplierId) {
    const { data, error } = await must()
      .from("rfq_matches")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) fail("listRfqMatchesBySupplier", error);
    return (data ?? []) as RfqMatch[];
  },
  async listSupplierRfqInvitations(supplierId) {
    const all: SupplierRfqInvitation[] = [];
    // Page deliberately: PostgREST defaults to 1,000 rows, which would silently undercount reports.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await must().from("rfq_matches")
        .select("id,rfq_id,supplier_id,status,sent_to_supplier_at,response_due_at,supplier_replied_at,quote_price,quote_currency,quote_unit,created_at,updated_at,rfq:rfqs!inner(code,product_text,quantity,unit,destination_country,incoterm,needed_by,source_product_id,source_page)")
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
  async listSupplierOnboardingDecisions() {
    const { data, error } = await must()
      .from("audit_log")
      .select("entity_id,action,created_at")
      .eq("entity", "supplier")
      .in("action", ["supplier.portal_access_approved", "supplier.profile_changes_requested"])
      .order("created_at", { ascending: false });
    if (error) fail("listSupplierOnboardingDecisions", error);
    return (data ?? []) as Pick<AuditLogEntry, "entity_id" | "action" | "created_at">[];
  },
  async listHarvestResearchRuns() {
    const { data, error } = await must()
      .from("audit_log")
      .select("entity_id,action,created_at")
      .eq("entity", "category")
      .in("action", ["category.harvest_research_updated", "category.harvest_research_failed"])
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) fail("listHarvestResearchRuns", error);
    return (data ?? []) as Pick<AuditLogEntry, "entity_id" | "action" | "created_at">[];
  },
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
