import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AuthSplitShell } from "@/components/auth-split-shell";
import { getAuthMessages } from "@/lib/i18n/server";
import { SupplierAccountForm } from "./supplier-account-form";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getAuthMessages();
  return { title: m.supplierRegister.metaTitle, robots: { index: false, follow: false } };
}

export default async function SupplierRegisterPage({ searchParams }: { searchParams: Promise<{ oauth?: string; type?: string }> }) {
  const session = await getSession();
  if (session) redirect(session.role === "supplier" ? "/supplier/portal" : "/crm/dashboard");
  const { oauth, type } = await searchParams;
  // Bước 1 luôn là chọn loại tài khoản. Vào thẳng URL này (bookmark, link cũ) thì quay về
  // màn chọn để người mua không rơi nhầm vào biểu mẫu đăng ký bán hàng.
  if (type !== "supplier") redirect("/register");
  const { locale, m } = await getAuthMessages();
  const copy = m.supplierRegister;
  const oauthKey = oauth && oauth in copy.oauth ? (oauth as keyof typeof copy.oauth) : null;
  return <AuthSplitShell
    caption={copy.shellCaption}
    lede={copy.shellLede}
    points={copy.shellPoints}
    note={copy.note}
  >
    <p className="text-xs font-bold uppercase tracking-widest text-brand-700">{copy.step}</p>
    <h1 className="mt-2 text-xl font-black text-ink-900">{copy.title}</h1>
    {/* Giải thích quy trình nằm ở màn chọn loại tài khoản; ở đây chỉ để form thuần. */}
    {oauthKey && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{copy.oauth[oauthKey]}</p>}
    <SupplierAccountForm messages={copy.form} lang={locale} />
    <p className="mt-5 text-center text-xs text-ink-600">{copy.loginQuestion} <Link href="/login" className="font-semibold text-brand-700 underline">{copy.login}</Link></p>
    <p className="mt-2 text-center text-xs text-ink-500">{copy.buyerQuestion} <Link href="/rfq" className="font-semibold text-brand-700 underline">{copy.sendQuoteRequest}</Link> {copy.noSignInNeeded} <Link href="/register" className="font-semibold text-brand-700 underline">{copy.changeType}</Link>.</p>
  </AuthSplitShell>;
}
