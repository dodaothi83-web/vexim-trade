import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { getSupabaseAuthClient, getSupabaseClient } from "@/lib/db/supabase";
import { getSession } from "@/lib/auth/session";
import { passwordProblem } from "@/lib/auth/password";
import { rateLimit } from "@/lib/rfq/rate-limit";
import type { SupplierInput } from "@/lib/types";
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
  if (Number(request.headers.get("content-length") ?? 0) > 64 * 1024) return fail("Biểu mẫu quá lớn.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Không đọc được biểu mẫu."); }
  if (text(form, "website_hp")) return fail("Không thể gửi yêu cầu này.");
  if (text(form, "consent") !== "yes") return fail("Vui lòng xác nhận đồng ý tạo tài khoản và gửi thông tin cho Vexim.");

  const contact = text(form, "contact_name", 120);
  const email = text(form, "email", 200).toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!contact || !EMAIL.test(email)) return fail("Cần tên người liên hệ và email đăng nhập hợp lệ.");
  if (passwordProblem(password) || password.length > 128) return fail("Mật khẩu cần 8–128 ký tự, gồm cả chữ và số.");

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
    const gate = await db.from("suppliers").select("onboarding_status").limit(1);
    if (schema.error || gate.error) throw schema.error || gate.error;
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
    name: `Chưa hoàn thiện · ${email}`, trade_name: null, display_name: null, slug: null,
    contact_name: contact, contact_title: null, email, phone: null, zalo: null,
    website: null, country: "Vietnam", address: null, province: null,
    role: "manufacturer", supplier_type: null, markets: null, products: null,
    tax_id: null, payment_terms: null, lead_time_days: null, rating: null, notes: null,
    status: "draft", onboarding_status: "not_started", is_demo: false,
    verification_level: 0, verified_at: null, fob_publicly_visible: false, fob_updated_at: null,
  };
  let supplierId: string | null = null;
  let userId: string | null = null;
  try {
    const supplier = await store.createSupplier(supplierInput);
    supplierId = supplier.id;
    const user = await store.createUser({
      email, name: contact, role: "supplier", supplier_id: supplier.id,
      auth_provider: "supabase", password_hash: null, is_active: true,
    });
    userId = user.id;
    await store.addAuditLog({ actor_id: user.id, actor_email: email, entity: "supplier", entity_id: supplier.id,
      action: "supplier.account_registered", before: null, after: { onboarding_status: "not_started" } });
    return NextResponse.json({ ok: true, message: "Tài khoản đã tạo. Vui lòng xác nhận email, đăng nhập và hoàn thiện hồ sơ doanh nghiệp trong dashboard." });
  } catch (error) {
    console.error("[supplier-signup] aborted and rolling back", error);
    // Never leave a partially created supplier as a public listing or an unlinked portal account.
    if (userId) await store.deleteUser(userId).catch((e) => console.error("[supplier-signup] user cleanup", e));
    if (supplierId) await store.deleteSupplier(supplierId).catch((e) => console.error("[supplier-signup] supplier cleanup", e));
    if (authId) await auth.auth.admin.deleteUser(authId).catch((e) => console.error("[supplier-signup] auth cleanup", e));
    return fail("Không lưu được hồ sơ. Vui lòng thử lại sau hoặc liên hệ Vexim; không tự tạo hồ sơ khác nếu đã nhận email xác nhận.", 503);
  }
}
