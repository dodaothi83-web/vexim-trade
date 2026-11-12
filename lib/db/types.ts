import type { ChatConversation, ChatMessage, SourcingRequest, SupportConversation, SupportMessage } from "@/lib/types";
import type {
  Activity,
  ActivityType,
  AppUser,
  AppUserInput,
  AppUserRecord,
  AuditLogEntry,
  Buyer,
  BuyerInput,
  BuyerRfqOutreach,
  BuyerSignInToken,
  BuyerUser,
  BuyerUserInput,
  BuyerSavedProduct,
  Category,
  Certificate,
  CertificateScope,
  ProductCertificateOptout,
  Introduction,
  Prospect,
  ProspectInput,
  ProspectActivity,
  ProspectActivityChannel,
  EmailAttachment,
  EmailMessage,
  MessageKind,
  MediaAsset,
  MediaInput,
  MediaOwnerType,
  Rfq,
  RfqAttachment,
  RfqMatch,
  RfqQuoteVersion,
  RfqThreadMessage,
  RfqPortalAlert,
  RfqMediatedThread,
  RfqMediatedMessage,
  RfqMediatedAlert,
  RfqLeadRating,
  SponsoredPush,
  SponsoredPushDaily,
  SponsoredPushInput,
  SponsoredPushSurface,
  SponsoredRequest,
  SponsoredRequestInput,
  SponsoredRequestStatus,
  SupplierRfqInvitation,
  SupplierNoticeRead,
  Supplier,
  SupplierInput,
  SupplierSubmission,
  SupplierSubmissionItem,
  SupplierSubmissionLink,
  SupplierVerificationRequest,
  SupplierCategory,
  SupplierCategoryRequest,
  SupplierCategoryRequestInput,
  SupplierProduct,
  SupplierProductInput,
  SupplierProductReviewStatus,
  TemplateOverride,
  ProspectOutreachTemplate,
  Post,
  PostInput,
  PostStatus,
  Verification,
} from "@/lib/types";

export type SupplierDraftDeleteResult =
  | { status: "deleted"; paths: string[] }
  | { status: "not_deletable" | "has_links" };

export type SupplierMediaDeleteResult =
  | { status: "deleted"; paths: string[]; kind: MediaAsset["kind"] }
  | { status: "forbidden" | "state_changed" | "last_file" | "has_links" };

export interface DataStore {
  mode: "supabase" | "local";
  listSuppliers(): Promise<Supplier[]>;
  getSupplier(id: string): Promise<Supplier | null>;
  createSupplier(input: SupplierInput): Promise<Supplier>;
  updateSupplier(id: string, patch: Partial<SupplierInput>): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;
  listSupplierVerificationRequests(supplierId?: string): Promise<SupplierVerificationRequest[]>;
  createSupplierVerificationRequest(supplierId: string, level: 2 | 3): Promise<SupplierVerificationRequest>;

  listProducts(): Promise<SupplierProduct[]>;
  getProduct(id: string): Promise<SupplierProduct | null>;
  listProductsBySupplier(supplierId: string): Promise<SupplierProduct[]>;
  createProduct(input: SupplierProductInput): Promise<SupplierProduct>;
  updateProduct(id: string, patch: Partial<SupplierProductInput>): Promise<SupplierProduct>;
  deleteProduct(id: string): Promise<void>;
  /** Compare-and-set: không ghi đè trạng thái duyệt/ẩn vừa thay đổi ở một tab khác. */
  updateSupplierProductIfState(
    id: string, supplierId: string,
    expected: { review: SupplierProductReviewStatus | null; ready: boolean },
    patch: Partial<SupplierProductInput>,
  ): Promise<SupplierProduct | null>;
  /** Chỉ xóa nháp thuộc NCC, chưa có lịch sử liên quan; trả đường dẫn tệp để dọn kho. */
  deleteSupplierDraftProduct(id: string, supplierId: string): Promise<SupplierDraftDeleteResult>;

  listBuyers(): Promise<Buyer[]>;
  getBuyer(id: string): Promise<Buyer | null>;
  /** Hồ sơ CRM của người mua, tra theo email đã lưu chữ thường. */
  getBuyerByEmail(email: string): Promise<Buyer | null>;
  createBuyer(input: BuyerInput): Promise<Buyer>;
  updateBuyer(id: string, patch: Partial<BuyerInput>): Promise<Buyer>;
  /** Atomic compare-and-set: only an unassigned Buyer can be linked by a sent direct RFQ. */
  attachBuyerIfUnassigned(buyerId: string, supplierId: string): Promise<boolean>;
  deleteBuyer(id: string): Promise<void>;

