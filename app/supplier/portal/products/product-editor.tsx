"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Check, CheckCircle2, ChevronDown, FileText, LockKeyhole, Package2, Save, Send, UploadCloud, X } from "lucide-react";
import type { MediaAsset, SupplierProduct, Supplier } from "@/lib/types";
import { productPriceBlockers, supplierPriceConsentCurrent } from "@/lib/public/product-selection";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { PRODUCT_STATUS, privateMediaUrl, productCanSubmit, productReview } from "@/lib/supplier-portal/product-view";
import { saveSupplierProductAction, submitSupplierProductAction } from "../product-actions";
import { ProductAttributeInputs } from "@/components/product-attribute-inputs";
import { fieldsFor } from "@/lib/product-attributes";

type EditorProps = { product?: SupplierProduct; media?: MediaAsset[]; userId?: string; categories: CategoryProposalOption[]; supplier: Supplier };
const BASE_FIELDS = [
  ["moq", "Số lượng đặt tối thiểu (MOQ)", "Ví dụ: 1 container", 180],
  ["monthly_capacity", "Năng lực mỗi tháng", "Ví dụ: 200 tấn/tháng", 180], ["packaging", "Bao bì / đóng gói", "Ví dụ: túi hút chân không 25 kg", 300],
] as const;
const EXPORT_FIELDS = [
  ["certifications", "Chứng nhận sản phẩm (tự khai)", "Ví dụ: ISO 22000, HACCP", 300],
  ["export_port", "Cảng xuất", "Ví dụ: Cát Lái", 120],
  ["incoterm", "Incoterm", "Ví dụ: FOB", 20], ["incoterm_place", "Địa điểm Incoterm", "Ví dụ: Hồ Chí Minh", 100],
  ["payment_terms", "Điều kiện thanh toán", "Ví dụ: T/T, L/C", 200],
] as const;

