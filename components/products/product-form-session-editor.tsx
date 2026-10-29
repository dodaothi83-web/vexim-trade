"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ProductFormFiveSections } from "@/components/products/product-form-five-sections";
import { ProductFormSession, type ProductFormImage, type ProductFormSessionOperations, type ProductFormSessionState } from "@/lib/products/product-form-session";
import type { ProductFormDraft } from "@/lib/products/product-form-model";
import type { QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

type Props = {
  initialDraft: ProductFormDraft;
  initialProductId: string | null;
  initialRevision: number;
  initialImages: ProductFormImage[];
  initialAvailableImages?: ProductFormImage[];
  categories: CategoryProposalOption[];
  policies: Record<string, QuantityPricingPolicy>;
  operations: ProductFormSessionOperations;
  /** Called after creation so an adapter can retain the product URL on refresh. */
  onSessionChange?: (state: ProductFormSessionState) => void;
  disabled?: boolean;
};

/** The same controller is usable by supplier and staff, with independently authorized actions. */
export function ProductFormSessionEditor({ initialDraft, initialProductId, initialRevision, initialImages, initialAvailableImages,
  categories, policies, operations, onSessionChange, disabled = false }: Props) {
  const [value, setValue] = useState(initialDraft);
  const [state, setState] = useState<ProductFormSessionState>({ productId: initialProductId, revision: initialRevision,
    images: initialImages, availableImages: initialAvailableImages ?? initialImages, busy: false, submitted: false, requiresReload: false });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const changeRef = useRef(onSessionChange);
  changeRef.current = onSessionChange;
  const sessionRef = useRef<ProductFormSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new ProductFormSession(operations,
    { productId: initialProductId, revision: initialRevision, value: initialDraft, images: initialImages, availableImages: initialAvailableImages },
    (next) => { setState(next); changeRef.current?.(next); });
  const session = sessionRef.current;

  async function save() {
    setMessage(null);
    const result = await session.save(value);
    setMessage({ ok: result.ok, text: result.ok ? "Đã lưu bản nháp." : result.message });
  }
  async function submit() {
    setMessage(null);
    const result = await session.submit(value);
    setMessage({ ok: result.ok, text: result.message });
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setMessage(null);
    const result = await session.upload(value, files);
    setMessage({ ok: result.ok, text: result.ok ? `Đã tải ${result.uploaded} ảnh.` : result.message });
  }
  async function selectImages(images: ProductFormImage[]) {
    setMessage(null);
    const result = await session.selectImages(value, images);
    setMessage({ ok: result.ok, text: result.ok ? "Đã lưu danh sách ảnh trong bản nháp." : result.message });
  }
  const locked = disabled || state.busy || state.submitted || state.requiresReload;
  const removedImages = state.availableImages.filter((available) => !state.images.some((image) => image.id === available.id && image.source === available.source));
  const imageControls = <div className="space-y-3">
    {state.images.length > 0 && <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {state.images.map((image, index) => <li key={`${image.source}:${image.id}`} className="overflow-hidden rounded-lg border border-ink-200">
        <div className="relative"><img src={image.url} alt={index === 0 ? "Ảnh chính" : `Ảnh sản phẩm ${index + 1}`} className="aspect-square w-full object-cover" />
          {index === 0 && <span className="absolute bottom-1 left-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-ink-800">Ảnh chính</span>}</div>
        <div className="flex flex-wrap items-center gap-x-2 px-1 text-xs font-semibold">
          {index > 0 && <button type="button" disabled={locked} className="min-h-10 text-brand-700 disabled:opacity-50" aria-label={`Đặt ảnh ${index + 1} làm ảnh chính`}
            onClick={() => void selectImages([image, ...state.images.filter((_, i) => i !== index)])}>Ảnh chính</button>}
          <button type="button" disabled={locked} className="min-h-10 text-rose-700 disabled:opacity-50" aria-label={`Gỡ ảnh ${index + 1} khỏi bản nháp`}
            onClick={() => void selectImages(state.images.filter((_, i) => i !== index))}>Gỡ</button>
        </div>
      </li>)}
    </ul>}
    {removedImages.length > 0 && <div className="space-y-2"><p className="text-xs text-ink-500">Ảnh có thể thêm vào bản nháp</p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">{removedImages.map((image) => <li key={`${image.source}:${image.id}`} className="overflow-hidden rounded-lg border border-ink-200">
        <img src={image.url} alt="Ảnh có thể thêm" className="aspect-square w-full object-cover opacity-70" />
        <button type="button" disabled={locked || state.images.length >= 8} className="min-h-10 px-1 text-xs font-semibold text-brand-700 disabled:opacity-50"
          onClick={() => void selectImages([...state.images, image])}>Thêm ảnh</button>
      </li>)}</ul></div>}
    <label className={`inline-flex cursor-pointer items-center rounded-lg border border-ink-300 px-3 py-2 text-sm font-semibold text-ink-800 ${locked ? "pointer-events-none opacity-50" : "hover:bg-ink-50"}`}>
      Chọn ảnh <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={locked} className="sr-only" onChange={(event) => void upload(event)} />
    </label>
    <p className="text-xs text-ink-500">{state.images.length}/8 ảnh. JPG, PNG hoặc WebP, tối đa 8 MB mỗi ảnh.</p>
  </div>;
  const statusText = state.requiresReload ? "Cần tải lại trang" : state.submitted ? "Đã gửi duyệt" : state.busy ? "Đang xử lý" : session.isDirty(value) ? "Có thay đổi chưa lưu" : "Đã lưu bản nháp";
  return <div className="space-y-3">
    {message && <p role={message.ok ? "status" : "alert"} className={`rounded-lg border px-3 py-2 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>{message.text}</p>}
    <ProductFormFiveSections value={value} onChange={setValue} categories={categories} policies={policies}
      imageCount={state.images.length} coverUrl={state.images[0]?.url} imageControls={imageControls}
      onSave={() => void save()} onSubmit={() => void submit()} disabled={disabled || state.submitted || state.requiresReload} busy={state.busy} statusText={statusText} />
  </div>;
}
