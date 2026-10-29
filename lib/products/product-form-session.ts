import type { ProductFormDraft } from "@/lib/products/product-form-model";

export type ProductFormImage = { id: string; url: string };
type Failure = { ok: false; message: string };
type DraftResult = Failure | { ok: true; id: string; revision: number };
type SubmitResult = Failure | { ok: true; message: string };
type UploadResult = (Failure & { requiresReload?: boolean }) | { ok: true; image: ProductFormImage };
export type ProductFormSessionOperations = {
  create: (requestId: string, value: ProductFormDraft) => Promise<DraftResult>;
  save: (id: string, revision: number, value: ProductFormDraft) => Promise<DraftResult>;
  submit: (id: string, revision: number) => Promise<SubmitResult>;
  upload: (id: string, image: File) => Promise<UploadResult>;
  newRequestId: () => string;
};
export type ProductFormSessionState = {
  productId: string | null;
  revision: number;
  images: ProductFormImage[];
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
  private pendingCreate: { requestId: string; value: ProductFormDraft; serialized: string } | null = null;

  constructor(
    private readonly operations: ProductFormSessionOperations,
    initial: { productId: string | null; revision: number; value: ProductFormDraft; images: ProductFormImage[] },
    private readonly onChange: (state: ProductFormSessionState) => void = () => {},
  ) {
    if (!Number.isSafeInteger(initial.revision) || initial.revision < 0 || (!initial.productId && initial.revision !== 0))
      throw new Error("Invalid initial product form session");
    this.state = { productId: initial.productId, revision: initial.revision, images: initial.images.map((image) => ({ ...image })), busy: false, submitted: false, requiresReload: false };
    this.saved = initial.revision > 0 ? JSON.stringify(initial.value) : null;
  }

  snapshot(): ProductFormSessionState { return { ...this.state, images: this.state.images.map((image) => ({ ...image })) }; }
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
        this.pendingCreate = { requestId: this.operations.newRequestId(), value: JSON.parse(serialized) as ProductFormDraft, serialized };
      }
      const pending = this.pendingCreate;
      const created = await this.operations.create(pending.requestId, pending.value);
      if (!created.ok) return created;
      if (!created.id || !Number.isSafeInteger(created.revision) || created.revision < 1)
        return { ok: false, message: "Không xác nhận được phiên bản bản nháp. Hãy tải lại trang." };
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
      const result = await this.operations.save(id, previous, JSON.parse(serialized) as ProductFormDraft);
      if (!result.ok) return result;
      if (result.id !== id || !Number.isSafeInteger(result.revision) || result.revision !== previous + 1)
        return { ok: false, message: "Phiên bản bản nháp không hợp lệ. Hãy tải lại trang." };
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
      const saved = await this.persist(value);
      if (!saved.ok) return saved;
      const result = await this.operations.submit(saved.id, saved.revision);
      if (result.ok) this.emit({ submitted: true });
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
        try { result = await this.operations.upload(saved.id, file); }
        catch {
          this.emit({ requiresReload: true });
          return { ok: false, message: "Không xác nhận được kết quả tải ảnh. Hãy tải lại trang trước khi thử lại." };
        }
        if (!result.ok) {
          if (result.requiresReload) this.emit({ requiresReload: true });
          return { ok: false, message: `${uploaded ? `Đã tải ${uploaded} ảnh. ` : ""}${result.message}` };
        }
        if (!result.image.id || !result.image.url || this.state.images.some((image) => image.id === result.image.id)) {
          this.emit({ requiresReload: true });
          return { ok: false, message: "Không xác nhận được ảnh vừa tải. Hãy tải lại trang." };
        }
        uploaded++;
        this.emit({ images: [...this.state.images, { ...result.image }] });
      }
      return { ok: true, uploaded };
    });
  }
}
