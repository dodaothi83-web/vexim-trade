import type {
  Activity,
  ActivityType,
  AppUser,
  AppUserInput,
  AppUserRecord,
  Buyer,
  BuyerInput,
  EmailAttachment,
  EmailMessage,
  MediaAsset,
  MediaInput,
  MediaOwnerType,
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

  // ----- Người dùng & phân quyền -----
  listUsers(): Promise<AppUser[]>;
  countUsers(): Promise<number>;
  getUser(id: string): Promise<AppUserRecord | null>;
  getUserByEmail(email: string): Promise<AppUserRecord | null>;
  createUser(input: AppUserInput): Promise<AppUserRecord>;
  updateUser(id: string, patch: Partial<AppUserRecord>): Promise<AppUserRecord>;
  deleteUser(id: string): Promise<void>;
  touchUserLogin(id: string): Promise<void>;

  // ----- Hình ảnh & tài liệu -----
  listMedia(ownerType: MediaOwnerType, ownerId: string): Promise<MediaAsset[]>;
  listMediaForProducts(productIds: string[]): Promise<MediaAsset[]>;
  listMediaForSuppliers(supplierIds: string[]): Promise<MediaAsset[]>;
  getMedia(id: string): Promise<MediaAsset | null>;
  /** Tìm theo đường dẫn tệp (dùng cho route phục vụ tệp) */
  getMediaByPath(storagePath: string): Promise<MediaAsset | null>;
  createMedia(input: MediaInput): Promise<MediaAsset>;
  updateMedia(id: string, patch: Partial<MediaInput>): Promise<MediaAsset>;
  deleteMedia(id: string): Promise<void>;

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

  /* ---- tệp đính kèm email (chỉ metadata; nội dung ở Supabase Storage) ---- */
  createAttachment(
    input: Omit<EmailAttachment, "id" | "created_at" | "updated_at">,
  ): Promise<EmailAttachment>;
  getAttachment(id: string): Promise<EmailAttachment | null>;
  listAttachments(ids: string[]): Promise<EmailAttachment[]>;
  listAttachmentsForMessage(messageId: string): Promise<EmailAttachment[]>;
  /** Tệp chưa gắn email nào và tạo trước mốc thời gian — dùng để dọn tệp mồ côi */
  listOrphanAttachments(olderThanISO: string): Promise<EmailAttachment[]>;
  updateAttachment(
    id: string,
    patch: Partial<Omit<EmailAttachment, "id" | "created_at">>,
  ): Promise<EmailAttachment>;
  deleteAttachment(id: string): Promise<void>;
  deleteMessage(id: string): Promise<void>;
}