  // ----- Tài khoản người mua (khác app_users và khác buyers) -----
  getBuyerUser(id: string): Promise<BuyerUser | null>;
  getBuyerUserByEmail(email: string): Promise<BuyerUser | null>;
  createBuyerUser(input: BuyerUserInput): Promise<BuyerUser>;
  updateBuyerUser(id: string, patch: Partial<BuyerUserInput>): Promise<BuyerUser>;
  deleteBuyerUser(id: string): Promise<void>;
  setBuyerSavedProduct(accountId: string, product: BuyerSavedProduct, saved: boolean): Promise<void>;
  listBuyerRfqsByEmail(email: string): Promise<Rfq[]>;
  /** Phát một thư đăng nhập: link và mã 6 số cùng một dòng, đã băm. */
  createBuyerSignInToken(input: {
    email: string;
    link_hash: string;
    code_hash: string;
    expires_at: string;
  }): Promise<BuyerSignInToken>;
  /** Token còn sống mới nhất của email (chưa tiêu, chưa hết hạn). */
  findBuyerSignInToken(email: string): Promise<BuyerSignInToken | null>;
  /** Token theo băm của link — luồng bấm link trong thư không biết email trước. */
  getBuyerSignInTokenByLinkHash(linkHash: string): Promise<BuyerSignInToken | null>;
  /** Tiêu token theo kiểu nguyên tử: chỉ một lời gọi thắng. */
  consumeBuyerSignInToken(id: string): Promise<boolean>;
  /** Tăng số lần nhập sai; trả về số lần sau khi tăng. */
  bumpBuyerSignInAttempts(id: string): Promise<number>;
  /** Huỷ ngay token của email (dùng khi vượt trần số lần thử). */
  deleteBuyerSignInTokens(email: string): Promise<void>;

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
  // ----- Ngành NCC tự khai (yêu cầu mở danh mục) -----
  /** Yêu cầu còn chờ của một NCC; nộp lại chỉ cập nhật dòng cũ, không sinh hàng trùng. */
  upsertSupplierCategoryRequests(supplierId: string, requests: SupplierCategoryRequestInput[]): Promise<SupplierCategoryRequest[]>;
  /** Mọi yêu cầu của một NCC, mới nhất trước — NCC đọc được câu trả lời của mình. */
  listSupplierCategoryRequests(supplierId: string): Promise<SupplierCategoryRequest[]>;
  /** Toàn bộ yêu cầu còn chờ, cho trang gom nhóm của CRM. */
  listPendingSupplierCategoryRequests(): Promise<SupplierCategoryRequest[]>;
  /** Nhân viên chốt một yêu cầu: mở (kèm danh mục) hoặc từ chối (kèm lý do). */
  decideSupplierCategoryRequest(input: {
    id: string; status: "opened" | "rejected"; categorySlug: string | null; note: string | null; decidedBy: string | null;
  }): Promise<SupplierCategoryRequest | null>;

  /**
   * Việc phía NCC đang chờ Vexim: tài khoản đã tạo mà chưa nộp hồ sơ, cộng hồ sơ đã nộp
   * nhưng chưa được xác nhận quyền cổng. Badge menu Nhà cung cấp.
   */
  countSupplierAccountsPending(): Promise<number>;
  /** Sản phẩm NCC đã gửi, chờ Vexim kiểm nội dung — badge menu Sản phẩm. */
  countProductsPendingReview(): Promise<number>;
  /** Đợt kiểm đã nộp, chờ người có quyền duyệt — badge menu Xác minh. */
  countReviewsAwaitingApproval(): Promise<number>;
  /** Hồ sơ NCC tự gửi đang chờ đối chiếu — badge riêng của menu Hồ sơ NCC tự gửi. */
  countSubmissionsPendingReview(): Promise<number>;
  /**
   * Giấy chứng nhận NCC đã tải, chờ nhân viên duyệt — badge menu Giấy tờ & chứng nhận.
   * Chỉ đếm giấy `pending`; giấy chưa phân loại và yêu cầu mở rộng phạm vi là hàng đợi
   * nằm trong trang `/crm/certificates`, không cộng vào huy hiệu.
   */
  countCertificatesPendingReview(): Promise<number>;
  getUser(id: string): Promise<AppUserRecord | null>;
  getUserByEmail(email: string): Promise<AppUserRecord | null>;
  /** Tài khoản đăng nhập đang gắn với một hồ sơ NCC (mỗi hồ sơ tối đa một tài khoản). */
  getUserBySupplierId(supplierId: string): Promise<AppUserRecord | null>;
  createUser(input: AppUserInput): Promise<AppUserRecord>;
  updateUser(id: string, patch: Partial<AppUserRecord>): Promise<AppUserRecord>;
  /** Atomic first-profile claim: prevents concurrent submissions creating multiple supplier pages. */
  claimSupplierForUser(userId: string, supplierId: string): Promise<boolean>;
  deleteUser(id: string): Promise<void>;
  touchUserLogin(id: string): Promise<void>;

