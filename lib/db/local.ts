import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
  ProspectOutreachTemplate,
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
  attachments: EmailAttachment[];
}

const FILE = path.join(process.cwd(), "data", "local-db.json");

const g = globalThis as unknown as { __veximLocal?: LocalShape };

function nowISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString();
}

function seed(): LocalShape {
  const suppliers: Supplier[] = SEED_SUPPLIERS.map((s, i) => ({
    ...s,
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

  const products: SupplierProduct[] = SEED_PRODUCTS.map((raw, i) => {
    const { supplier_ref, ...rest } = raw;
    return {
      ...rest,
      id: `prod-seed-${i + 1}`,
      supplier_id: suppliers[supplier_ref]?.id ?? "",
      // Hồ sơ mẫu chưa có ảnh/catalogue nên mặc định chưa sẵn sàng gửi buyer
      ready_for_buyer: false,
      created_at: nowISO(40 - i),
      updated_at: nowISO(Math.max(0, 10 - i)),
    } satisfies SupplierProduct;
  });

  return { users: [], buyers, prospects: [], prospect_activities: [], suppliers, products, media: [], activities, messages: [], attachments: [], template_overrides: [], prospect_outreach_template_overrides: [] };
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
  }
}

function load(): LocalShape {
  if (g.__veximLocal) {
    const c = g.__veximLocal;
    if (!Array.isArray(c.messages)) c.messages = [];
    if (!Array.isArray(c.prospects)) c.prospects = [];
    normalizeProspects(c.prospects);
    if (!Array.isArray(c.prospect_activities)) c.prospect_activities = [];
    if (!Array.isArray(c.prospect_outreach_template_overrides)) c.prospect_outreach_template_overrides = [];
    if (!Array.isArray(c.activities)) c.activities = [];
    if (!Array.isArray(c.products)) c.products = [];
    if (!Array.isArray(c.media)) c.media = [];
    if (!Array.isArray(c.users)) c.users = [];
    c.users.forEach((u) => {
      if (u.signature_html === undefined) u.signature_html = null;
    });
    if (!Array.isArray(c.attachments)) c.attachments = [];
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
        if (!Array.isArray(parsed.activities)) parsed.activities = [];
        if (!Array.isArray(parsed.products)) parsed.products = [];
        if (!Array.isArray(parsed.media)) parsed.media = [];
        if (!Array.isArray(parsed.users)) parsed.users = [];
        if (!Array.isArray(parsed.attachments)) parsed.attachments = [];
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
  return { ...rest, signature_html: row.signature_html ?? null, has_local_password };
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
      const row: Prospect = { ...input, id: randomUUID(), created_at: now, updated_at: now };
      db.prospects.push(row);
      return row;
    });
  },
  async createProspects(inputs: ProspectInput[]) {
    return mutate((db) => {
      const now = new Date().toISOString();
      const rows = inputs.map((input) => ({ ...input, id: randomUUID(), created_at: now, updated_at: now }));
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
};
