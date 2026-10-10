import { getStore } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { roleMeta } from "@/lib/auth/permissions";
import { buildSignature } from "@/lib/email/signature";
import { PageHeader } from "@/components/page-header";
import { ProfilePanel } from "@/components/profile-panel";
import { ProfileInfoForm } from "@/components/profile-info-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Hồ sơ của tôi" };

export default async function ProfilePage() {
  const session = await requireSession();
  const me = await getStore()
    .getUserByEmail(session.email)
    .catch(() => null);
  const meta = roleMeta(session.role);

  return (
    <>
      <PageHeader
        title="Hồ sơ của tôi"
        sub="Thông tin đăng nhập, chữ ký email cá nhân và đổi mật khẩu — gom về một chỗ."
      />
      <ProfileInfoForm name={session.name || ""} email={session.email} />
      <ProfilePanel
        name={session.name || session.email}
        email={session.email}
        roleLabel={meta.label}
        roleDescription={meta.description}
        signatureHtml={me?.signature_html ?? null}
        autoSignature={buildSignature(session.name)}
      />
    </>
  );
}
