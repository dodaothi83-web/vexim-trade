import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ProductFormReviewDiffTable } from "@/components/products/product-form-review-diff-table";
import { supabaseStore } from "@/lib/db/supabase";
import { parseProductFormDraft } from "@/lib/products/product-form-model";
import { parseDraftImageSelection } from "@/lib/products/product-form-image-selection";
import { productFormReviewDiff } from "@/lib/products/product-form-review-diff";
import { shareableProductImages } from "@/lib/public/product-catalog";
import { requireProductFormReviewer } from "../reviewer-access";
import { ProductFormReviewControls } from "./review-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kiểm tra bản gửi sản phẩm" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProductFormReviewDetail({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const { db } = await requireProductFormReviewer();
  if (!UUID.test(submissionId)) notFound();
  const { data: submission, error } = await db.from("product_form_submissions")
    .select("id,product_id,supplier_id,status,payload,image_selection,image_snapshot,submitted_product_updated_at,warnings")
    .eq("id", submissionId).eq("status", "pending").maybeSingle();
  if (error) throw new Error("Không tải được bản gửi.");
  if (!submission || !UUID.test(submission.product_id) || !UUID.test(submission.supplier_id)) notFound();
  const product = await supabaseStore.getProduct(submission.product_id);
  if (!product || product.supplier_id !== submission.supplier_id) notFound();
  const draft = parseProductFormDraft(submission.payload);
  if (!draft) throw new Error("Dữ liệu bản gửi không hợp lệ.");

  // A previous form is a baseline only if linked to the currently approved
  // price revision. Legacy or mismatched records remain unknown, not empty.
  const { data: prices, error: priceError } = await db.from("product_quantity_price_revisions")
    .select("id").eq("product_id", product.id).eq("status", "approved").limit(2);
  if (priceError || !Array.isArray(prices) || prices.length > 1) throw new Error("Không xác nhận được giá đã duyệt.");
  const { data: names, error: nameError } = await db.from("product_english_name_revisions")
    .select("english_name").eq("product_id", product.id).eq("status", "approved").limit(2);
  if (nameError || !Array.isArray(names) || names.length > 1) throw new Error("Không xác nhận được tên đã duyệt.");
  const approvedEnglish = typeof names[0]?.english_name === "string" ? names[0].english_name : "";
  let baseline = null;
  if (prices.length === 1) {
    const { data: forms, error: baselineError } = await db.from("product_form_submissions").select("payload,supplier_id")
      .eq("product_id", product.id).eq("status", "approved").eq("approved_price_revision_id", prices[0].id).limit(2);
    if (baselineError || !Array.isArray(forms) || forms.length > 1) throw new Error("Không xác nhận được bản đã duyệt.");
    if (forms.length && forms[0].supplier_id === product.supplier_id) baseline = parseProductFormDraft(forms[0].payload);
  }
  const selection = parseDraftImageSelection(submission.image_selection);
  const snapshots = submission.image_snapshot;
  const validImages = !!selection?.length && Array.isArray(snapshots) && snapshots.length === selection.length && selection.every((ref, index) => {
    const entry = snapshots[index], row = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.row : null;
    return entry?.source === ref.source && row && typeof row === "object" && !Array.isArray(row) &&
      row.id === ref.id && row.product_id === product.id && row.supplier_id === product.supplier_id;
  });
  const publicMedia = await supabaseStore.listMedia("product", product.id);
  const oldPaths = shareableProductImages(publicMedia, product.id, product.featured_media_id, 8);
  const pendingTime = Date.parse(submission.submitted_product_updated_at), currentTime = Date.parse(product.updated_at);
  const changed = !Number.isFinite(pendingTime) || !Number.isFinite(currentTime) || pendingTime !== currentTime;
  return <>
    <PageHeader title="Kiểm tra bản gửi sản phẩm" sub={draft.name || "Sản phẩm chưa có tên"} />
    <Link href="/crm/products/form-review" className="text-sm font-semibold text-brand-700">Về danh sách bản gửi</Link>
    <div className="mt-4 space-y-5">
      {changed && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Sản phẩm đã thay đổi sau khi gửi. Hãy kiểm tra lại trước khi xử lý.</p>}
      <section className="rounded-xl border border-ink-200 bg-white p-5 text-sm">
        <h2 className="font-semibold text-ink-900">Tên đang công khai</h2>
        <p className="mt-2">Tên Việt: {product.name || "Chưa có"}</p>
        <p className="mt-1">Tên tiếng Anh hiện có: {product.name_i18n?.en || "Chưa xác định"}</p>
        {approvedEnglish && <p className="mt-1">Tên tiếng Anh trong revision đã duyệt: {approvedEnglish}</p>}
        <Link href={`/crm/products/${product.id}/edit`} className="mt-2 inline-block font-semibold text-brand-700 underline">Mở sản phẩm hiện tại</Link>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-ink-200 bg-white p-5"><h2 className="font-semibold">Ảnh đang công khai</h2>
          {oldPaths.length ? <div className="mt-3 flex flex-wrap gap-2">{oldPaths.map((path) => <img key={path} src={`/public-media/${path.split("/").map(encodeURIComponent).join("/")}`} alt="Ảnh đang công khai" className="size-24 rounded-lg object-cover" />)}</div> : <p className="mt-2 text-sm text-ink-500">Không có ảnh công khai.</p>}
        </section>
        <section className="rounded-xl border border-ink-200 bg-white p-5"><h2 className="font-semibold">Ảnh trong bản gửi</h2>
          {!validImages ? <p role="alert" className="mt-2 text-sm text-rose-700">Không xác nhận được danh sách ảnh. Hãy tải lại trang.</p> :
            <div className="mt-3 flex flex-wrap gap-2">{selection!.map((ref, index) => ref.source === "staged"
              ? <figure key={ref.id}><img src={`/api/product-form/images/${product.id}/${ref.id}`} alt={index === 0 ? "Ảnh chính trong bản gửi" : `Ảnh ${index + 1} trong bản gửi`} className="size-24 rounded-lg object-cover" />{index === 0 && <figcaption className="mt-1 text-xs">Ảnh chính</figcaption>}</figure>
              : <p key={ref.id} className="text-sm text-amber-800">Ảnh cũ cần được sao chụp riêng tư trước khi duyệt.</p>)}</div>}
        </section>
      </div>
      {Array.isArray(submission.warnings) && submission.warnings.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Bản gửi có cảnh báo giá cần đối chiếu với cấu hình hiện tại.</p>}
      <ProductFormReviewDiffTable rows={productFormReviewDiff(baseline, draft, { baselineConsentKnown: !!baseline })} />
      <ProductFormReviewControls productId={product.id} submissionId={submission.id} updatedAt={product.updated_at} />
    </div>
  </>;
}
