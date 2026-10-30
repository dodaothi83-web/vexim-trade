"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ProductFormFiveSections } from "@/components/products/product-form-five-sections";
import { ProductFormSession, type ProductFormImage, type ProductFormSessionOperations, type ProductFormSessionState } from "@/lib/products/product-form-session";
import { prepareProductFormImageTransport } from "@/lib/products/product-form-image-transport";
import type { ProductFormDraft, ProductFormIssue } from "@/lib/products/product-form-model";
import type { QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

type Props = {
  initialDraft: ProductFormDraft;
  initialProductId: string | null;
  initialRevision: number;
  initialImages: ProductFormImage[];
  initialAvailableImages?: ProductFormImage[];
  /** Read by the server for this supplier and product; reload after a review decision. */
  initialPending?: boolean;
  categories: CategoryProposalOption[];
  policies: Record<string, QuantityPricingPolicy>;
  operations: ProductFormSessionOperations;
  /** Called after creation so an adapter can retain the product URL on refresh. */
  onSessionChange?: (state: ProductFormSessionState) => void;
  disabled?: boolean;
};

/** The same controller is usable by supplier and staff, with independently authorized actions. */
export function ProductFormSessionEditor({ initialDraft, initialProductId, initialRevision, initialImages, initialAvailableImages, initialPending = false,
  categories, policies, operations, onSessionChange, disabled = false }: Props) {
  const [value, setValue] = useState(initialDraft);
  const [state, setState] = useState<ProductFormSessionState>({ productId: initialProductId, revision: initialRevision,
    images: initialImages, availableImages: initialAvailableImages ?? initialImages, busy: false, submitted: false, requiresReload: false });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [serverErrors, setServerErrors] = useState<ProductFormIssue[]>([]);
  const [preparingImages, setPreparingImages] = useState(false);
  const [nameTranslation, setNameTranslation] = useState<{ source: string; text: string } | null>(null);
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const translateName = operations.translateName;
  useEffect(() => {
    if (!translateName || disabled || state.submitted || state.requiresReload || name.length < 3 || name.length > 180) return;
    let current = true;
    setNameTranslation({ source: name, text: "AI đang dịch tên sản phẩm…" });
    // Wait until typing has paused; cancel/ignore every older request or result.
    const timer = setTimeout(() => {
      void translateName(name).then((result) => {
        if (!current) return;
        if (!result.ok) setNameTranslation({ source: name, text: result.message });
        else if (result.sourceName === name) setNameTranslation({ source: name,
          text: `Tên tiếng Anh AI dự kiến: ${result.englishName}. Vexim sẽ kiểm tra trước khi công bố.` });
        else setNameTranslation({ source: name, text: "Tên đã thay đổi; Vexim sẽ kiểm tra bản dịch khi duyệt." });
      }).catch(() => { if (current) setNameTranslation({ source: name, text: "Chưa dịch được tên. Vexim sẽ kiểm tra khi duyệt." }); });
    }, 2500);
    return () => { current = false; clearTimeout(timer); };
  }, [name, translateName, disabled, state.submitted, state.requiresReload]);
  const preparingRef = useRef(false);
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
    setServerErrors([]);
    const result = await session.submit(value);
    if (!result.ok) setServerErrors(result.errors ?? []);
    setMessage({ ok: result.ok, text: result.message });
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || preparingRef.current) return;
    if (files.length + state.images.length > 8) { setMessage({ ok: false, text: "Tối đa 8 ảnh sản phẩm." }); return; }
    preparingRef.current = true;
    setPreparingImages(true);
    setMessage(null);
    try {
      // Decode one at a time to limit peak memory on phones.
      const prepared: File[] = [];
      for (const file of files) prepared.push(await prepareProductFormImageTransport(file));
      const result = await session.upload(value, prepared);
      if (result.ok) setServerErrors([]);
      setMessage({ ok: result.ok, text: result.ok ? `Đã tải ${result.uploaded} ảnh.` : result.message });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Không xử lý được ảnh. Hãy thử lại." });
    } finally { preparingRef.current = false; setPreparingImages(false); }
  }
  async function selectImages(images: ProductFormImage[]) {
    setMessage(null);
    const result = await session.selectImages(value, images);
    if (result.ok) setServerErrors([]);
    setMessage({ ok: result.ok, text: result.ok ? "Đã lưu danh sách ảnh trong bản nháp." : result.message });
  }
  const locked = disabled || preparingImages || state.busy || state.submitted || state.requiresReload;
  const removedImages = state.availableImages.filter((available) => !state.images.some((image) => image.id === available.id && image.source === available.source));
  const imageControls = <div className="space-y-3">
    <ul className="flex flex-wrap gap-3">
      {state.images.map((image, index) => <li key={`${image.source}:${image.id}`} className="relative size-28 overflow-hidden rounded-lg border border-ink-200">
        <img src={image.url} alt={index === 0 ? "Ảnh chính" : `Ảnh sản phẩm ${index + 1}`} className="size-full object-cover" />
        <button type="button" disabled={locked} className="absolute right-1 top-1 grid size-10 place-items-center rounded-full bg-ink-900/75 text-white disabled:opacity-50"
          aria-label={`Gỡ ảnh ${index + 1} khỏi bản nháp`} onClick={() => void selectImages(state.images.filter((_, i) => i !== index))}>×</button>
        {index === 0 ? <span className="absolute bottom-1 left-1 rounded bg-ink-900/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">Ảnh chính</span> :
          <button type="button" disabled={locked} className="absolute bottom-1 left-1 min-h-8 rounded bg-white/95 px-1.5 text-[10px] font-semibold text-brand-700 disabled:opacity-50"
            aria-label={`Đặt ảnh ${index + 1} làm ảnh chính`} onClick={() => void selectImages([image, ...state.images.filter((_, i) => i !== index)])}>Làm ảnh chính</button>}
      </li>)}
      {state.images.length < 8 && <li><label className={`flex size-28 items-center justify-center rounded-lg border-2 border-dashed border-brand-700 text-sm font-semibold text-brand-700 ${locked ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-brand-50"}`}>
        + Thêm ảnh <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={locked} className="sr-only" onChange={(event) => void upload(event)} />
      </label></li>}
    </ul>
    {removedImages.length > 0 && <div className="space-y-2"><p className="text-xs text-ink-500">Ảnh có thể thêm vào bản nháp</p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">{removedImages.map((image) => <li key={`${image.source}:${image.id}`} className="overflow-hidden rounded-lg border border-ink-200">
        <img src={image.url} alt="Ảnh có thể thêm" className="aspect-square w-full object-cover opacity-70" />
        <button type="button" disabled={locked || state.images.length >= 8} className="min-h-10 px-1 text-xs font-semibold text-brand-700 disabled:opacity-50"
          onClick={() => void selectImages([...state.images, image])}>Thêm ảnh</button>
      </li>)}</ul></div>}
    <p className="text-xs text-ink-500">{state.images.length}/8 ảnh. JPG, PNG hoặc WebP, tối đa 8 MB mỗi ảnh.</p>
  </div>;
  const pending = initialPending || state.submitted;
  const dirty = session.isDirty(value);
  const statusText = state.requiresReload ? "Cần tải lại trang" : state.busy || preparingImages ? "Đang xử lý" : pending ?
    `Bản đã gửi đang chờ Vexim kiểm tra${dirty ? " · Có thay đổi chưa lưu" : ""}` : dirty ? "Có thay đổi chưa lưu" : "Đã lưu bản nháp";
  return <ProductFormFiveSections value={value} onChange={(next) => { setValue(next); setServerErrors([]); }} categories={categories} policies={policies}
    imageCount={state.images.length} coverUrl={state.images[0]?.url} imageControls={imageControls} serverErrors={serverErrors}
    onSave={() => void save()} onSubmit={() => void submit()} canSubmit={!pending} submitted={pending} feedback={message}
    disabled={disabled || state.submitted || state.requiresReload} busy={state.busy || preparingImages} statusText={statusText}
    nameTranslationStatus={nameTranslation?.source === name && name.length >= 3 ? nameTranslation.text : undefined} />;
}
