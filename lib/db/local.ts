import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
  EmailAttachment,
  EmailMessage,
  MediaAsset,
  MediaInput,
  MediaOwnerType,
  Post,
  PostStatus,
  Rfq,
  RfqAttachment,
  RfqMatch,
  Supplier,
  SupplierCategory,
  SupplierInput,
  SupplierProduct,
  SupplierProductInput,
  TemplateOverride,
  ProspectOutreachTemplate,
  Verification,
} from "@/lib/types";
import { SEED_BUYERS, SEED_PRODUCTS, SEED_SUPPLIERS } from "@/lib/db/seed";
import type { DataStore } from "@/lib/db/types";

interface LocalShape {
  users: AppUserRecord[];
  buyers: Buyer[];
  prospects: Prospect[];
  prospect_activities: ProspectActivity[];
  suppliers: Supplier[];
  products: SupplierProduct[];
  media: MediaAsset[];
  activities: Activity[];
  messages: EmailMessage[];
  template_overrides: TemplateOverride[];
  prospect_outreach_template_overrides: ProspectOutreachTemplate[];
  posts: Post[];
  attachments: EmailAttachment[];
  // RFQ FOUNDATION
  categories: Category[];
  supplier_categories: SupplierCategory[];
  certificates: Certificate[];
  verifications: Verification[];
  rfqs: Rfq[];
  rfq_attachments: RfqAttachment[];
  rfq_matches: RfqMatch[];
  introductions: Introduction[];
  audit_log: AuditLogEntry[];
}

const FILE = path.join(process.cwd(), "data", "local-db.json");

const g = globalThis as unknown as { __veximLocal?: LocalShape };

function nowISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString();
}

