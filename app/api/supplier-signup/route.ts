import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GOOGLE_SIGNUP_COOKIE, googleCookieOptions, googleRequestOrigin, isVerifiedGoogleUser, verifyGoogleSignupTicket } from "@/lib/auth/google-oauth";

import { getStore } from "@/lib/db";
import { getSupabaseAuthClient, getSupabaseClient } from "@/lib/db/supabase";
import { getSession } from "@/lib/auth/session";
import { passwordProblem } from "@/lib/auth/password";
import { rateLimit } from "@/lib/rfq/rate-limit";
import type { SupplierInput } from "@/lib/types";
import { parseSupplierProfile } from "@/lib/supplier-portal/profile-input";
import { categoryProposalOptions, parseSupplierCategoryProposals } from "@/lib/supplier-portal/category-proposals";
import { prepareInitialDocuments, saveInitialEvidence } from "@/lib/supplier-portal/profile-evidence";
import { notifySupplierRegistration } from "@/lib/supplier-portal/notify";
import { deleteObject } from "@/lib/media/storage";
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
  if (Number(request.headers.get("content-length") ?? 0) > 78 * 1024 * 1024) return fail("Biểu mẫu quá lớn.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Không đọc được biểu mẫu."); }
  if (text(form, "website_hp")) return fail("Không thể gửi yêu cầu này.");
  if (text(form, "consent") !== "yes") return fail("Vui lòng xác nhận đồng ý tạo tài khoản và gửi thông tin cho Vexim.");

  const googleTicket = verifyGoogleSignupTicket((await cookies()).get(GOOGLE_SIGNUP_COOKIE)?.value);
  const email = text(form, "email", 200).toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!EMAIL.test(email)) return fail("Cần email đăng nhập hợp lệ.");
  if (googleTicket ? (email !== googleTicket.email || !!password) : (passwordProblem(password) || password.length > 128)) {
    return fail(googleTicket ? "Email đã xác thực bằng Google không được thay đổi; không gửi mật khẩu." : "Mật khẩu cần 8–128 ký tự, gồm cả chữ và số.");
  }
  let parsed: ReturnType<typeof parseSupplierProfile>;
  let documents: Awaited<ReturnType<typeof prepareInitialDocuments>>;
  try { parsed = parseSupplierProfile(form); documents = await prepareInitialDocuments(form); }
  catch (error) { return fail(error instanceof Error ? error.message : "Hồ sơ không hợp lệ."); }

  // Fail before creating an Auth account if the DB migration or service-role connection is missing.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return fail("Chưa cấu hình đăng ký qua Supabase. Vui lòng liên hệ Vexim.", 503);
  const auth = getSupabaseAuthClient();
  const db = getSupabaseClient();
  const store = getStore();
  if (!auth || !db || store.mode !== "supabase") return fail("CSDL chưa khả dụng. Chưa lưu hồ sơ, vui lòng thử lại sau.", 503);
  let categoryChoices: ReturnType<typeof categoryProposalOptions>;
  try { categoryChoices = categoryProposalOptions(await store.listCategories({ publishedOnly: true })); }
  catch { return fail("Không đọc được danh mục Vexim. Vui lòng thử lại sau.", 503); }
  let proposals: ReturnType<typeof parseSupplierCategoryProposals>;
  try { proposals = parseSupplierCategoryProposals(form, categoryChoices); }
  catch (error) { return fail(error instanceof Error ? error.message : "Danh mục không hợp lệ."); }
  try {
    const admins = await store.listUsers();
    if (!admins.some((u) => u.role === "admin" && u.is_active)) return fail("Vexim chưa kích hoạt hệ thống tiếp nhận hồ sơ.", 503);
    if (await store.getUserByEmail(email)) return fail("Email đã có tài khoản. Vui lòng đăng nhập hoặc liên hệ Vexim.", 409);
    await store.listSupplierVerificationRequests();
    const schema = await db.from("app_users").select("supplier_id").limit(1);
    const gate = await db.from("suppliers").select("onboarding_status").limit(1);
    if (schema.error || gate.error) throw schema.error || gate.error;
    if (googleTicket) {
      const { data, error } = await auth.auth.admin.getUserById(googleTicket.id);
      if (error || !isVerifiedGoogleUser(data.user) || data.user.email?.toLowerCase() !== googleTicket.email)
        return fail("Phiên Google đã hết hạn hoặc không hợp lệ. Vui lòng đăng ký lại bằng Google.", 401);
    }
  } catch (error) {
    console.error("[supplier-signup] database preflight:", error);
    return fail("Chưa áp dụng migration đăng ký doanh nghiệp trên Supabase; chưa tạo tài khoản.", 503);
  }

  // Password signup must send a confirmation email. Google reuses its already verified Auth identity.
  let authId: string | null = null;
  try {
    if (!googleTicket) {
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
    }
  } catch (error) {
    console.error("[supplier-signup] auth unavailable", error);
    return fail("Không gửi được email xác nhận. Chưa lưu hồ sơ; vui lòng thử lại sau.", 503);
  }

  const supplierInput: SupplierInput = {
    name: parsed.patch.name!, trade_name: parsed.patch.trade_name ?? null,
    display_name: parsed.patch.display_name ?? null, slug: null,
    contact_name: parsed.patch.contact_name!, contact_title: parsed.patch.contact_title ?? null,
    email, phone: parsed.patch.phone!, zalo: parsed.patch.zalo ?? null,
    website: parsed.patch.website ?? null, country: parsed.patch.country ?? "Vietnam",
    address: parsed.patch.address ?? null, province: parsed.patch.province ?? null,
    role: parsed.patch.role!, supplier_type: parsed.patch.supplier_type,
    markets: parsed.patch.markets ?? null, products: parsed.patch.products ?? null,
    requested_category_slugs: proposals.requested_category_slugs,
    requested_category_other: proposals.requested_category_other,
    tax_id: parsed.patch.tax_id ?? null, payment_terms: parsed.patch.payment_terms ?? null,
    lead_time_days: parsed.patch.lead_time_days ?? null, rating: null, notes: null,
    status: "draft", onboarding_status: "not_started", is_demo: false,
    verification_level: 0, verified_at: null, fob_publicly_visible: false, fob_updated_at: null,
    summary_i18n: parsed.patch.summary_i18n, founded_year: parsed.patch.founded_year,
    employees: parsed.patch.employees, moq_text: parsed.patch.moq_text,
    capacity_per_month: parsed.patch.capacity_per_month, ports: parsed.patch.ports,
    incoterms: parsed.patch.incoterms, export_markets: parsed.patch.export_markets,
    private_label: parsed.patch.private_label,
  };
  let supplierId: string | null = null;
  let userId: string | null = null;
  try {
    const supplier = await store.createSupplier(supplierInput);
    supplierId = supplier.id;
    const user = await store.createUser({
      email, name: parsed.patch.contact_name!, role: "supplier", supplier_id: supplier.id,
      auth_provider: "supabase", password_hash: null, is_active: true,
    });
    userId = user.id;
    const review = await saveInitialEvidence({ store, supplierId: supplier.id, userId: user.id,
      tax: parsed.patch.tax_id!, bank: parsed.bank, documents, requested: parsed.requested });
    await store.updateSupplier(supplier.id, { onboarding_status: "pending" });
    await store.addAuditLog({ actor_id: user.id, actor_email: email, entity: "supplier", entity_id: supplier.id,
      action: "supplier.self_registration", before: null,
      after: { onboarding_status: "pending", review_id: review.id, documents: documents.length,
        requested_steps: parsed.requested, category_proposals: proposals.requested_category_slugs } });
    let notification: "sent" | "simulated" | "failed" = "failed";
    try { notification = await notifySupplierRegistration(supplier, parsed.requested); }
    catch (error) { console.error("[supplier-signup] staff notification failed", error); }
    const response = NextResponse.json({ ok: true,
      message: googleTicket
        ? "Đã nhận hồ sơ tạo trang NCC. Email Google đã được xác thực; hãy đăng nhập tại form chung để xem trạng thái chờ Vexim duyệt tài khoản."
        : "Đã nhận hồ sơ tạo trang NCC. Vui lòng xác nhận email và đăng nhập để xem trạng thái chờ Vexim duyệt tài khoản.", notification });
    if (googleTicket) response.cookies.set(GOOGLE_SIGNUP_COOKIE, "", googleCookieOptions(googleRequestOrigin(request).startsWith("https:"), 0));
    return response;
  } catch (error) {
    console.error("[supplier-signup] aborted and rolling back", error);
    // Never leave a partially created supplier as a public listing or an unlinked portal account.
    if (supplierId) {
      // DB rows cascade on delete, but storage objects must be cleaned up separately.
      const reviews = await store.listVerifications(supplierId).catch(() => []);
      for (const review of reviews) {
        const media = await store.listMedia("verification", review.id).catch(() => []);
        await Promise.all(media.flatMap((m) => [m.storage_path, m.thumb_path].filter((p): p is string => !!p))
          .map((path) => deleteObject(path).catch(() => null)));
      }
    }
    if (userId) await store.deleteUser(userId).catch((e) => console.error("[supplier-signup] user cleanup", e));
    if (supplierId) await store.deleteSupplier(supplierId).catch((e) => console.error("[supplier-signup] supplier cleanup", e));
    if (authId) await auth.auth.admin.deleteUser(authId).catch((e) => console.error("[supplier-signup] auth cleanup", e));
    return fail("Không lưu được hồ sơ. Vui lòng thử lại sau hoặc liên hệ Vexim; không tự tạo hồ sơ khác nếu đã nhận email xác nhận.", 503);
  }
}