export function SupplierProductEditor({ product, media = [], userId, categories, supplier }: EditorProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(product?.supplier_category_proposal ?? product?.reviewed_category_slug ?? "");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Where the latest result belongs: next to the Lưu button ("info") or in the review step ("review").
  const [resultAt, setResultAt] = useState<"info" | "review">("review");
  const [uploadResult, setUploadResult] = useState("");
  const [selected, setSelected] = useState<File[]>([]);
  const [progress, setProgress] = useState("");
  const review = product ? productReview(product) : "draft";
  const locked = review === "pending";
  const ownedCount = media.filter((m) => m.created_by === userId).length;
  const hasDetails = !!product && !!(product.spec?.trim() || product.description?.trim());
  const hasMedia = media.some((m) => (m.kind === "image" || m.kind === "catalogue") && !!m.storage_path);
  const canSubmit = !!product && productCanSubmit(product, media) && !dirty;
  const canUpload = !!product && !locked && review !== "approved" && !dirty;

  // Warn before leaving with unsaved edits: browser navigation/reload via
  // beforeunload, in-app <Link> clicks via a capture-phase click guard.
  // Same-page anchors (e.g. #product-media) and new-tab links are left alone.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm("Bạn có thay đổi chưa lưu. Rời trang sẽ mất nội dung đang nhập. Vẫn rời trang?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (product && review === "approved" && !window.confirm("Lưu thay đổi sẽ rút sản phẩm khỏi trạng thái sẵn sàng cho buyer và đưa về bản nháp để Vexim duyệt lại. Tiếp tục?")) return;
    setBusy(true); setResult(null);
    try {
      const form = new FormData(event.currentTarget);
      if (product) form.set("product_id", product.id);
      const response = await saveSupplierProductAction(form);
      setResult(response); setResultAt("info");
      if (response.ok) {
        setDirty(false);
        if (response.id && !product) router.push(`/supplier/portal/products/${response.id}`);
        else router.refresh();
      }
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ. Vui lòng thử lại." }); setResultAt("info"); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!product || !canSubmit) return;
    setBusy(true); setResult(null);
    try {
      const form = new FormData(); form.set("product_id", product.id);
      const response = await submitSupplierProductAction(form);
      setResult(response); setResultAt("review");
      if (response.ok) router.refresh();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ. Vui lòng thử lại." }); setResultAt("review"); }
    finally { setBusy(false); }
  }

  function uploadKind(file: File): "image" | "catalogue" | null {
    if (/\.pdf$/i.test(file.name)) return "catalogue";
    if (/\.(jpg|jpeg|png|webp)$/i.test(file.name)) return "image";
    return null;
  }
  function chooseFiles(files: File[]) {
    if (ownedCount + files.length > 12) { setUploadResult(`Chỉ được tải tối đa 12 tệp; hiện bạn đã có ${ownedCount} tệp.`); setSelected([]); return; }
    const invalid = files.find((file) => !uploadKind(file) || file.size > (uploadKind(file) === "catalogue" ? 15 : 8) * 1024 * 1024);
    if (invalid) { setUploadResult(`Tệp “${invalid.name}” không đúng định dạng hoặc quá dung lượng. Ảnh tối đa 8 MB, PDF tối đa 15 MB.`); setSelected([]); return; }
    setUploadResult(""); setSelected(files);
  }
  async function upload() {
    if (!product || !canUpload || !selected.length) return;
    setBusy(true); setUploadResult("");
    let uploaded = 0;
    try {
      for (let index = 0; index < selected.length; index++) {
        const file = selected[index];
        const kind = uploadKind(file);
        if (!kind) throw Error("Tệp không đúng định dạng.");
        setProgress(`Đang tải ${index + 1}/${selected.length}: ${file.name}`);
        const body = new FormData(); body.set("kind", kind); body.set("file", file);
        const response = await fetch(`/api/supplier-portal/products/${product.id}/media`, { method: "POST", body });
        const data = await response.json() as { ok: boolean; message: string };
        if (!response.ok || !data.ok) throw Error(data.message || "Không tải được tệp.");
        uploaded++;
      }
      setSelected([]);
      setUploadResult(`Đã tải ${uploaded} tệp nội bộ. Chỉ Vexim có thể chọn tệp chia sẻ buyer.`);
    } catch (error) {
      if (uploaded) setSelected(selected.slice(uploaded)); // Only retry files not already stored.
      setUploadResult(`${uploaded ? `Đã tải ${uploaded} tệp; chỉ còn tệp chưa hoàn tất trong danh sách chọn. ` : ""}${error instanceof Error ? error.message : "Không kết nối được máy chủ."}`);
    }
    finally { setProgress(""); setBusy(false); if (uploaded) router.refresh(); }
  }
  async function removeMedia(mediaId: string) {
    if (!product || dirty || !window.confirm("Xóa tệp nháp này?")) return;
    setBusy(true); setUploadResult("");
    try {
      const response = await fetch(`/api/supplier-portal/products/${product.id}/media?media_id=${encodeURIComponent(mediaId)}`, { method: "DELETE" });
      const data = await response.json() as { ok: boolean; message: string };
      setUploadResult(data.message); if (data.ok) router.refresh();
    } catch { setUploadResult("Không kết nối được máy chủ."); }
    finally { setBusy(false); }
  }

  return <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-8">
    <div className="min-w-0 space-y-6">
      <ol className="flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white p-3 shadow-sm lg:hidden" aria-label="Tiến độ tạo sản phẩm">
        {[
          ["#product-info", "01", "Thông tin", !!product],
          ["#product-media", "02", "Ảnh & catalogue", hasMedia],
          ["#product-review", "03", "Gửi duyệt", review === "pending" || review === "approved"],
        ].map(([href, number, label, done]) => (
          <li key={String(href)} className="min-w-0 flex-1">
            <a href={String(href)} className="flex items-center gap-2 text-xs font-semibold text-ink-700">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-500"}`}>{done ? <Check className="size-3.5" aria-hidden="true" /> : number}</span>
              <span className="truncate">{label}</span>
            </a>
          </li>
        ))}
      </ol>
      <section className={`rounded-xl border p-5 ${review === "changes_requested" ? "border-rose-200 bg-rose-50" : review === "approved" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`} aria-label="Trạng thái xét duyệt">
        <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/80"><Package2 className="size-5 text-brand-800" aria-hidden="true" /></span><div>
          <p className="text-xs font-bold uppercase tracking-wider text-ink-600">Trạng thái nội dung</p>
          <h2 className="mt-0.5 text-lg font-black text-ink-900">{PRODUCT_STATUS[review].label}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-700">{review === "approved" ? "Nội dung đã được Vexim duyệt. Nếu sửa, sản phẩm quay về bản nháp và tạm ngừng sẵn sàng chia sẻ buyer." : review === "pending" ? "Vexim đang kiểm tra. Bạn có thể xem thông tin nhưng chưa thể chỉnh sửa hoặc tải thêm tệp." : review === "changes_requested" ? "Xem phản hồi, chỉnh sửa, lưu lại rồi gửi Vexim kiểm tra lần nữa." : "Sản phẩm còn riêng tư. Lưu thông tin, thêm tệp thật rồi gửi Vexim duyệt."}</p>
        </div></div>
        {product?.supplier_review_note && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm font-semibold text-rose-800"><AlertCircle className="mr-1 inline size-4" aria-hidden="true" /> Vexim yêu cầu: {product.supplier_review_note}</p>}
        {product?.ready_for_buyer && review === "approved" && <p className="mt-3 text-xs font-semibold text-brand-900">Vexim đã bật sẵn sàng chia sẻ buyer; việc xuất hiện công khai còn tùy trang NCC và danh mục.</p>}
        {product && <p className="mt-3 text-xs font-semibold text-ink-600">Bản dịch tiếng Anh cho trang buyer: {product.name_i18n?.en?.trim() ? "đã có bản dịch do AI soạn và Vexim kiểm tra." : "Vexim sẽ dịch tự động bằng AI khi kiểm tra sản phẩm này."} Bạn cứ nhập nội dung bằng tiếng Việt, không cần tự dịch.</p>}
      </section>

      <form id="product-info" onSubmit={save} onChange={() => setDirty(true)} className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
        <div className="border-b border-ink-100 px-5 py-5 sm:px-7"><p className="text-xs font-bold uppercase tracking-widest text-brand-700">Bước 1 · Nội dung</p><h2 className="mt-1 text-xl font-black text-ink-900">Thông tin sản phẩm</h2><p className="mt-1 text-sm text-ink-600">Tên, mô tả và quy cách rõ ràng giúp Vexim kiểm tra nhanh hơn.</p></div>
        <div className="space-y-6 px-5 py-6 sm:px-7">
          <Field label="Tên sản phẩm" hint="Ví dụ: Hạt điều nhân trắng W320" required><input name="name" className="input" required maxLength={180} minLength={3} placeholder="Nhập tên mặt hàng của bạn" defaultValue={product?.name ?? ""} disabled={locked} /></Field>
          <Field label="Danh mục sản phẩm *" hint="Chỉ chọn trong danh mục kinh doanh của bạn do Vexim mở. Vexim kiểm tra sản phẩm trước khi công khai; chọn danh mục không tự duyệt.">
            <select name="supplier_category_proposal" className="input" required value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} disabled={locked || !categories.length}>
              <option value="" disabled>Chọn danh mục sản phẩm</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.group ? `${c.group} · ` : ""}{c.label}</option>)}
            </select>
          </Field>
          {!categories.length && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Bạn chưa chọn danh mục kinh doanh đang mở. <Link href="/supplier/portal/categories" className="font-semibold underline">Chọn danh mục trước khi thêm sản phẩm</Link></p>}
          <ProductAttributeInputs key={selectedCategory} fields={fieldsFor(categories.find((c) => c.slug === selectedCategory))} disabled={locked}
            values={product?.supplier_category_proposal === selectedCategory || product?.reviewed_category_slug === selectedCategory ? product?.specs ?? {} : {}} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Mô tả ngắn" hint="Tóm tắt vài câu bên cạnh ảnh sản phẩm"><textarea name="description" className="input min-h-32 resize-y" rows={4} maxLength={1500} placeholder="Giới thiệu ngắn gọn cho Vexim..." defaultValue={product?.description ?? ""} disabled={locked} /></Field>
            <Field label="Quy cách / tiêu chuẩn" hint="Ít nhất một trong hai ô mô tả hoặc quy cách để gửi duyệt"><textarea name="spec" className="input min-h-32 resize-y" rows={4} maxLength={800} placeholder="Ví dụ: Size W320, độ ẩm ≤ 5%, đóng gói 25 kg..." defaultValue={product?.spec ?? ""} disabled={locked} /></Field>
          </div>
          <Field label="Mô tả chi tiết" hint="Thông tin dài hiển thị bên dưới phần tổng quan của trang sản phẩm; không nhập số điện thoại, email hoặc HTML.">
            <textarea name="description_detail" className="input min-h-44 resize-y" rows={7} maxLength={6000} placeholder="Nguồn gốc, ứng dụng, đặc điểm, đóng gói, lưu ý..." defaultValue={product?.description_detail ?? ""} disabled={locked} />
          </Field>
          <div className="border-t border-ink-100 pt-6"><h3 className="text-sm font-bold text-ink-900">Đặt hàng & năng lực</h3><div className="mt-4 grid gap-4 sm:grid-cols-2">{BASE_FIELDS.map(([key, label, placeholder, max]) => <Field key={key} label={label}><input className="input" name={key} maxLength={max} placeholder={placeholder} defaultValue={String(product?.[key] ?? "")} disabled={locked} /></Field>)}</div></div>
          <details className="group rounded-xl border border-ink-200 bg-ink-50/70 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-ink-800">Thông tin thương mại & xuất khẩu <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden="true" /></summary>
            <p className="mt-2 text-xs text-ink-600">Tùy chọn; giá dưới đây là tham khảo tự khai, không phải báo giá RFQ hoặc giá đã được Vexim xác nhận.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">{EXPORT_FIELDS.map(([key, label, placeholder, max]) => <Field key={key} label={label}><input name={key} className="input" maxLength={max} placeholder={placeholder} defaultValue={String(product?.[key] ?? "")} disabled={locked} /></Field>)}
              <Field label="Thời gian giao hàng (ngày)"><input name="lead_time_days" type="number" min={0} max={3650} className="input" placeholder="Ví dụ: 21" defaultValue={product?.lead_time_days ?? ""} disabled={locked} /></Field>
              <Field label="Giá tham khảo từ"><input name="ref_price" type="number" min={0} max={999999999999} step="0.01" className="input" placeholder="Ví dụ: 5000" defaultValue={product?.ref_price ?? ""} disabled={locked} /></Field>
              <Field label="Giá tham khảo đến (tùy chọn)"><input name="ref_price_max" type="number" min={0} max={999999999999} step="0.01" className="input" placeholder="Ví dụ: 5500" defaultValue={product?.ref_price_max ?? ""} disabled={locked} /></Field>
              <Field label="Đơn vị tiền"><input name="currency" className="input" maxLength={10} placeholder="USD" defaultValue={product?.currency ?? ""} disabled={locked} /></Field>
              <Field label="Đơn vị giá"><input name="unit" className="input" maxLength={40} placeholder="Ví dụ: MT, kg, thùng" defaultValue={product?.unit ?? ""} disabled={locked} /></Field>
              <Field label="Giá có hiệu lực tới"><input name="price_valid_until" type="date" className="input" defaultValue={product?.price_valid_until ?? ""} disabled={locked} /></Field>
            </div>
            <p className="mt-3 text-xs text-ink-600">Ô “Chứng nhận sản phẩm (tự khai)” không tạo nhãn xác minh. <Link href="/supplier/portal#documents" className="font-semibold text-brand-800 underline">Tải PDF/ảnh chứng nhận ở mục Giấy tờ L1 để AI tự quét đơn vị đứng tên &amp; ngày hết hạn</Link></p>
            <div className="mt-4 rounded-xl border border-brand-200 bg-white p-4 text-sm text-ink-700">
              <label className="flex items-start gap-2 font-semibold"><input type="checkbox" name="price_publicly_visible" value="yes" defaultChecked={product?.price_publicly_visible ?? false} disabled={locked} className="mt-0.5 size-4 accent-brand-700" /> Cho phép công khai giá tham khảo của sản phẩm này khi đủ điều kiện</label>
              {product && <div className="mt-3 rounded-lg bg-ink-50 p-3 text-xs leading-5" role="status">
                <strong>Tình trạng giá đã lưu:</strong> {productPriceBlockers(product, supplier).length === 0 ? "Sản phẩm và NCC đã cho phép chia sẻ giá." : "Buyer vẫn thấy On request."}
                <ul className="mt-1 list-disc pl-5">{productPriceBlockers(product, supplier).map((reason) => <li key={reason}>{reason}</li>)}
                  {(review !== "approved" || !product.ready_for_buyer || supplier.status !== "published") && <li>Vexim còn phải duyệt sản phẩm, chọn danh mục/ảnh buyer và bật sẵn sàng, đồng thời công bố hồ sơ NCC.</li>}
                </ul>
                {dirty && <p className="mt-1 font-semibold text-amber-800">Thay đổi ở form chưa lưu; dòng trên là tình trạng trước khi lưu.</p>}
              </div>}
              <p className="mt-2 text-xs leading-5">{supplierPriceConsentCurrent(supplier) ? "NCC đã xác nhận chia sẻ giá trong 180 ngày gần đây. Không tự gia hạn khi lưu sản phẩm." : "Chưa có xác nhận chia sẻ giá còn hiệu lực của NCC. Tích xác nhận riêng bên dưới khi muốn công khai giá."} Giá phải lớn hơn 0, chưa hết hạn; ảnh/catalogue, danh mục và hồ sơ NCC phải được Vexim duyệt, xuất bản. Nếu không, buyer sẽ thấy On request.</p>
              {!supplierPriceConsentCurrent(supplier) && <label className="mt-3 flex items-start gap-2 rounded-lg bg-brand-50 p-3 text-xs font-medium text-brand-900"><input type="checkbox" name="confirm_supplier_price_consent" value="yes" disabled={locked} className="mt-0.5 size-4 shrink-0 accent-brand-700" /> Tôi đại diện NCC xác nhận đồng ý cho Vexim hiển thị công khai giá tham khảo của các sản phẩm tôi chọn công khai. Xác nhận có hiệu lực 180 ngày kể từ khi lưu; không phải báo giá chính thức. Chỉ ghi nhận khi tôi đồng thời chọn công khai giá cho sản phẩm này.</label>}
            </div>
            <div className="mt-5 flex flex-wrap gap-5 text-sm text-ink-700"><label className="inline-flex items-center gap-2"><input type="checkbox" name="oem" value="yes" defaultChecked={product?.oem ?? false} disabled={locked} className="size-4 accent-brand-700" /> Nhận gia công/OEM</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" name="odm" value="yes" defaultChecked={product?.odm ?? false} disabled={locked} className="size-4 accent-brand-700" /> Có dịch vụ thiết kế & sản xuất ODM</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" name="samples" value="yes" defaultChecked={product?.samples ?? false} disabled={locked} className="size-4 accent-brand-700" /> Có thể gửi mẫu</label></div>
          </details>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 bg-ink-50 px-5 py-4 sm:px-7">
          {!locked ? <button type="submit" disabled={busy} className="btn btn-primary"><Save className="size-4" aria-hidden="true" /> {busy ? "Đang lưu..." : product ? "Lưu thay đổi" : "Lưu và tiếp tục"}</button> : <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-900"><LockKeyhole className="size-4" aria-hidden="true" /> Tạm khóa khi Vexim kiểm tra</span>}
          {dirty && !locked && <span className="text-xs font-semibold text-amber-800">Có thay đổi chưa lưu</span>}
          {!product && <span className="text-xs text-ink-600">Tiếp theo: thêm ảnh hoặc catalogue</span>}
          {result && resultAt === "info" && <p role="status" className={`w-full rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-brand-50 text-brand-900" : "bg-rose-50 text-rose-800"}`}>{result.message}</p>}
        </div>
      </form>

      <section id="product-media" className="scroll-mt-6 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
        <div className="border-b border-ink-100 px-5 py-5 sm:px-7"><p className="text-xs font-bold uppercase tracking-widest text-brand-700">Bước 2 · Hình ảnh</p><h2 className="mt-1 text-xl font-black text-ink-900">Ảnh & catalogue thực tế</h2>
          <p className="mt-1 text-sm leading-6 text-ink-600">Tải ảnh JPG, PNG, WebP (tối đa 8 MB) hoặc catalogue PDF (tối đa 15 MB). Tệp chỉ dành cho Vexim kiểm tra, không tự xuất hiện trên trang buyer.</p></div>
        <div className="space-y-5 px-5 py-6 sm:px-7">
          {media.length > 0 && <ul className="grid gap-3 sm:grid-cols-2">{media.map((asset) => {
            const url = privateMediaUrl(asset);
            return <li key={asset.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 p-3">
              {asset.kind === "image" && url ? <img src={url} alt={`Ảnh ${asset.caption || product?.name || "sản phẩm"}`} loading="lazy" className="size-16 shrink-0 rounded-lg bg-white object-cover" />
                : <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700"><FileText className="size-7" aria-hidden="true" /></span>}
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{asset.caption || (asset.kind === "image" ? "Ảnh sản phẩm" : "Catalogue")}</p>
                <p className="text-xs text-ink-500">{asset.audience === "buyer" ? "Vexim đã chọn chia sẻ buyer" : "Tệp nội bộ · chưa chia sẻ"}</p>
                {url && <a href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700 underline">Xem tệp</a>}</div>
              {canUpload && asset.audience === "internal" && asset.created_by === userId && <button type="button" disabled={busy} onClick={() => void removeMedia(asset.id)} aria-label={`Xóa ${asset.caption || "tệp nháp"}`} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50"><X className="size-4" aria-hidden="true" /></button>}
            </li>;
          })}</ul>}
          {canUpload ? <>
            <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseFiles(Array.from(e.dataTransfer.files)); }}
              className="rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/40 p-6 text-center transition hover:border-brand-400 focus-within:border-brand-600 sm:p-8">
              <UploadCloud className="mx-auto size-9 text-brand-700" aria-hidden="true" /><p className="mt-2 text-sm font-semibold text-ink-800">Kéo thả ảnh hoặc catalogue vào đây</p>
              <p className="mt-1 text-xs text-ink-500">hoặc chọn tệp từ thiết bị · {ownedCount}/12 tệp của bạn</p>
              <label className="btn btn-soft relative mt-4 cursor-pointer">Chọn tệp
                <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" aria-label="Chọn ảnh sản phẩm hoặc catalogue" onChange={(e) => { chooseFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} /></label>
            </div>
            {selected.length > 0 && <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="text-sm font-semibold text-brand-900">Đã chọn {selected.length} tệp</p>
              <ul className="mt-2 max-h-28 space-y-1 overflow-auto text-xs text-brand-900">{selected.map((file, index) => <li key={`${file.name}-${index}`} className="truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</li>)}</ul>
              <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={upload} className="btn btn-primary"><UploadCloud className="size-4" aria-hidden="true" /> Tải {selected.length} tệp</button>
                <button type="button" disabled={busy} onClick={() => setSelected([])} className="btn btn-ghost">Bỏ chọn</button></div></div>}
          </> : <p className="rounded-xl bg-ink-50 p-4 text-sm text-ink-600">{!product ? "Lưu thông tin sản phẩm trước để mở chức năng tải tệp." : dirty ? "Lưu thay đổi nội dung trước khi tải tệp để không mất phần đang nhập." : review === "approved" ? "Sản phẩm đã duyệt. Nếu cần thêm tệp, hãy lưu thay đổi nội dung trước; sản phẩm sẽ quay lại bản nháp." : "Tạm khóa tải tệp khi Vexim đang kiểm tra."}</p>}
          {(progress || uploadResult) && <p role="status" className={`text-sm ${uploadResult && /không|quá|lỗi|tối đa/i.test(uploadResult) ? "text-rose-700" : "text-brand-800"}`}>{progress || uploadResult}</p>}
        </div>
      </section>

      <section id="product-review" className="scroll-mt-6 rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Bước 3 · Xét duyệt</p><h2 className="mt-1 text-xl font-black text-ink-900">Gửi Vexim kiểm tra</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">Cần tên, mô tả hoặc quy cách, và ít nhất một ảnh/catalogue đã tải. Nộp hồ sơ không tự duyệt nội dung, không tự chia sẻ buyer và không thay đổi trạng thái công khai trang NCC.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">{[
          [!!product, "Đã lưu sản phẩm"], [hasDetails, "Có mô tả/quy cách"], [hasMedia, "Có ảnh/catalogue"],
        ].map(([ready, label]) => <div key={String(label)} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold ${ready ? "bg-emerald-50 text-emerald-800" : "bg-ink-100 text-ink-600"}`}>
          {ready ? <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> : <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-ink-400 text-[10px]">○</span>}{label}</div>)}</div>
        {review === "pending" ? <p className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"><ClockIcon /> Đã gửi · đang chờ Vexim kiểm tra</p>
          : review === "approved" ? <p className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"><Check className="size-4" aria-hidden="true" /> Nội dung đã được Vexim duyệt</p>
          : <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={submit} disabled={busy || !canSubmit} className="btn btn-primary"><Send className="size-4" aria-hidden="true" /> {busy ? "Đang xử lý..." : "Gửi Vexim kiểm tra"}</button>
            {dirty && <p className="text-xs font-semibold text-amber-800">Lưu thay đổi ở bước 1 trước khi gửi.</p>}
            {!dirty && product && !canSubmit && <p className="text-xs text-ink-600">Hoàn thành các mục còn thiếu rồi thử lại.</p>}</div>}
        {result && resultAt === "review" && <p role="status" className={`mt-4 rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-brand-50 text-brand-900" : "bg-rose-50 text-rose-800"}`}>{result.message}</p>}
      </section>
      <Link href="/supplier/portal/products" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">Trở lại danh mục sản phẩm</Link>
    </div>
    <aside className="hidden space-y-4 lg:sticky lg:top-6 lg:block" aria-label="Tiến độ tạo sản phẩm">
      <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-brand-700">Tiến độ của bạn</p>
        <h2 className="mt-2 text-lg font-black text-ink-900">{product ? "Hoàn thiện gian hàng" : "Bắt đầu thật đơn giản"}</h2>
        <ol className="mt-5 space-y-4">{[
          ["#product-info", "01", "Thông tin sản phẩm", !!product],
          ["#product-media", "02", "Ảnh & catalogue", hasMedia],
          ["#product-review", "03", "Gửi Vexim duyệt", review === "pending" || review === "approved"],
        ].map(([href, number, label, done]) => <li key={String(href)}><a href={String(href)} className="group flex items-center gap-3 text-sm"><span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-500"}`}>{done ? <Check className="size-4" aria-hidden="true" /> : number}</span><span className="font-semibold text-ink-700 group-hover:text-brand-700">{label}</span><ArrowRight className="ml-auto size-3.5 text-ink-400" aria-hidden="true" /></a></li>)}</ol>
      </div>
      <div className="rounded-xl bg-ink-900 p-5 text-white"><LockKeyhole className="size-5 text-brand-300" aria-hidden="true" /><p className="mt-3 text-sm font-bold">Nội dung được kiểm soát</p><p className="mt-1 text-xs leading-5 text-ink-300">Ảnh của bạn ở chế độ nội bộ. Vexim quyết định nội dung, tệp chia sẻ buyer và điều kiện hiển thị công khai riêng biệt.</p></div>
    </aside>
  </div>;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold text-ink-800">{label}{required && " *"}</span>{children}{hint && <span className="mt-1 block text-xs leading-5 text-ink-500">{hint}</span>}</label>;
}
function ClockIcon() { return <span className="size-2.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />; }