function seed(): LocalShape {
  function normalizeSupplier(s: Omit<Supplier, "id" | "created_at" | "updated_at">, idx: number): Supplier {
    const slugBase = (s.trade_name || s.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `supplier-${idx + 1}`;
    // Map role cũ -> supplier_type
    const supplier_type =
      s.role === "manufacturer"
        ? "manufacturer"
        : s.role === "trader" || s.role === "agent" || s.role === "exporter"
          ? "trading"
          : null;
    return {
      ...s,
      slug: `${slugBase}-${idx + 1}`,
      display_name: s.trade_name || s.name,
      supplier_type,
      founded_year: null,
      employees: null,
      summary_i18n: { en: s.products ?? "" },
      moq_text: null,
      capacity_per_month: null,
      ports: [],
      incoterms: [],
      export_markets: (s.markets ?? "").split(",").map((m) => m.trim()).filter(Boolean),
      private_label: false,
      verification_level: 1,
      verified_at: nowISO(60 + idx * 5),
      next_reverify_at: null,
      rating_avg: s.rating ?? null,
      rating_count: s.rating ? 3 : 0,
      fob_min: null,
      fob_max: null,
      fob_unit: null,
      fob_currency: "USD",
      fob_updated_at: null,
      fob_publicly_visible: false,
    } as unknown as Supplier;
  }

  const suppliers: Supplier[] = SEED_SUPPLIERS.map((s, i) => ({
    ...normalizeSupplier(s, i),
    id: `sup-seed-${i + 1}`,
    created_at: nowISO(60 + i * 5),
    updated_at: nowISO(60 + i * 5),
  }));

  const buyers: Buyer[] = SEED_BUYERS.map((raw, i) => {
    const { supplier_ref, ...rest } = raw;
    const supplier =
      supplier_ref === null || supplier_ref === undefined
        ? null
        : suppliers[supplier_ref] ?? null;
    return {
      ...rest,
      id: `buy-seed-${i + 1}`,
      supplier_id: supplier ? supplier.id : null,
      created_at: nowISO(45 - i * 4),
      updated_at: nowISO(Math.max(0, 12 - i * 2)),
    } satisfies Buyer;
  });

  const activities: Activity[] = buyers.flatMap((b, i) => {
    const rows: Activity[] = [
      {
        id: randomUUID(),
        buyer_id: b.id,
        type: "created",
        from_stage: null,
        to_stage: "lead",
        message: `Tạo khách hàng "${b.company}"`,
        created_by: b.owner,
        created_at: b.created_at,
      },
    ];
    if (b.stage !== "lead") {
      rows.push({
        id: randomUUID(),
        buyer_id: b.id,
        type: "stage_change",
        from_stage: "lead",
        to_stage: b.stage,
        message: `Chuyển trạng thái sang ${b.stage}`,
        created_by: b.owner,
        created_at: b.updated_at,
      });
    }
    void i;
    return rows;
  });

  function normalizeProduct(raw: typeof SEED_PRODUCTS[number], idx: number, supId: string): SupplierProduct {
    const { supplier_ref: _sr, ...rest } = raw;
    const name = (rest as Partial<SupplierProduct>).name ?? `Product ${idx + 1}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `product-${idx + 1}`;
    return {
      ...(rest as SupplierProduct),
      name,
      slug,
      name_i18n: { en: name },
      specs: {},
      images: [],
      moq_qty: null,
      moq_unit: null,
      supplier_id: supId,
      ready_for_buyer: false,
    } as SupplierProduct;
  }

  const products: SupplierProduct[] = SEED_PRODUCTS.map((raw, i) => {
    const supId = suppliers[raw.supplier_ref]?.id ?? "";
    return {
      ...normalizeProduct(raw, i, supId),
      id: `prod-seed-${i + 1}`,
      created_at: nowISO(40 - i),
      updated_at: nowISO(Math.max(0, 10 - i)),
    } satisfies SupplierProduct;
  });

  // Seed category "Cashew" ở local để trang công khai có thể render ở môi trường dev
  const cashewCategory: Category = {
    id: "cat-seed-cashew",
    slug: "cashew",
    parent_id: null,
    name_i18n: { en: "Cashew" },
    intro_i18n: { en: "Verified Vietnamese cashew kernel suppliers, graded WW320, WW240, W180, LP, SP. Factory-audited by Vexim Trade." },
    faq_i18n: [],
    seo_title_i18n: { en: "Cashew Suppliers in Vietnam – Verified Manufacturers | Vexim Trade" },
    seo_desc_i18n: { en: "Compare verified Vietnamese cashew kernel suppliers by grade, MOQ, certification and lead time." },
    is_published: true,
    sort_order: 10,
    created_at: nowISO(100),
    updated_at: nowISO(100),
  };

  return {
    users: [],
    buyers,
    prospects: [],
    prospect_activities: [],
    suppliers,
    products,
    media: [],
    activities,
    messages: [],
    attachments: [],
    template_overrides: [],
    prospect_outreach_template_overrides: [],
    posts: [],
    categories: [cashewCategory],
    supplier_categories: [],
    certificates: [],
    verifications: [],
    rfqs: [],
    rfq_attachments: [],
    rfq_matches: [],
    introductions: [],
    audit_log: [],
  };
}

function inferTargetProduct(sourceList: string | null | undefined): string | null {
  const value = (sourceList ?? "").toLocaleLowerCase("vi");
  return /m[iìỳ] ăn liền/.test(value) ? "Mì ăn liền" : null;
}

function normalizeProspects(prospects: Prospect[]) {
  for (const prospect of prospects) {
    if (!prospect.data_source) prospect.data_source = "Apollo";
    if (prospect.target_product === undefined) {
      prospect.target_product = inferTargetProduct(prospect.source_list);
    }
    if (prospect.ai_company_summary === undefined) prospect.ai_company_summary = null;
    if (!Array.isArray(prospect.ai_company_sources)) prospect.ai_company_sources = [];
    if (prospect.ai_company_analyzed_at === undefined) prospect.ai_company_analyzed_at = null;
    if (prospect.ai_products === undefined || (prospect.ai_products && !Array.isArray(prospect.ai_products.products))) {
      prospect.ai_products = null;
    }
  }
}

function removeProspectsWithoutEmail(db: LocalShape) {
  const removedIds = new Set(db.prospects.filter((prospect) => !prospect.email?.trim()).map((prospect) => prospect.id));
  if (!removedIds.size) return;
  db.prospects = db.prospects.filter((prospect) => !removedIds.has(prospect.id));
  db.prospect_activities = db.prospect_activities.filter((activity) => !removedIds.has(activity.prospect_id));
  db.messages = db.messages.map((message) =>
    message.prospect_id && removedIds.has(message.prospect_id)
      ? { ...message, prospect_id: null }
      : message,
  );
}

function load(): LocalShape {
  if (g.__veximLocal) {
    const c = g.__veximLocal;
    if (!Array.isArray(c.messages)) c.messages = [];
    if (!Array.isArray(c.prospects)) c.prospects = [];
    normalizeProspects(c.prospects);
    if (!Array.isArray(c.prospect_activities)) c.prospect_activities = [];
    if (!Array.isArray(c.prospect_outreach_template_overrides)) c.prospect_outreach_template_overrides = [];
    if (!Array.isArray(c.posts)) c.posts = [];
    if (!Array.isArray(c.activities)) c.activities = [];
    if (!Array.isArray(c.products)) c.products = [];
    if (!Array.isArray(c.media)) c.media = [];
    if (!Array.isArray(c.users)) c.users = [];
    c.users.forEach((u) => {
      if (u.signature_html === undefined) u.signature_html = null;
      if (u.phone === undefined) u.phone = null;
      if (u.sender_email === undefined) u.sender_email = null;
    });
    if (!Array.isArray(c.attachments)) c.attachments = [];
    // RFQ foundation – tương thích với file dữ liệu cũ
    if (!Array.isArray(c.categories)) c.categories = [];
    if (!Array.isArray(c.supplier_categories)) c.supplier_categories = [];
    if (!Array.isArray(c.certificates)) c.certificates = [];
    if (!Array.isArray(c.verifications)) c.verifications = [];
    if (!Array.isArray(c.rfqs)) c.rfqs = [];
    if (!Array.isArray(c.rfq_attachments)) c.rfq_attachments = [];
    if (!Array.isArray(c.rfq_matches)) c.rfq_matches = [];
    if (!Array.isArray(c.introductions)) c.introductions = [];
    if (!Array.isArray(c.audit_log)) c.audit_log = [];
    removeProspectsWithoutEmail(c);
    return c;
  }
  try {
    if (fs.existsSync(FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as LocalShape;
      if (Array.isArray(parsed.buyers) && Array.isArray(parsed.suppliers)) {
        // tương thích ngược với file dữ liệu cũ
        if (!Array.isArray(parsed.messages)) {
          const legacy = parsed as unknown as { emails?: unknown[] };
          parsed.messages = Array.isArray(legacy.emails) ? [] : [];
          delete legacy.emails;
        }
        if (!Array.isArray(parsed.prospects)) parsed.prospects = [];
        normalizeProspects(parsed.prospects);
        if (!Array.isArray(parsed.prospect_activities)) parsed.prospect_activities = [];
        if (!Array.isArray(parsed.prospect_outreach_template_overrides)) parsed.prospect_outreach_template_overrides = [];
        if (!Array.isArray(parsed.posts)) parsed.posts = [];
        if (!Array.isArray(parsed.activities)) parsed.activities = [];
        if (!Array.isArray(parsed.products)) parsed.products = [];
        if (!Array.isArray(parsed.media)) parsed.media = [];
        if (!Array.isArray(parsed.users)) parsed.users = [];
        if (!Array.isArray(parsed.attachments)) parsed.attachments = [];
        if (!Array.isArray(parsed.categories)) parsed.categories = [];
        if (!Array.isArray(parsed.supplier_categories)) parsed.supplier_categories = [];
        if (!Array.isArray(parsed.certificates)) parsed.certificates = [];
        if (!Array.isArray(parsed.verifications)) parsed.verifications = [];
        if (!Array.isArray(parsed.rfqs)) parsed.rfqs = [];
        if (!Array.isArray(parsed.rfq_attachments)) parsed.rfq_attachments = [];
        if (!Array.isArray(parsed.rfq_matches)) parsed.rfq_matches = [];
        if (!Array.isArray(parsed.introductions)) parsed.introductions = [];
        if (!Array.isArray(parsed.audit_log)) parsed.audit_log = [];
        removeProspectsWithoutEmail(parsed);
        g.__veximLocal = parsed;
        return parsed;
      }
    }
  } catch {
    // file hỏng thì seed lại
  }
  const fresh = seed();
  g.__veximLocal = fresh;
  persist(fresh);
  return fresh;
}

function persist(db: LocalShape) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (err) {
    console.warn("[local-db] không ghi được file, dữ liệu chỉ tồn tại trong RAM:", err);
  }
}

/** Ẩn hash mật khẩu trước khi trả ra ngoài */
/** Bỏ các khoá undefined khỏi patch để không vô tình ghi đè mất dữ liệu cũ. */
function cleanPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

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

function mutate<T>(fn: (db: LocalShape) => T): T {
  const db = load();
  const out = fn(db);
  persist(db);
  return out;
}

export const localStore: DataStore = {
  mode: "local",

  async listSuppliers() {
    return [...load().suppliers].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  },
  async getSupplier(id) {
    return load().suppliers.find((s) => s.id === id) ?? null;
  },
  async createSupplier(input) {
    return mutate((db) => {
      const row: Supplier = {
        ...input,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.suppliers.push(row);
      return row;
    });
  },
  async updateSupplier(id, patch) {
    return mutate((db) => {
      const row = db.suppliers.find((s) => s.id === id);
      if (!row) throw new Error("Không tìm thấy nhà cung cấp");
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteSupplier(id) {
    mutate((db) => {
      db.suppliers = db.suppliers.filter((s) => s.id !== id);
      for (const b of db.buyers) if (b.supplier_id === id) b.supplier_id = null;
      const removedProducts = db.products.filter((pr) => pr.supplier_id === id).map((pr) => pr.id);
      db.products = db.products.filter((pr) => pr.supplier_id !== id);
      db.media = db.media.filter(
        (m) => m.supplier_id !== id && !(m.product_id && removedProducts.includes(m.product_id)),
      );
    });
  },

  async listProducts() {
    return [...load().products].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  },
  async getProduct(id) {
    return load().products.find((pr) => pr.id === id) ?? null;
  },
  async listProductsBySupplier(supplierId) {
    return load()
      .products.filter((pr) => pr.supplier_id === supplierId)
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  },
  async createProduct(input) {
    return mutate((db) => {
      const row: SupplierProduct = {
        ...input,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.products.push(row);
      return row;
    });
  },
  async updateProduct(id, patch) {
    return mutate((db) => {
      const row = db.products.find((pr) => pr.id === id);
      if (!row) throw new Error("Không tìm thấy sản phẩm");
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteProduct(id) {
    mutate((db) => {
      db.products = db.products.filter((pr) => pr.id !== id);
      db.media = db.media.filter((m) => m.product_id !== id);
    });
  },

  async listBuyers() {
    return [...load().buyers].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  },
  async getBuyer(id) {
    return load().buyers.find((b) => b.id === id) ?? null;
  },
  async createBuyer(input) {
    return mutate((db) => {
      const row: Buyer = {
        ...input,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.buyers.push(row);
      return row;
    });
  },
  async updateBuyer(id, patch) {
    return mutate((db) => {
      const row = db.buyers.find((b) => b.id === id);
      if (!row) throw new Error("Không tìm thấy khách hàng");
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteBuyer(id) {
    mutate((db) => {
      db.buyers = db.buyers.filter((b) => b.id !== id);
      db.activities = db.activities.filter((a) => a.buyer_id !== id);
      db.messages = db.messages.filter((e) => e.buyer_id !== id);
    });
  },

  async listProspects() {
    return [...load().prospects].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  },
  async getProspect(id) {
    return load().prospects.find((p) => p.id === id) ?? null;
  },
  async createProspect(input: ProspectInput) {
    return mutate((db) => {
      const now = new Date().toISOString();
      const row: Prospect = {
        ...input,
        ai_company_summary: null,
        ai_company_sources: [],
        ai_company_analyzed_at: null,
        ai_products: null,
        id: randomUUID(),
        created_at: now,
        updated_at: now,
      };
      db.prospects.push(row);
      return row;
    });
  },
  async createProspects(inputs: ProspectInput[]) {
    return mutate((db) => {
      const now = new Date().toISOString();
      const rows: Prospect[] = inputs.map((input) => ({
        ...input,
        ai_company_summary: null,
        ai_company_sources: [],
        ai_company_analyzed_at: null,
        ai_products: null,
        id: randomUUID(),
        created_at: now,
        updated_at: now,
      }));
      db.prospects.push(...rows);
      return rows;
    });
  },
  async updateProspect(id, patch) {
    return mutate((db) => {
      const row = db.prospects.find((p) => p.id === id);
      if (!row) throw new Error("Không tìm thấy prospect");
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteProspect(id) {
    mutate((db) => {
      db.prospects = db.prospects.filter((p) => p.id !== id);
      db.prospect_activities = db.prospect_activities.filter((a) => a.prospect_id !== id);
      db.messages = db.messages.map((message) =>
        message.prospect_id === id ? { ...message, prospect_id: null } : message,
      );
    });
  },
  async listProspectActivities(prospectId) {
    return load()
      .prospect_activities.filter((a) => a.prospect_id === prospectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async addProspectActivity(input: {
    prospect_id: string;
    channel: ProspectActivityChannel;
    summary: string;
    created_by?: string | null;
  }) {
    return mutate((db) => {
      const row: ProspectActivity = {
        id: randomUUID(),
        prospect_id: input.prospect_id,
        channel: input.channel,
        summary: input.summary,
        created_by: input.created_by ?? null,
        created_at: new Date().toISOString(),
      };
      db.prospect_activities.push(row);
      return row;
    });
  },
  async addProspectActivities(inputs) {
    return mutate((db) => {
      const now = new Date().toISOString();
      const rows: ProspectActivity[] = inputs.map((input) => ({
        id: randomUUID(),
        prospect_id: input.prospect_id,
        channel: input.channel,
        summary: input.summary,
        created_by: input.created_by ?? null,
        created_at: now,
      }));
      db.prospect_activities.push(...rows);
      return rows;
    });
  },

  async listActivities(buyerId) {
    const rows = buyerId
      ? load().activities.filter((a) => a.buyer_id === buyerId)
      : load().activities;
    return [...rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  },
  async addActivity(input) {
    return mutate((db) => {
      const row: Activity = {
        id: randomUUID(),
        buyer_id: input.buyer_id,
        type: input.type,
        from_stage: input.from_stage ?? null,
        to_stage: input.to_stage ?? null,
        message: input.message,
        created_by: input.created_by ?? null,
        created_at: new Date().toISOString(),
      };
      db.activities.push(row);
      return row;
    });
  },

  async listUsers() {
    return load()
      .users.map(toPublicUser)
      .sort((a, b) => a.email.localeCompare(b.email));
  },
  async countUsers() {
    return load().users.length;
  },
  async getUser(id) {
    return load().users.find((u) => u.id === id) ?? null;
  },
  async getUserByEmail(email) {
    const needle = email.trim().toLowerCase();
    return load().users.find((u) => u.email.trim().toLowerCase() === needle) ?? null;
  },
  async createUser(input) {
    return mutate((db) => {
      const exists = db.users.some(
        (u) => u.email.trim().toLowerCase() === input.email.trim().toLowerCase(),
      );
      if (exists) throw new Error("Email này đã có tài khoản.");
      const row: AppUserRecord = {
        ...input,
        id: randomUUID(),
        signature_html: null,
        phone: null,
        sender_email: null,
        last_login_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.users.push(row);
      return row;
    });
  },
  async updateUser(id, patch) {
    return mutate((db) => {
      const row = db.users.find((u) => u.id === id);
      if (!row) throw new Error("Không tìm thấy tài khoản");
      if (patch.email) {
        const clash = db.users.some(
          (u) => u.id !== id && u.email.trim().toLowerCase() === patch.email!.trim().toLowerCase(),
        );
        if (clash) throw new Error("Email này đã có tài khoản.");
      }
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteUser(id) {
    mutate((db) => {
      db.users = db.users.filter((u) => u.id !== id);
    });
  },
  async touchUserLogin(id) {
    mutate((db) => {
      const row = db.users.find((u) => u.id === id);
      if (row) row.last_login_at = new Date().toISOString();
    });
  },

  /* ------------------------- tệp đính kèm email ------------------------- */
  async createAttachment(input) {
    return mutate((db) => {
      const row: EmailAttachment = {
        ...input,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.attachments.push(row);
      return row;
    });
  },
  async getAttachment(id) {
    return load().attachments.find((a) => a.id === id) ?? null;
  },
  async listAttachments(ids) {
    if (ids.length === 0) return [];
    const want = new Set(ids);
    return load().attachments.filter((a) => want.has(a.id));
  },
  async listAttachmentsForMessage(messageId) {
    return load()
      .attachments.filter((a) => a.message_id === messageId && a.status !== "deleted")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
  async listOrphanAttachments(olderThanISO) {
    return load().attachments.filter(
      (a) => !a.message_id && a.created_at < olderThanISO && a.status !== "deleted",
    );
  },
  async updateAttachment(id, patch) {
    return mutate((db) => {
      const row = db.attachments.find((a) => a.id === id);
      if (!row) throw new Error("Không tìm thấy tệp đính kèm");
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteAttachment(id) {
    mutate((db) => {
      db.attachments = db.attachments.filter((a) => a.id !== id);
    });
  },

  async listMedia(ownerType: MediaOwnerType, ownerId: string) {
    return load()
      .media.filter((m) =>
        ownerType === "product" ? m.product_id === ownerId : m.supplier_id === ownerId,
      )
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  },
  async listMediaForProducts(productIds) {
    const set = new Set(productIds);
    return load().media.filter((m) => m.product_id && set.has(m.product_id));
  },
  async listMediaForSuppliers(supplierIds) {
    const set = new Set(supplierIds);
    return load().media.filter((m) => m.supplier_id && set.has(m.supplier_id));
  },
  async getMedia(id) {
    return load().media.find((m) => m.id === id) ?? null;
  },
  async getMediaByPath(storagePath) {
    return (
      load().media.find((m) => m.storage_path === storagePath || m.thumb_path === storagePath) ?? null
    );
  },
  async createMedia(input: MediaInput) {
    return mutate((db) => {
      const row: MediaAsset = {
        ...input,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.media.push(row);
      return row;
    });
  },
  async updateMedia(id, patch) {
    return mutate((db) => {
      const row = db.media.find((m) => m.id === id);
      if (!row) throw new Error("Không tìm thấy tệp");
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteMedia(id) {
    mutate((db) => {
      db.media = db.media.filter((m) => m.id !== id);
    });
  },

  async listMessages(limit = 200) {
    const rows = [...load().messages].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return rows.slice(0, limit);
  },
  async getMessage(id) {
    return load().messages.find((m) => m.id === id) ?? null;
  },
  async addMessage(input) {
    return mutate((db) => {
      const row: EmailMessage = {
        ...input,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        sent_at: input.sent_at ?? null,
      };
      db.messages.push(row);
      return row;
    });
  },
  async updateMessage(id, patch) {
    return mutate((db) => {
      const row = db.messages.find((m) => m.id === id);
      if (!row) throw new Error("Không tìm thấy email");
      Object.assign(row, cleanPatch(patch));
      return row;
    });
  },
  async deleteMessage(id) {
    mutate((db) => {
      db.messages = db.messages.filter((m) => m.id !== id);
    });
  },

  /* ----------------------- ghi đè nội dung template ----------------------- */
  async listTemplateOverrides() {
    return load().template_overrides ?? [];
  },
  async saveTemplateOverride(o) {
    mutate((db) => {
      const list = db.template_overrides ?? (db.template_overrides = []);
      db.template_overrides = [
        ...list.filter((x) => !(x.stage === o.stage && x.dir === o.dir)),
        { ...o, updated_at: new Date().toISOString() },
      ];
    });
  },
  async clearTemplateOverride(stage, dir) {
    mutate((db) => {
      db.template_overrides = (db.template_overrides ?? []).filter(
        (x) => !(x.stage === stage && x.dir === dir),
      );
    });
  },
  async listProspectOutreachTemplateOverrides() {
    return load().prospect_outreach_template_overrides ?? [];
  },
  async saveProspectOutreachTemplateOverride(input) {
    mutate((db) => {
      const list = db.prospect_outreach_template_overrides ?? (db.prospect_outreach_template_overrides = []);
      db.prospect_outreach_template_overrides = [
        ...list.filter((item) => item.id !== input.id),
        { ...input, updated_at: new Date().toISOString() },
      ];
    });
  },
  async clearProspectOutreachTemplateOverride(id) {
    mutate((db) => {
      db.prospect_outreach_template_overrides = (db.prospect_outreach_template_overrides ?? [])
        .filter((item) => item.id !== id);
    });
  },

  /* ----------------------------- bài viết blog ----------------------------- */
  async listPosts(options) {
    const all = load().posts ?? [];
    const filtered = options?.status ? all.filter((p) => p.status === options.status) : all;
    return [...filtered].sort((a, b) => (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at));
  },
  async getPost(id) {
    return (load().posts ?? []).find((p) => p.id === id) ?? null;
  },
  async getPostBySlug(slug, options) {
    const post = (load().posts ?? []).find((p) => p.slug === slug) ?? null;
    if (!post) return null;
    if (options?.publishedOnly && post.status !== "published") return null;
    return post;
  },
  async createPost(input) {
    const now = new Date().toISOString();
    const post: Post = { ...input, id: randomUUID(), created_at: now, updated_at: now };
    mutate((db) => {
      db.posts = [...(db.posts ?? []), post];
    });
    return post;
  },
  async updatePost(id, patch) {
    const current = (load().posts ?? []).find((p) => p.id === id);
    if (!current) throw new Error("Không tìm thấy bài viết để cập nhật.");
    const updated: Post = { ...current, ...patch, updated_at: new Date().toISOString() };
    mutate((db) => {
      db.posts = (db.posts ?? []).map((p) => (p.id === id ? updated : p));
    });
    return updated;
  },
  async deletePost(id) {
    mutate((db) => {
      db.posts = (db.posts ?? []).filter((p) => p.id !== id);
    });
  },

  /* ----------------------- RFQ FOUNDATION --------------------------------- */
  async listCategories(options?: { publishedOnly?: boolean }): Promise<Category[]> {
    const all = load().categories ?? [];
    return options?.publishedOnly ? all.filter((c) => c.is_published) : [...all];
  },
  async getCategory(id) {
    return (load().categories ?? []).find((c) => c.id === id) ?? null;
  },
  async getCategoryBySlug(slug) {
    return (load().categories ?? []).find((c) => c.slug === slug) ?? null;
  },
  async createCategory(input) {
    const now = new Date().toISOString();
    const cat = {
      id: randomUUID(),
      slug: "",
      parent_id: null,
      name_i18n: {},
      intro_i18n: {},
      faq_i18n: [],
      seo_title_i18n: {},
      seo_desc_i18n: {},
      is_published: false,
      sort_order: 0,
      ...cleanPatch(input),
      created_at: now,
      updated_at: now,
    } as Category;
    mutate((db) => {
      db.categories = [...(db.categories ?? []), cat];
    });
    return cat;
  },
  async updateCategory(id, patch) {
    return mutate((db) => {
      const row = (db.categories ?? []).find((c) => c.id === id);
      if (!row) throw new Error("Category not found");
      Object.assign(row, cleanPatch({ ...patch, updated_at: new Date().toISOString() }));
      return row;
    });
  },
  async deleteCategory(id) {
    return mutate((db) => {
      db.categories = (db.categories ?? []).filter((c) => c.id !== id);
    });
  },

  async setSupplierCategories(supplierId, categoryIds, primaryId) {
    mutate((db) => {
      db.supplier_categories = (db.supplier_categories ?? []).filter((sc) => sc.supplier_id !== supplierId);
      for (const cid of categoryIds) {
        db.supplier_categories.push({
          supplier_id: supplierId,
          category_id: cid,
          is_primary: primaryId ? cid === primaryId : cid === categoryIds[0],
          created_at: new Date().toISOString(),
        });
      }
    });
  },
  async listSupplierCategories(supplierId) {
    return (load().supplier_categories ?? []).filter((sc) => sc.supplier_id === supplierId);
  },

  async listCertificates(supplierId) {
    return (load().certificates ?? []).filter((c) => c.supplier_id === supplierId);
  },
  async createCertificate(input) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      supplier_id: "",
      name: "",
      issuer: null,
      number: null,
      valid_until: null,
      file_media_id: null,
      check_status: "on_file" as const,
      checked_at: null,
      checked_by: null,
      notes: null,
      created_at: now,
      updated_at: now,
      ...cleanPatch(input),
    } as Certificate;
    mutate((db) => {
      db.certificates = [...(db.certificates ?? []), row];
    });
    return row;
  },
  async updateCertificate(id, patch) {
    return mutate((db) => {
      const row = (db.certificates ?? []).find((c) => c.id === id);
      if (!row) throw new Error("Certificate not found");
      Object.assign(row, cleanPatch({ ...patch, updated_at: new Date().toISOString() }));
      return row;
    });
  },
  async deleteCertificate(id) {
    mutate((db) => {
      db.certificates = (db.certificates ?? []).filter((c) => c.id !== id);
    });
  },

  async listVerifications(supplierId) {
    const all = load().verifications ?? [];
    return supplierId ? all.filter((v) => v.supplier_id === supplierId) : [...all];
  },
  async createVerification(input) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      supplier_id: "",
      target_level: 1,
      status: "scheduled" as const,
      inspector_id: null,
      visit_date: null,
      checklist: [],
      public_summary_i18n: {},
      internal_notes: null,
      approved_by: null,
      approved_at: null,
      created_at: now,
      updated_at: now,
      ...cleanPatch(input),
    } as Verification;
    mutate((db) => {
      db.verifications = [...(db.verifications ?? []), row];
    });
    return row;
  },
  async updateVerification(id, patch) {
    return mutate((db) => {
      const row = (db.verifications ?? []).find((v) => v.id === id);
      if (!row) throw new Error("Verification not found");
      Object.assign(row, cleanPatch({ ...patch, updated_at: new Date().toISOString() }));
      return row;
    });
  },

  async listRfqs(options) {
    let rows = [...(load().rfqs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (options?.status) rows = rows.filter((r) => r.status === options.status);
    if (options?.assignedTo !== undefined) {
      rows = rows.filter((r) => r.assigned_to === options.assignedTo);
    }
    return rows;
  },
  async getRfq(id) {
    return (load().rfqs ?? []).find((r) => r.id === id) ?? null;
  },
  async getRfqByToken(token) {
    return (load().rfqs ?? []).find((r) => r.access_token === token) ?? null;
  },
  async getRfqByCode(code) {
    return (load().rfqs ?? []).find((r) => r.code === code) ?? null;
  },
  async createRfq(input) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      code: "",
      buyer_id: "",
      category_id: null,
      product_text: "",
      specs: {},
      quantity: null,
      unit: null,
      frequency: null,
      destination_country: null,
      incoterm: null,
      needed_by: null,
      target_price: null,
      target_price_currency: "USD",
      wants_samples: false,
      wants_inspection: false,
      wants_video_call: false,
      preferred_supplier_ids: [],
      source_page: null,
      utm: {},
      referrer: null,
      spam_score: 0,
      spam_flags: [],
      status: "new" as const,
      assigned_to: null,
      first_response_at: null,
      closed_reason: null,
      access_token: randomUUID(),
      created_at: now,
      updated_at: now,
      ...cleanPatch(input),
    } as unknown as Rfq;
    mutate((db) => {
      db.rfqs = [...(db.rfqs ?? []), row];
    });
    return row;
  },
  async updateRfq(id, patch) {
    return mutate((db) => {
      const row = (db.rfqs ?? []).find((r) => r.id === id);
      if (!row) throw new Error("RFQ not found");
      Object.assign(row, cleanPatch({ ...patch, updated_at: new Date().toISOString() }));
      return row;
    });
  },

  async listRfqAttachments(rfqId) {
    return (load().rfq_attachments ?? []).filter((a) => a.rfq_id === rfqId);
  },
  async createRfqAttachment(input) {
    const row = {
      id: randomUUID(),
      rfq_id: "",
      bucket: "rfq-attachments",
      storage_path: "",
      file_name: "",
      mime_type: "application/octet-stream",
      size_bytes: 0,
      uploaded_by: null,
      created_at: new Date().toISOString(),
      ...cleanPatch(input),
    } as RfqAttachment;
    mutate((db) => {
      db.rfq_attachments = [...(db.rfq_attachments ?? []), row];
    });
    return row;
  },
  async deleteRfqAttachment(id) {
    mutate((db) => {
      db.rfq_attachments = (db.rfq_attachments ?? []).filter((a) => a.id !== id);
    });
  },

  async listRfqMatches(rfqId) {
    return (load().rfq_matches ?? []).filter((m) => m.rfq_id === rfqId);
  },
  async createRfqMatch(input) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      rfq_id: "",
      supplier_id: "",
      status: "proposed" as const,
      sent_to_supplier_at: null,
      quote_price: null,
      quote_currency: "USD",
      quote_unit: null,
      quote_incoterm: null,
      quote_lead_time_days: null,
      quote_valid_until: null,
      quote_file_id: null,
      sent_to_buyer_at: null,
      internal_note: null,
      created_at: now,
      updated_at: now,
      ...cleanPatch(input),
    } as unknown as RfqMatch;
    mutate((db) => {
      db.rfq_matches = [...(db.rfq_matches ?? []), row];
    });
    return row;
  },
  async updateRfqMatch(id, patch) {
    return mutate((db) => {
      const row = (db.rfq_matches ?? []).find((m) => m.id === id);
      if (!row) throw new Error("RFQ match not found");
      Object.assign(row, cleanPatch({ ...patch, updated_at: new Date().toISOString() }));
      return row;
    });
  },

  async findIntroduction(buyerId, supplierId) {
    return (
      (load().introductions ?? []).find(
        (i) => i.buyer_id === buyerId && i.supplier_id === supplierId,
      ) ?? null
    );
  },
  async createIntroduction(input) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      buyer_id: "",
      supplier_id: "",
      first_rfq_id: "",
      introduced_at: now,
      protected_until: "",
      created_at: now,
      ...cleanPatch(input),
    } as Introduction;
    mutate((db) => {
      db.introductions = [...(db.introductions ?? []), row];
    });
    return row;
  },

  async addAuditLog(entry) {
    const row: AuditLogEntry = {
      id: (load().audit_log ?? []).length + 1,
      actor_id: entry.actor_id ?? null,
      actor_email: entry.actor_email ?? null,
      entity: entry.entity,
      entity_id: entry.entity_id,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
      created_at: new Date().toISOString(),
    };
    mutate((db) => {
      db.audit_log = [...(db.audit_log ?? []), row];
    });
    return row;
  },
};
