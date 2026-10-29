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
  categories: CategoryProposalOption[];
  policies: Record<string, QuantityPricingPolicy>;
  operations: ProductFormSessionOperations;
  /** Called after creation so an adapter can retain the product URL on refresh. */
  onSessionChange?: (state: ProductFormSessionState) => void;
  disabled?: boolean;
};

/** The same controller is usable by supplier and staff, with independently authorized actions. */
export function ProductFormSessionEditor({ initialDraft, initialProductId, initialRevision, initialImages,
  categories, policies, operations, onSessionChange, disabled = false }: Props) {
  const [value, setValue] = useState(initialDraft);
  const [state, setState] = useState<ProductFormSessionState>({ productId: initialProductId, revision: initialRevision,
    images: initialImages, busy: false, submitted: false, requiresReload: false });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const changeRef = useRef(onSessionChange);
  changeRef.current = onSessionChange;
  const sessionRef = useRef<ProductFormSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new ProductFormSession(operations,
    { productId: initialProductId, revision: initialRevision, value: initialDraft, images: initialImages },
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
  const locked = disabled || state.busy || state.submitted || state.requiresReload;
  const imageControls = <div className="space-y-3">
    {state.images.length > 0 && <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {state.images.map((image, index) => <li key={image.id} className="relative overflow-hidden rounded-lg border border-ink-200">
        <img src={image.url} alt={index === 0 ? "Ảnh chính" : `Ảnh sản phẩm ${index + 1}`} className="aspect-square w-full object-cover" />
        {index === 0 && <span className="absolute bottom-1 left-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-ink-800">Ảnh chính</span>}
      </li>)}
    </ul>}
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
