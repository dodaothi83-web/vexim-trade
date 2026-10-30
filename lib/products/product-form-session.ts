import type { ProductFormDraft, ProductFormIssue } from "@/lib/products/product-form-model";

export type ProductFormImage = { id: string; url: string; source: "media" | "staged" };
type Failure = { ok: false; message: string; requiresReload?: boolean; errors?: ProductFormIssue[]; rejectedBeforeCreate?: boolean };
type DraftResult = Failure | { ok: true; id: string; revision: number };
type SubmitResult = Failure | { ok: true; message: string };
type ImageResult = Failure | { ok: true; revision: number };
type UploadResult = Failure | { ok: true; image: ProductFormImage; revision: number };
type SnapshotResult = (Failure & { replaced?: number }) | { ok: true; revision: number; replaced: number; replacements: { mediaId: string; image: ProductFormImage }[] };
export type ProductFormSessionOperations = {
  create: (requestId: string, value: ProductFormDraft) => Promise<DraftResult>;
  save: (id: string, revision: number, value: ProductFormDraft) => Promise<DraftResult>;
  submit: (id: string, revision: number) => Promise<SubmitResult>;
  /** Optional gate checked before saving or copying images for a submission. */
  prepareSubmit?: () => Promise<Failure | { ok: true }>;
  upload: (id: string, revision: number, image: File) => Promise<UploadResult>;
  /** Copy selected legacy media privately before review, without changing the public listing. */
  snapshotImages?: (id: string, revision: number, imageIds: string[]) => Promise<SnapshotResult>;
  setImages: (id: string, revision: number, images: Array<Pick<ProductFormImage, "id" | "source">>) => Promise<ImageResult>;
  newRequestId: () => string;
  /** Optional transient suggestion; never included in a saved draft or approval. */
  translateName?: (sourceName: string) => Promise<{ ok: true; sourceName: string; englishName: string } | { ok: false; message: string }>;
};
export type ProductFormSessionState = {
  productId: string | null;
  revision: number;
  images: ProductFormImage[];
  /** Images removed in this session stay available for undo, without deleting files. */
  availableImages: ProductFormImage[];
  busy: boolean;
  submitted: boolean;
  requiresReload: boolean;
};

/**
 * Shared orchestration for NCC and staff adapters. Never touches a database
 * directly: the supplied server actions remain responsible for authorization.
 * Every upload uses an already-persisted private shell and every submission
 * refers to the exact saved revision. A lost creation response is retried with
 * the same request ID AND original payload, even if the user has since edited.
 */
export class ProductFormSession {
  private state: ProductFormSessionState;
  private saved: string | null;
  private pendingCreate: { requestId: string; value: ProductFormDraft; serialized: string; uncertain: boolean } | null = null;

  constructor(
    private readonly operations: ProductFormSessionOperations,
    initial: { productId: string | null; revision: number; value: ProductFormDraft; images: ProductFormImage[]; availableImages?: ProductFormImage[] },
    private readonly onChange: (state: ProductFormSessionState) => void = () => {},
  ) {
    if (!Number.isSafeInteger(initial.revision) || initial.revision < 0 || (!initial.productId && initial.revision !== 0))
      throw new Error("Invalid initial product form session");
    const available = initial.availableImages ?? initial.images;
    if (initial.images.some((image) => !available.some((item) => item.id === image.id && item.source === image.source)))
      throw new Error("Selected image missing from available images");
    this.state = { productId: initial.productId, revision: initial.revision, images: initial.images.map((image) => ({ ...image })),
      availableImages: available.map((image) => ({ ...image })), busy: false, submitted: false, requiresReload: false };
    this.saved = initial.revision > 0 ? JSON.stringify(initial.value) : null;
  }