  // ----- Đẩy sản phẩm -----
  /**
   * Các gói đang hiệu lực tại thời điểm `now`, đã lọc theo bề mặt và danh mục.
   * Chỉ trả gói `approved`; nơi gọi vẫn kiểm lại thời hạn.
   */
  listSponsoredPushes(input: {
    surface: SponsoredPushSurface;
    categorySlug?: string | null;
    now: string;
  }): Promise<SponsoredPush[]>;
  /**
   * Toàn bộ gói cho màn quản trị, mọi trạng thái và mọi thời hạn.
   *
   * Khác `listSponsoredPushes` ở chỗ không lọc: người vận hành cần thấy cả gói
   * chờ duyệt, gói đã tắt và gói đã hết hạn. Ném lỗi khi bảng chưa tồn tại, để
   * màn quản trị nói được là chưa áp migration thay vì hiện danh sách rỗng.
   */
  listAllSponsoredPushes(): Promise<SponsoredPush[]>;
  createSponsoredPush(input: SponsoredPushInput): Promise<SponsoredPush>;
  /** Chỉ cập nhật nếu trạng thái vẫn như lúc đọc; null nghĩa là đã đổi hoặc bị xoá. */
  updateSponsoredPushIfStatus(
    id: string,
    expected: SponsoredPush["status"],
    patch: Partial<Pick<SponsoredPush,
      "status" | "starts_at" | "ends_at" | "price_amount" | "price_currency" |
      "note" | "approved_by" | "approved_at">>,
  ): Promise<SponsoredPush | null>;
  /** Xoá có điều kiện: không xoá gói vừa được duyệt ở một phiên khác. */
  deleteSponsoredDraft(id: string): Promise<boolean>;
  /** Số liệu theo ngày của các gói được chọn, từ `sinceDay` (yyyy-mm-dd, UTC). */
  listSponsoredPushDaily(pushIds: string[], sinceDay: string): Promise<SponsoredPushDaily[]>;

