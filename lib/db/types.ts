import type {
  Activity,
  ActivityType,
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
  ProspectOutreachTemplate,
  Post,
  PostInput,
  PostStatus,
  Verification,
} from "@/lib/types";

export interface DataStore {
  mode: "supabase" | "local";
  listSuppliers(): Promise<Supplier[]>;
  getSupplier(id: string): Promise<Supplier | null>;
  createSupplier(input: SupplierInput): Promise<Supplier>;
  updateSupplier(id: string, patch: Partial<SupplierInput>): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;
  listSupplierVerificationRequests(supplierId?: string): Promise<SupplierVerificationRequest[]>;
  createSupplierVerificationRequest(supplierId: string, level: 2 | 3): Promise<SupplierVerificationRequest>;
  markSupplierVerificationContacted(supplierId: string, level: 2 | 3, actorId: string): Promise<SupplierVerificationRequest>;

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

  // ----- Prospect lạnh -----
  listProspects(): Promise<Prospect[]>;
  getProspect(id: string): Promise<Prospect | null>;
  createProspect(input: ProspectInput): Promise<Prospect>;
  createProspects(inputs: ProspectInput[]): Promise<Prospect[]>;
  updateProspect(id: string, patch: Partial<Omit<Prospect, "id" | "created_at" | "updated_at">>): Promise<Prospect>;
  deleteProspect(id: string): Promise<void>;
  listProspectActivities(prospectId: string): Promise<ProspectActivity[]>;
  addProspectActivity(input: {
    prospect_id: string;
    channel: ProspectActivityChannel;
    summary: string;
    created_by?: string | null;
  }): Promise<ProspectActivity>;
  addProspectActivities(inputs: {
    prospect_id: string;
    channel: ProspectActivityChannel;
    summary: string;
    created_by?: string | null;
  }[]): Promise<ProspectActivity[]>;

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
  listMessagesForRfq(rfqId: string): Promise<EmailMessage[]>;
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
  /** Ghi đè nội dung email theo giai đoạn (trang Templates) */
  listTemplateOverrides(): Promise<TemplateOverride[]>;
  saveTemplateOverride(
    o: Omit<TemplateOverride, "updated_at">,
  ): Promise<void>;
  clearTemplateOverride(stage: string, dir: "buyer" | "supplier"): Promise<void>;
  listProspectOutreachTemplateOverrides(): Promise<ProspectOutreachTemplate[]>;
  saveProspectOutreachTemplateOverride(input: Omit<ProspectOutreachTemplate, "updated_at">): Promise<void>;
  clearProspectOutreachTemplateOverride(id: string): Promise<void>;

  /* ----------------------------- bài viết blog ----------------------------- */
  listPosts(options?: { status?: PostStatus }): Promise<Post[]>;
  getPost(id: string): Promise<Post | null>;
  getPostBySlug(slug: string, options?: { publishedOnly?: boolean }): Promise<Post | null>;
  createPost(input: PostInput): Promise<Post>;
  updatePost(id: string, patch: Partial<PostInput>): Promise<Post>;
  deletePost(id: string): Promise<void>;

  /* ----------------------- RFQ FOUNDATION (GĐ0-GĐ2) ----------------------- */
  // Categories (2 cấp)
  listCategories(options?: { publishedOnly?: boolean }): Promise<Category[]>;
  getCategory(id: string): Promise<Category | null>;
  getCategoryBySlug(slug: string): Promise<Category | null>;
  createCategory(input: Partial<Category>): Promise<Category>;
  updateCategory(id: string, patch: Partial<Category>): Promise<Category>;
  deleteCategory(id: string): Promise<void>;

  // Supplier – category link
  setSupplierCategories(supplierId: string, categoryIds: string[], primaryId?: string | null): Promise<void>;
  listSupplierCategories(supplierId: string): Promise<SupplierCategory[]>;

  // Certificates
  listCertificates(supplierId: string): Promise<Certificate[]>;
  createCertificate(input: Partial<Certificate>): Promise<Certificate>;
  updateCertificate(id: string, patch: Partial<Certificate>): Promise<Certificate>;
  deleteCertificate(id: string): Promise<void>;

  // Verifications
  listVerifications(supplierId?: string): Promise<Verification[]>;
  getVerification(id: string): Promise<Verification | null>;
  createVerification(input: Partial<Verification>): Promise<Verification>;
  updateVerification(id: string, patch: Partial<Verification>): Promise<Verification>;

  // RFQs
  listRfqs(options?: { status?: string; assignedTo?: string | null }): Promise<Rfq[]>;
  getRfq(id: string): Promise<Rfq | null>;
  getRfqByToken(token: string): Promise<Rfq | null>;
  getRfqByCode(code: string): Promise<Rfq | null>;
  createRfq(input: Partial<Rfq>): Promise<Rfq>;
  updateRfq(id: string, patch: Partial<Rfq>): Promise<Rfq>;

  // RFQ attachments
  listRfqAttachments(rfqId: string): Promise<RfqAttachment[]>;
  createRfqAttachment(input: Partial<RfqAttachment>): Promise<RfqAttachment>;
  deleteRfqAttachment(id: string): Promise<void>;

  // RFQ matches
  listRfqMatches(rfqId: string): Promise<RfqMatch[]>;
  listSupplierRfqInvitations(supplierId: string): Promise<SupplierRfqInvitation[]>;
  listSupplierNoticeReads(supplierId: string): Promise<SupplierNoticeRead[]>;
  markSupplierNoticeRead(supplierId: string, noticeKey: string): Promise<void>;
  getRfqMatch(id: string): Promise<RfqMatch | null>;
  createRfqMatch(input: Partial<RfqMatch>): Promise<RfqMatch>;
  updateRfqMatch(id: string, patch: Partial<RfqMatch>): Promise<RfqMatch>;
  deleteRfqMatch(id: string): Promise<void>;

  // Introductions (bảo vệ không vượt mặt)
  findIntroduction(buyerId: string, supplierId: string): Promise<Introduction | null>;
  createIntroduction(input: Partial<Introduction>): Promise<Introduction>;

  // Audit log
  addAuditLog(entry: {
    actor_id?: string | null;
    actor_email?: string | null;
    entity: string;
    entity_id: string;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }): Promise<AuditLogEntry>;
}
