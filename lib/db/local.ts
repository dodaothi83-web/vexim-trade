import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  Activity,
  Buyer,
  BuyerInput,
  EmailMessage,
  Supplier,
  SupplierInput,
  SupplierProduct,
  SupplierProductInput,
} from "@/lib/types";
import { SEED_BUYERS, SEED_PRODUCTS, SEED_SUPPLIERS } from "@/lib/db/seed";
import type { DataStore } from "@/lib/db/types";

interface LocalShape {
  buyers: Buyer[];
  suppliers: Supplier[];
  products: SupplierProduct[];
  activities: Activity[];
  messages: EmailMessage[];
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
      created_at: nowISO(40 - i),
      updated_at: nowISO(Math.max(0, 10 - i)),
    } satisfies SupplierProduct;
  });

  return { buyers, suppliers, products, activities, messages: [] };
}

function load(): LocalShape {
  if (g.__veximLocal) {
    const c = g.__veximLocal;
    if (!Array.isArray(c.messages)) c.messages = [];
    if (!Array.isArray(c.activities)) c.activities = [];
    if (!Array.isArray(c.products)) c.products = [];
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
        if (!Array.isArray(parsed.activities)) parsed.activities = [];
        if (!Array.isArray(parsed.products)) parsed.products = [];
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
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteSupplier(id) {
    mutate((db) => {
      db.suppliers = db.suppliers.filter((s) => s.id !== id);
      for (const b of db.buyers) if (b.supplier_id === id) b.supplier_id = null;
      db.products = db.products.filter((pr) => pr.supplier_id !== id);
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
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteProduct(id) {
    mutate((db) => {
      db.products = db.products.filter((pr) => pr.id !== id);
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
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
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
      Object.assign(row, patch);
      return row;
    });
  },
  async deleteMessage(id) {
    mutate((db) => {
      db.messages = db.messages.filter((m) => m.id !== id);
    });
  },
};