  /** Chỉ các gói của một NCC; không trả ghi chú nội bộ ra giao diện. */
  listSponsoredPushesForSupplier(supplierId: string): Promise<SponsoredPush[]>;
  /** Yêu cầu do NCC gửi; lỗi đọc/ghi không được chuyển sang dữ liệu khác. */
  listSponsoredRequestsForSupplier(supplierId: string): Promise<SponsoredRequest[]>;
  listSponsoredRequests(): Promise<SponsoredRequest[]>;
  countNewSponsoredRequests(): Promise<number>;
  createSponsoredRequest(input: SponsoredRequestInput): Promise<SponsoredRequest>;
  updateSponsoredRequestIfStatus(id: string, expected: SponsoredRequestStatus,
    status: SponsoredRequestStatus, userId: string): Promise<SponsoredRequest | null>;

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
  /** Xóa tệp NCC trong transaction cùng kiểm tra trạng thái và tệp buyer cuối. */
  deleteSupplierProductMedia(productId: string, supplierId: string, userId: string, mediaId: string): Promise<SupplierMediaDeleteResult>;

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
  /** Thư đã ghi theo đúng kind — dùng để chống gửi trùng (ví dụ nhắc NCC). */
  listMessagesOfKind(kind: MessageKind): Promise<EmailMessage[]>;
  listMessagesForRfq(rfqId: string): Promise<EmailMessage[]>;
  /* Chat người mua ↔ nhà cung cấp. */
  findChatConversation(buyerEmail: string, supplierId: string): Promise<ChatConversation | null>;
  getChatConversation(id: string): Promise<ChatConversation | null>;
  createChatConversation(input: Pick<ChatConversation, "buyer_email" | "supplier_id" | "product_id" | "product_name">): Promise<ChatConversation>;
  updateChatConversation(id: string, patch: Partial<Omit<ChatConversation, "id" | "buyer_email" | "supplier_id" | "created_at">>): Promise<void>;
  /** Mới nhất trước. `buyerEmail` hoặc `supplierId`; bỏ trống cả hai là toàn bộ (CRM). */
  listChatConversations(filter: { buyerEmail?: string; supplierId?: string; limit?: number }): Promise<ChatConversation[]>;
  listChatMessages(conversationId: string, limit?: number): Promise<ChatMessage[]>;
  addChatMessage(input: Omit<ChatMessage, "id" | "created_at">): Promise<ChatMessage>;
  /* Chat người mua ↔ đội Vexim (một cuộc cho mỗi người mua). */
  getSupportConversationByBuyer(buyerEmail: string): Promise<SupportConversation | null>;
  getSupportConversation(id: string): Promise<SupportConversation | null>;
  /** Tạo hoặc trả lại cuộc đã có của người mua này. */
  createSupportConversation(buyerEmail: string): Promise<SupportConversation>;
  updateSupportConversation(id: string, patch: Partial<Omit<SupportConversation, "id" | "buyer_email" | "created_at">>): Promise<void>;
  listSupportConversations(filter?: { assignedTo?: string | null; limit?: number }): Promise<SupportConversation[]>;
  listSupportMessages(conversationId: string, limit?: number): Promise<SupportMessage[]>;
  addSupportMessage(input: Omit<SupportMessage, "id" | "created_at">): Promise<SupportMessage>;
  /* Lần cuối mỗi bên còn mở Vexim (trạng thái online của chat). */
  /**
   * Nhận việc gửi email báo tin: đặt cột mốc thành `next` chỉ khi nó vẫn đang là `expected`.
   * Trả về false nếu máy chủ khác đã nhận trước, để hai lần quét cùng lúc không gửi trùng.
   */
  claimChatNotification(table: "chat_conversations" | "support_conversations", id: string,
    column: "buyer_notified_at" | "supplier_notified_at" | "staff_notified_at" | "buyer_reminded_at" | "supplier_reminded_at" | "staff_reminded_at" | "unanswered_escalated_at",
    expected: string | null, next: string | null): Promise<boolean>;
  touchChatPresence(key: string, at: string): Promise<void>;
  getChatPresence(keys: string[]): Promise<Record<string, string>>;
  /** Thư thuộc các mạch đã cho (ví dụ `sourcing-{id}`), mới nhất trước. */
  listMessagesForThreads(threadIds: string[]): Promise<EmailMessage[]>;
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
  /** Nhiều nhà cung cấp, chia lô và phân trang; chỉ dùng trên máy chủ. */
  listCertificatesForSuppliers(supplierIds: string[]): Promise<Certificate[]>;
  getCertificate(id: string): Promise<Certificate | null>;
  createCertificate(input: Partial<Certificate>): Promise<Certificate>;
  updateCertificate(id: string, patch: Partial<Certificate>): Promise<Certificate>;
  deleteCertificate(id: string): Promise<void>;

  /* Phạm vi chứng nhận + opt-out của nhà cung cấp (GĐ2 giấy tờ & chứng nhận). */
  listCertificateScopes(certificateIds: string[]): Promise<CertificateScope[]>;
  createCertificateScope(input: Partial<CertificateScope>): Promise<CertificateScope>;
  deleteCertificateScope(id: string): Promise<void>;
  listCertificateOptouts(supplierId: string): Promise<ProductCertificateOptout[]>;
  /** Nhiều nhà cung cấp, chia lô và phân trang; chỉ dùng trên máy chủ (bộ lọc chứng nhận). */
  listCertificateOptoutsForSuppliers(supplierIds: string[]): Promise<ProductCertificateOptout[]>;
  /** Bật/tắt việc nhà cung cấp bỏ nhận một chứng nhận thừa hưởng từ danh mục. */
  setCertificateOptout(supplierId: string, productId: string, certificateId: string, on: boolean): Promise<void>;

  // Verifications
  listVerifications(supplierId?: string): Promise<Verification[]>;
  /** Nhiều nhà cung cấp, chia lô và phân trang; chỉ dùng trên máy chủ. */
  listVerificationsForSuppliers(supplierIds: string[]): Promise<Verification[]>;
  getVerification(id: string): Promise<Verification | null>;
  /** Đợt kiểm L2 đã duyệt theo mã báo cáo công khai (VXR-…); null nếu không có. */
  getVerificationByReportCode?(code: string): Promise<Verification | null>;
  createVerification(input: Partial<Verification>): Promise<Verification>;
  updateVerification(id: string, patch: Partial<Verification>): Promise<Verification>;

