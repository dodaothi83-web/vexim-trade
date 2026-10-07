import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
import type { DataStore } from "@/lib/db/types";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function supabaseConfigured(): boolean {
  return getSupabaseClient() !== null;
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
      .update({ ...patch, updated_at: new Date().toISOString() })
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
      .update({ ...patch, updated_at: new Date().toISOString() })
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
      .update({ ...patch, updated_at: new Date().toISOString() })
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
      .update(patch)
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
};
