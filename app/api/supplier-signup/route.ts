import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { getSupabaseAuthClient, getSupabaseClient } from "@/lib/db/supabase";
import { getSession } from "@/lib/auth/session";
import { passwordProblem } from "@/lib/auth/password";
import { rateLimit } from "@/lib/rfq/rate-limit";
import { deleteObject } from "@/lib/media/storage";
import { MAX_INITIAL_FILES, saveDocumentEvidence, validateInitialDocument } from "@/lib/supplier-portal/evidence";
import { INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";
import { notifySupplierRegistration } from "@/lib/supplier-portal/notify";
import { L1_DOC_ITEMS, type SupplierInput } from "@/lib/types";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const text = (form: FormData, key: string, limit = 200) => String(form.get(key) ?? "").trim().slice(0, limit);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Signup uses Supabase email confirmation. No local/offline self-registration or automatic approval. */
export async function POST(request: Request) {
  if (await getSession()) return fail("Vui lòng đăng xuất trước khi đăng ký tài khoản mới.", 409);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`supplier-register:${ip}`, { windowMs: 60 * 60 * 1000, max: 3 }).ok) return fail("Đã gửi quá nhiều lần. Vui lòng thử lại sau.", 429);
  if (Number(request.headers.get("content-length") ?? 0) > 78 * 1024 * 1024) return fail("Tệp tải lên quá lớn.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Không đọc được biểu mẫu."); }
  if (text(form, "website_hp")) return fail("Không thể gửi yêu cầu này.");
  if (text(form, "consent") !== "yes") return fail("Vui lòng xác nhận đồng ý gửi hồ sơ cho Vexim kiểm tra.");

  const name = text(form, "name", 180);
  const contact = text(form, "contact_name", 120);
  const email = text(form, "email", 200).toLowerCase();
  const password = String(form.get("password") ?? "");
  const tax = text(form, "tax_number", 32);
  const bank = text(form, "bank_account_number", 34);
  const supplierType = text(form, "supplier_type");
  if (name.length < 3 || !contact || !EMAIL.test(email) || !text(form, "phone", 40) || !text(form, "products", 1000)) {
    return fail("Cần tên doanh nghiệp, người liên hệ, email, điện thoại và mặt hàng chính.");
  }
  if (!(["manufacturer", "trading", "cooperative"] as string[]).includes(supplierType)) return fail("Chọn loại hình doanh nghiệp hợp lệ.");
  if (passwordProblem(password) || password.length > 128) return fail("Mật khẩu cần 8–128 ký tự, gồm cả chữ và số.");
  if (!/^[0-9]{1,32}$/.test(tax)) return fail("Cần mã số thuế dạng chữ số để Vexim đối chiếu.");
  if (!/^[0-9]{1,34}$/.test(bank)) return fail("Cần số tài khoản dạng chữ số để Vexim đối chiếu.");

  const documents: { key: typeof INITIAL_DOCUMENT_KEYS[number]; file: File; prepared: Awaited<ReturnType<typeof validateInitialDocument>> }[] = [];
  try {
    for (const key of INITIAL_DOCUMENT_KEYS) {
      for (const value of form.getAll(`doc:${key}`)) {
        if (!(value instanceof File) || !value.size) continue;
        if (documents.length >= MAX_INITIAL_FILES) return fail(`Chỉ nhận tối đa ${MAX_INITIAL_FILES} giấy tờ ở bước đầu.`);
        documents.push({ key, file: value, prepared: await validateInitialDocument(value, key) });
      }
    }
  } catch (error) { return fail(error instanceof Error ? error.message : "Tệp không hợp lệ."); }
  const requested = ([2, 3] as const).filter((level) => form.get(`request:${level}`) === "yes");

  // Fail before creating an Auth account if the DB migration or service-role connection is missing.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return fail("Chưa cấu hình đăng ký qua Supabase. Vui lòng liên hệ Vexim.", 503);
  const auth = getSupabaseAuthClient();
  const db = getSupabaseClient();
  const store = getStore();
  if (!auth || !db || store.mode !== "supabase") return fail("CSDL chưa khả dụng. Chưa lưu hồ sơ, vui lòng thử lại sau.", 503);
  try {
    const admins = await store.listUsers();
    if (!admins.some((u) => u.role === "admin" && u.is_active)) return fail("Vexim chưa kích hoạt hệ thống tiếp nhận hồ sơ.", 503);
    if (await store.getUserByEmail(email)) return fail("Email đã có tài khoản. Vui lòng đăng nhập hoặc liên hệ Vexim.", 409);
    await store.listSupplierVerificationRequests();
    const schema = await db.from("app_users").select("supplier_id").limit(1);
    if (schema.error) throw schema.error;
  } catch (error) {
    console.error("[supplier-signup] database preflight:", error);
    return fail("Chưa áp dụng migration đăng ký doanh nghiệp trên Supabase; chưa tạo tài khoản.", 503);
  }

  // Supabase must send a confirmation email; a project that auto-confirms email is rejected.
  let authId: string | null = null;
  try {
    const { data, error } = await auth.auth.signUp({ email, password, options: { emailRedirectTo: process.env.SUPPLIER_SIGNUP_REDIRECT_URL || `${SITE_URL}/login` } });
    if (error || !data.user?.id || data.user.identities?.length === 0) {
      console.warn("[supplier-signup] Supabase signup rejected", error?.message ?? "duplicate account");
      return fail("Không tạo được tài khoản. Nếu email đã dùng, hãy đăng nhập hoặc liên hệ Vexim.", 409);
    }
    authId = data.user.id;
    if (data.session || data.user.email_confirmed_at) {
      await auth.auth.admin.deleteUser(authId);
      return fail("Supabase chưa bật xác nhận email. Vexim cần bật Confirm email trước khi mở đăng ký.", 503);
    }
  } catch (error) {
    console.error("[supplier-signup] auth unavailable", error);
    return fail("Không gửi được email xác nhận. Chưa lưu hồ sơ; vui lòng thử lại sau.", 503);
  }

  const supplierInput: SupplierInput = {
    name, trade_name: text(form, "trade_name", 180) || null, display_name: null, slug: null,
    contact_name: contact, contact_title: null, email, phone: text(form, "phone", 40), zalo: null,
    website: null, country: "Vietnam", address: text(form, "address", 250) || null,
    province: text(form, "province", 100) || null, role: supplierType === "manufacturer" ? "manufacturer" : "trader",
    supplier_type: supplierType as SupplierInput["supplier_type"], markets: null,
    products: text(form, "products", 1000), tax_id: tax || null, payment_terms: null,
    lead_time_days: null, rating: null, notes: null, status: "draft", is_demo: false,
    verification_level: 0, verified_at: null, fob_publicly_visible: false, fob_updated_at: null,
  };
  let supplierId: string | null = null;
  let userId: string | null = null;
  const paths: string[] = [];
  try {
    const supplier = await store.createSupplier(supplierInput);
    supplierId = supplier.id;
    const user = await store.createUser({
      email, name: contact, role: "supplier", supplier_id: supplier.id,
      auth_provider: "supabase", password_hash: null, is_active: true,
    });
    userId = user.id;
    const review = await store.createVerification({
      supplier_id: supplier.id, target_level: 1, status: "in_progress", inspector_id: null,
      tax_number: tax || null, bank_account_number: bank || null,
      checklist: Object.fromEntries(L1_DOC_ITEMS.map((item) => [item.key, null])),
      checklist_notes: {}, public_summary_i18n: {},
    });
    for (const { key, file, prepared } of documents) {
      const asset = await saveDocumentEvidence({ store, review, key, file, prepared, createdBy: user.id });
      if (asset.storage_path) paths.push(asset.storage_path);
    }
    for (const level of requested) await store.createSupplierVerificationRequest(supplier.id, level);
    await store.addAuditLog({ actor_id: user.id, actor_email: email, entity: "supplier", entity_id: supplier.id,
      action: "supplier.self_registration", before: null, after: { requested_steps: requested, documents: documents.length, review_id: review.id, status: "draft" } });
    let notification: "sent" | "simulated" | "failed" = "failed";
    try { notification = await notifySupplierRegistration(supplier, requested); }
    catch (error) { console.error("[supplier-signup] internal notification failed", error); }
    return NextResponse.json({ ok: true, message: "Đã nhận hồ sơ. Kiểm tra email để xác nhận tài khoản; Vexim sẽ rà soát và liên hệ về các đánh giá đã yêu cầu.", notification });
  } catch (error) {
    console.error("[supplier-signup] aborted and rolling back", error);
    // Never leave a partially created supplier as a public listing or an unlinked portal account.
    if (userId) await store.deleteUser(userId).catch((e) => console.error("[supplier-signup] user cleanup", e));
    if (supplierId) await store.deleteSupplier(supplierId).catch((e) => console.error("[supplier-signup] supplier cleanup", e));
    await Promise.all(paths.map((path) => deleteObject(path).catch(() => null)));
    if (authId) await auth.auth.admin.deleteUser(authId).catch((e) => console.error("[supplier-signup] auth cleanup", e));
    return fail("Không lưu được hồ sơ. Vui lòng thử lại sau hoặc liên hệ Vexim; không tự tạo hồ sơ khác nếu đã nhận email xác nhận.", 503);
  }
}