  /* ---- Cổng NCC tự gửi bằng chứng L2 (nhà máy) / L3 (lịch sử xuất khẩu) ----
   * Hồ sơ tự gửi KHÔNG phải kết quả xác minh; duyệt vẫn là đợt kiểm của nhân viên. */
  listSubmissions(supplierId?: string, level?: 2 | 3): Promise<SupplierSubmission[]>;
  getSubmission(id: string): Promise<SupplierSubmission | null>;
  createSubmission(input: Partial<SupplierSubmission>): Promise<SupplierSubmission>;
  updateSubmission(id: string, patch: Partial<SupplierSubmission>): Promise<SupplierSubmission>;
  /** Chỉ đổi bản nháp/trả bổ sung; có thể yêu cầu đúng trạng thái đã đọc. */
  updateEditableSubmission(id: string, patch: Partial<SupplierSubmission>, expectedStatus?: "draft" | "returned"): Promise<SupplierSubmission | null>;
  listSubmissionItems(submissionId: string): Promise<SupplierSubmissionItem[]>;
  getSubmissionItem(id: string): Promise<SupplierSubmissionItem | null>;
  createSubmissionItem(input: Partial<SupplierSubmissionItem>): Promise<SupplierSubmissionItem>;
  updateSubmissionItem(id: string, patch: Partial<SupplierSubmissionItem>): Promise<SupplierSubmissionItem>;
  deleteSubmissionItem(id: string): Promise<void>;
  listSubmissionLinks(submissionId: string): Promise<SupplierSubmissionLink[]>;
  createSubmissionLink(input: Partial<SupplierSubmissionLink>): Promise<SupplierSubmissionLink>;
  updateSubmissionLink(id: string, patch: Partial<SupplierSubmissionLink>): Promise<SupplierSubmissionLink>;
  deleteSubmissionLink(id: string): Promise<void>;

