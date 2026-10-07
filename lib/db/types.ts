import type {
  Activity,
  ActivityType,
  Buyer,
  BuyerInput,
  EmailMessage,
  Supplier,
  SupplierInput,
  SupplierProduct,
  SupplierProductInput,
} from "@/lib/types";

export interface DataStore {
  mode: "supabase" | "local";
  listSuppliers(): Promise<Supplier[]>;
  getSupplier(id: string): Promise<Supplier | null>;
  createSupplier(input: SupplierInput): Promise<Supplier>;
  updateSupplier(id: string, patch: Partial<SupplierInput>): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;

  listProducts(): Promise<SupplierProduct[]>;
  getProduct(id: string): Promise<SupplierProduct | null>;
  listProductsBySupplier(supplierId: string): Promise<SupplierProduct[]>;
  createProduct(input: SupplierProductInput): Promise<SupplierProduct>;
  updateProduct(id: string, patch: Partial<SupplierProductInput>): Promise<SupplierProduct>;
  deleteProduct(id: string): Promise<void>;

  listBuyers(): Promise<Buyer[]>;
  getBuyer(id: string): Promise<Buyer | null>;
  createBuyer(input: BuyerInput): Promise<Buyer>;
  updateBuyer(id: string, patch: Partial<BuyerInput>): Promise<Buyer>;
  deleteBuyer(id: string): Promise<void>;

  listActivities(buyerId?: string): Promise<Activity[]>;
  addActivity(input: {
    buyer_id: string;
    type: ActivityType;
    from_stage?: string | null;
    to_stage?: string | null;
    message: string;
    created_by?: string | null;
  }): Promise<Activity>;

  listMessages(limit?: number): Promise<EmailMessage[]>;
  getMessage(id: string): Promise<EmailMessage | null>;
  addMessage(
    input: Omit<EmailMessage, "id" | "created_at" | "sent_at"> & { sent_at?: string | null },
  ): Promise<EmailMessage>;
  updateMessage(
    id: string,
    patch: Partial<Omit<EmailMessage, "id" | "created_at">>,
  ): Promise<EmailMessage>;
  deleteMessage(id: string): Promise<void>;
}
