"use server";

import { getSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { parseProductFormDraft } from "@/lib/products/product-form-model";
import { nameContainsGrade } from "@/lib/products/quantity-pricing";
import { suggestProductFormTranslation } from "@/lib/products/product-form-translation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { ok: false; message: string } |
  { ok: true; submissionId: string; sourceName: string; englishName: string; nameNeedsEdit: boolean };

/** Suggest a name for exactly one pending submission, without publishing or saving it. */
export async function suggestProductFormEnglishNameAction(productId: string, submissionId: string): Promise<Result> {
  if (!UUID.test(productId) || !UUID.test(submissionId)) return { ok: false, message: "Bản gửi không hợp lệ." };
  try {
    const session = await getSession();
    if (!session || !["admin", "reviewer"].includes(session.role)) return { ok: false, message: "Không có quyền xét duyệt." };
    const db = getSupabaseClient();
    if (!db) return { ok: false, message: "Không kết nối được cơ sở dữ liệu." };
    const activeActor = async () => {
      const actor = await supabaseStore.getUser(session.uid);
      return !!actor?.is_active && actor.role === session.role && UUID.test(actor.id) && actor.email.trim().toLowerCase() === session.email.trim().toLowerCase();
    };
    if (!await activeActor()) return { ok: false, message: "Không xác nhận được quyền xét duyệt." };
    const product = await supabaseStore.getProduct(productId);
    if (!product) return { ok: false, message: "Không tìm thấy sản phẩm." };
    const load = async () => db.from("product_form_submissions").select("id,product_id,supplier_id,status,payload")
      .eq("id", submissionId).eq("product_id", productId).eq("supplier_id", product.supplier_id).maybeSingle();
    const { data: before, error } = await load();
    const draft = before?.status === "pending" ? parseProductFormDraft(before.payload) : null;
    if (error || !draft) return { ok: false, message: "Bản gửi không còn chờ duyệt. Hãy tải lại trang." };
    const category = await supabaseStore.getCategoryBySlug(draft.category);
    if (!category || category.status !== "published" || !category.is_published)
      return { ok: false, message: "Danh mục không còn hợp lệ. Hãy kiểm tra lại bản gửi." };
    const suggestion = await suggestProductFormTranslation(draft, standardGradesForCategory(category));
    if (!suggestion.ok) return { ok: false, message: suggestion.reason === "unconfigured"
      ? "Chưa cấu hình dịch tự động. Anh có thể nhập tên tiếng Anh khi duyệt."
      : "Không tạo được bản dịch. Hãy kiểm tra và thử lại." };
    // An AI call can take time. Never present a result for a decision that has
    // already changed, a disabled reviewer, or an altered submission/category.
    const [afterResult, currentCategory, currentProduct, stillAuthorized] = await Promise.all([
      load(), supabaseStore.getCategoryBySlug(draft.category), supabaseStore.getProduct(productId), activeActor(),
    ]);
    const after = afterResult.data?.status === "pending" ? parseProductFormDraft(afterResult.data.payload) : null;
    if (afterResult.error || !after || JSON.stringify(after) !== JSON.stringify(draft) || !stillAuthorized ||
        !currentProduct || currentProduct.supplier_id !== product.supplier_id || !currentCategory || currentCategory.id !== category.id || currentCategory.status !== "published" || !currentCategory.is_published)
      return { ok: false, message: "Bản gửi hoặc quyền xét duyệt đã thay đổi. Hãy tải lại trang." };
    const englishName = suggestion.translation.name.trim();
    return { ok: true, submissionId, sourceName: draft.name, englishName,
      nameNeedsEdit: nameContainsGrade(englishName, [...standardGradesForCategory(currentCategory), draft.grade]) };
  } catch (error) {
    console.error("[product-form] translate for review", error);
    return { ok: false, message: "Không tạo được bản dịch. Hãy kiểm tra và thử lại." };
  }
}