  // Private buyer sourcing requests, independent from RFQs.
  listSourcingRequests(email?: string): Promise<SourcingRequest[]>;
  getSourcingRequest(id: string): Promise<SourcingRequest | null>;
  findSourcingSubmission(email: string, key: string): Promise<SourcingRequest | null>;
  createSourcingRequest(input: SourcingRequest): Promise<SourcingRequest>;
  updateSourcingRequest(id: string, version: number, patch: Pick<SourcingRequest, "status" | "assigned_to" | "internal_note" | "buyer_reply">): Promise<SourcingRequest | null>;
  countNewSourcingRequests(): Promise<number>;
  putSourcingFile(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  getSourcingFile(key: string): Promise<Uint8Array>;
  deleteSourcingFile(key: string): Promise<void>;

  // RFQs
  countPendingRfqs(): Promise<number>;
  /** RFQ đang chờ (vài cột để phân luồng), dùng đếm huy hiệu RFQ trực tiếp và Tìm nguồn riêng. */
  listPendingRfqRouting(): Promise<Pick<Rfq, "id" | "status" | "source_page" | "specs" | "preferred_supplier_ids" | "source_product_id">[]>;
  /** `codePrefix` and `sourcingRequestId` filter in the database, so a targeted lookup
   * never depends on the whole table fitting under the PostgREST row cap. */
  listRfqs(options?: { status?: string; assignedTo?: string | null; buyerId?: string;
    codePrefix?: string; sourcingRequestId?: string }): Promise<Rfq[]>;
  /** Exhaustive, paginated on Supabase; only new portal-direct RFQs need automatic recovery. */
  listRetryableDirectRfqs(): Promise<Rfq[]>;
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
  /** Caller truyền ID buyer đã lọc quyền; chỉ lấy lượt RFQ đã gửi và các trường an toàn cho CRM. */
  listBuyerRfqOutreach(buyerIds: string[]): Promise<BuyerRfqOutreach[]>;
  listRfqMatches(rfqId: string): Promise<RfqMatch[]>;
  /** Mọi lượt khớp của một NCC (cả trạng thái đề xuất), mới nhất trước. */
  listRfqMatchesBySupplier(supplierId: string): Promise<RfqMatch[]>;
  listSupplierRfqInvitations(supplierId: string): Promise<SupplierRfqInvitation[]>;
  listSupplierNoticeReads(supplierId: string): Promise<SupplierNoticeRead[]>;
  markSupplierNoticeRead(supplierId: string, noticeKey: string): Promise<void>;
  getRfqMatch(id: string): Promise<RfqMatch | null>;
  createRfqMatch(input: Partial<RfqMatch>): Promise<RfqMatch>;
  updateRfqMatch(id: string, patch: Partial<RfqMatch>): Promise<RfqMatch>;
  /** Conditional supplier edit: a staff publication/close in another tab cannot be overwritten. */
  updateRfqMatchIfState(id: string, supplierId: string, expectedStatus: RfqMatch["status"],
    expectedUpdatedAt: string, patch: Partial<RfqMatch>): Promise<RfqMatch | null>;
  deleteRfqMatch(id: string): Promise<void>;
  /** Atomic publication of exactly the reviewed draft revision, immutable snapshot + mail outbox. */
  publishRfqQuotes(rfqId: string, matchIds: string[], expectedUpdatedAt: Record<string, string>): Promise<RfqQuoteVersion[]>;
  listRfqQuoteVersions(matchIds: string[]): Promise<RfqQuoteVersion[]>;
  listRfqThreadMessages(matchId: string): Promise<RfqThreadMessage[]>;
  addRfqThreadMessage(input: Pick<RfqThreadMessage, "match_id" | "sender" | "sender_email" | "body">): Promise<RfqThreadMessage>;
  markRfqThreadRead(matchId: string, side: "buyer" | "supplier", at: string): Promise<void>;
  /** Audience-scoped sourcing correspondence: never use the direct buyer/supplier thread. */
  listRfqMediatedThreads(rfqIds: string[]): Promise<RfqMediatedThread[]>;
  listRfqMediatedMessages(threadId: string): Promise<RfqMediatedMessage[]>;
  postRfqMediatedMessage(input: { rfqId: string; matchId: string | null;
    sender: RfqMediatedMessage["sender"]; email: string; body: string }): Promise<RfqMediatedMessage>;
  markRfqMediatedRead(threadId: string, side: "party" | "staff", at: string): Promise<void>;
  listDueRfqMediatedAlerts(now: string, limit: number, threadIds?: string[]): Promise<RfqMediatedAlert[]>;
  claimRfqMediatedAlert(alert: RfqMediatedAlert, at: string): Promise<boolean>;
  finishRfqMediatedAlert(id: string, claimedAt: string,
    patch: Pick<RfqMediatedAlert, "status" | "not_before" | "last_error" | "sent_at">): Promise<boolean>;
  /** Supplier lead ratings are private: call only from supplier-portal code that checked
   * match ownership, or from staff CRM pages. Never from a buyer route. */
  getRfqLeadRating(matchId: string): Promise<RfqLeadRating | null>;
  saveRfqLeadRating(input: Pick<RfqLeadRating, "match_id" | "rfq_id" | "supplier_id" | "buyer_id" |
    "rating" | "reasons" | "note" | "rated_by_email">): Promise<RfqLeadRating>;
  listRfqLeadRatings(filter: { rfqId: string } | { buyerId: string }): Promise<RfqLeadRating[]>;
  /** Used only after the buyer's account ownership was checked; excludes private quote fields. */
  listRfqMatchUpdates(rfqIds: string[]): Promise<Pick<RfqMatch, "id" | "rfq_id" | "status" | "sent_to_supplier_at" | "sent_to_buyer_at" |
    "buyer_last_read_at" | "last_thread_message_at" | "last_thread_sender" | "last_supplier_message_at">[]>;
  listDueRfqPortalAlerts(now: string, limit: number, matchIds?: string[]): Promise<RfqPortalAlert[]>;
  claimRfqPortalAlert(alert: RfqPortalAlert, at: string): Promise<boolean>;
  finishRfqPortalAlert(id: string, claimedAt: string, patch: Pick<RfqPortalAlert, "status" | "not_before" | "last_error" | "sent_at">): Promise<boolean>;

  // Introductions (bảo vệ không vượt mặt)
  findIntroduction(buyerId: string, supplierId: string): Promise<Introduction | null>;
  createIntroduction(input: Partial<Introduction>): Promise<Introduction>;

  // Audit log
  /** Thời điểm các quyết định mở cổng hoặc yêu cầu NCC bổ sung hồ sơ. */
  listSupplierOnboardingDecisions(): Promise<Pick<AuditLogEntry, "entity_id" | "action" | "created_at">[]>;
  /** Lịch sử chạy nghiên cứu mùa vụ, dùng để luân phiên danh mục và tránh chạy kẹt ở một lỗi. */
  listHarvestResearchRuns(): Promise<Pick<AuditLogEntry, "entity_id" | "action" | "created_at">[]>;
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