  snapshot(): ProductFormSessionState { return { ...this.state, images: this.state.images.map((image) => ({ ...image })),
    availableImages: this.state.availableImages.map((image) => ({ ...image })) }; }
  isDirty(value: ProductFormDraft): boolean { return this.saved === null || this.saved !== JSON.stringify(value); }
  private emit(patch: Partial<ProductFormSessionState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.snapshot());
  }

  private async persist(value: ProductFormDraft): Promise<Failure | { ok: true; id: string; revision: number }> {
    const serialized = JSON.stringify(value);
    if (!this.state.productId) {
      if (!this.pendingCreate) {
        // A detached copy protects the idempotency payload from client mutations.
        this.pendingCreate = { requestId: this.operations.newRequestId(), value: JSON.parse(serialized) as ProductFormDraft, serialized, uncertain: false };
      }
      const pending = this.pendingCreate;
      let created: DraftResult;
      try { created = await this.operations.create(pending.requestId, pending.value); }
      catch (error) { pending.uncertain = true; throw error; }
      if (!created || (created.ok !== true && created.ok !== false)) {
        pending.uncertain = true;
        this.emit({ requiresReload: true });
        return { ok: false, requiresReload: true, message: "Không xác nhận được kết quả tạo. Hãy tải lại trang và kiểm tra danh sách sản phẩm." };
      }
      if (!created.ok) {
        // A rejection proves only this attempt did not reach the RPC. An
        // earlier response may have been lost after creating the product.
        if (created.rejectedBeforeCreate === true && !pending.uncertain) this.pendingCreate = null;
        else if (created.rejectedBeforeCreate === true) {
          this.emit({ requiresReload: true });
          return { ok: false, requiresReload: true, message: "Không xác nhận được kết quả tạo trước đó. Hãy tải lại trang và kiểm tra danh sách sản phẩm." };
        } else pending.uncertain = true;
        return created;
      }
      if (!created.id || !Number.isSafeInteger(created.revision) || created.revision < 1) {
        pending.uncertain = true;
        this.emit({ requiresReload: true });
        return { ok: false, requiresReload: true, message: "Không xác nhận được phiên bản bản nháp. Hãy tải lại trang và kiểm tra danh sách sản phẩm." };
      }
      // A retry may return a later revision after another session edited it;
      // never assume the original creation payload is still the saved content.
      if (created.revision !== 1) {
        this.emit({ productId: created.id, revision: created.revision, requiresReload: true });
        return { ok: false, message: "Bản nháp đã thay đổi ở phiên khác. Hãy tải lại trang." };
      }
      this.saved = pending.serialized;
      this.pendingCreate = null;
      this.emit({ productId: created.id, revision: created.revision });
    }
    const id = this.state.productId!;
    if (this.saved !== serialized) {
      const previous = this.state.revision;
      let result: DraftResult;
      try { result = await this.operations.save(id, previous, JSON.parse(serialized) as ProductFormDraft); }
      catch {
        this.emit({ requiresReload: true });
        return { ok: false, message: "Không xác nhận được kết quả lưu. Hãy tải lại trang." };
      }
      if (!result.ok) {
        if (result.requiresReload) this.emit({ requiresReload: true });
        return result;
      }
      if (result.id !== id || !Number.isSafeInteger(result.revision) || result.revision !== previous + 1) {
        this.emit({ requiresReload: true });
        return { ok: false, message: "Phiên bản bản nháp không hợp lệ. Hãy tải lại trang." };
      }
      this.saved = serialized;
      this.emit({ revision: result.revision });
    }
    return { ok: true, id, revision: this.state.revision };
  }

  private async run<T extends Failure | { ok: true }>(operation: () => Promise<T>): Promise<T | Failure> {
    if (this.state.requiresReload) return { ok: false, message: "Hãy tải lại trang để kiểm tra dữ liệu trước khi tiếp tục." };
    if (this.state.busy || this.state.submitted) return { ok: false, message: "Sản phẩm đang được xử lý hoặc đã gửi duyệt." };
    this.emit({ busy: true });
    try { return await operation(); }
    catch { return { ok: false, message: "Không kết nối được máy chủ. Vui lòng thử lại." }; }
    finally { this.emit({ busy: false }); }
  }

  async save(value: ProductFormDraft): Promise<DraftResult> {
    return this.run(() => this.persist(value));
  }

  async submit(value: ProductFormDraft): Promise<SubmitResult> {
    return this.run(async () => {
      if (this.operations.prepareSubmit) {
        const gate = await this.operations.prepareSubmit();
        if (!gate || gate.ok !== true) return gate?.ok === false ? gate : { ok: false, message: "Không xác nhận được trạng thái gửi duyệt." };
      }
      const saved = await this.persist(value);
      if (!saved.ok) return saved;
      const legacyIds = this.state.images.filter((image) => image.source === "media").map((image) => image.id);
      if (legacyIds.length) {
        if (!this.operations.snapshotImages) return { ok: false, message: "Chưa thể xử lý ảnh đã có để gửi duyệt." };
        const previous = this.state.revision;
        let snapshot: SnapshotResult;
        try { snapshot = await this.operations.snapshotImages(saved.id, previous, legacyIds); }
        catch {
          this.emit({ requiresReload: true });
          return { ok: false, message: "Không xác nhận được kết quả xử lý ảnh. Hãy tải lại trang." };
        }
        if (!snapshot || typeof snapshot !== "object" || (snapshot.ok !== true && snapshot.ok !== false)) {
          this.emit({ requiresReload: true });
          return { ok: false, message: "Không xác nhận được kết quả xử lý ảnh. Hãy tải lại trang." };
        }
        if (!snapshot.ok) {
          if (snapshot.requiresReload || (snapshot.replaced ?? 0) > 0) this.emit({ requiresReload: true });
          return snapshot;
        }
        if (!Array.isArray(snapshot.replacements) || snapshot.replacements.some((row) => !row || typeof row.mediaId !== "string" ||
            !row.image || typeof row.image.id !== "string" || typeof row.image.url !== "string")) {
          this.emit({ requiresReload: true });
          return { ok: false, message: "Không xác nhận được phiên bản ảnh. Hãy tải lại trang." };
        }
        const mappings = new Map(snapshot.replacements.map(({ mediaId, image }) => [mediaId.toLowerCase(), image]));
        const ids = new Set(this.state.availableImages.map((image) => image.id.toLowerCase()));
        if (snapshot.revision !== previous + legacyIds.length || snapshot.replaced !== legacyIds.length ||
            mappings.size !== legacyIds.length || snapshot.replacements.length !== legacyIds.length ||
            legacyIds.some((id) => !mappings.has(id.toLowerCase())) || snapshot.replacements.some(({ image }) => {
              const id = image.id.toLowerCase();
              if (!id || !image.url || image.source !== "staged" || ids.has(id)) return true;
              ids.add(id); return false;
            })) {
          this.emit({ requiresReload: true });
          return { ok: false, message: "Không xác nhận được phiên bản ảnh. Hãy tải lại trang." };
        }
        const replacements = snapshot.replacements.map(({ image }) => ({ ...image }));
        this.emit({ revision: snapshot.revision,
          images: this.state.images.map((image) => image.source === "media" ? { ...mappings.get(image.id.toLowerCase())! } : { ...image }),
          availableImages: [...this.state.availableImages, ...replacements] });
      }
      let result: SubmitResult;
      try { result = await this.operations.submit(saved.id, this.state.revision); }
      catch {
        this.emit({ requiresReload: true });
        return { ok: false, message: "Không xác nhận được kết quả gửi. Hãy tải lại trang để kiểm tra." };
      }
      if (result.ok) this.emit({ submitted: true });
      else if (result.requiresReload) this.emit({ requiresReload: true });
      return result;
    });
  }

  /** Remove or reorder only the private draft selection, never the public files. */
  async selectImages(value: ProductFormDraft, images: ProductFormImage[]): Promise<ImageResult> {
    return this.run(async () => {
      if (images.length > 8 || images.some((image) => !this.state.availableImages.some((current) => current.id === image.id && current.source === image.source)) ||
          new Set(images.map((image) => image.id.toLowerCase())).size !== images.length)
        return { ok: false, message: "Danh sách ảnh không hợp lệ." };
      const saved = await this.persist(value);
      if (!saved.ok) return saved;
      const previous = this.state.revision;
      const refs = images.map(({ id, source }) => ({ id, source }));
      let result: ImageResult;
      try { result = await this.operations.setImages(saved.id, previous, refs); }
      catch {
        this.emit({ requiresReload: true });
        return { ok: false, message: "Không xác nhận được danh sách ảnh. Hãy tải lại trang." };
      }
      if (!result.ok) {
        if (result.requiresReload) this.emit({ requiresReload: true });
        return result;
      }
      const unchanged = JSON.stringify(refs) === JSON.stringify(this.state.images.map(({ id, source }) => ({ id, source })));
      if (result.revision !== previous + (unchanged ? 0 : 1)) {
        this.emit({ requiresReload: true });
        return { ok: false, message: "Không xác nhận được phiên bản ảnh. Hãy tải lại trang." };
      }
      this.emit({ revision: result.revision, images: images.map((image) => ({ ...this.state.availableImages.find((current) =>
        current.id === image.id && current.source === image.source)! })) });
      return result;
    });
  }

  async upload(value: ProductFormDraft, files: File[]): Promise<Failure | { ok: true; uploaded: number }> {
    return this.run(async () => {
      if (!files.length) return { ok: false, message: "Chọn ảnh trước khi tải." };
      if (this.state.images.length + files.length > 8) return { ok: false, message: "Tối đa 8 ảnh sản phẩm." };
      if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024))
        return { ok: false, message: "Chọn ảnh JPG, PNG hoặc WebP, tối đa 8 MB mỗi ảnh." };
      const saved = await this.persist(value);
      if (!saved.ok) return saved;
      let uploaded = 0;
      for (const file of files) {
        let result: UploadResult;
        const previous = this.state.revision;
        try { result = await this.operations.upload(saved.id, previous, file); }
        catch {
          this.emit({ requiresReload: true });
          return { ok: false, message: "Không xác nhận được kết quả tải ảnh. Hãy tải lại trang trước khi thử lại." };
        }
        if (!result.ok) {
          if (result.requiresReload) this.emit({ requiresReload: true });
          return { ok: false, message: `${uploaded ? `Đã tải ${uploaded} ảnh. ` : ""}${result.message}` };
        }
        if (!result.image.id || !result.image.url || result.image.source !== "staged" || result.revision !== previous + 1 ||
            this.state.availableImages.some((image) => image.id === result.image.id && image.source === result.image.source)) {
          this.emit({ requiresReload: true });
          return { ok: false, message: "Không xác nhận được ảnh vừa tải. Hãy tải lại trang." };
        }
        uploaded++;
        this.emit({ revision: result.revision, images: [...this.state.images, { ...result.image }],
          availableImages: [...this.state.availableImages, { ...result.image }] });
      }
      return { ok: true, uploaded };
    });
  }
}
