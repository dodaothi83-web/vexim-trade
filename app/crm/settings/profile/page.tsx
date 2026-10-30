import { getStore } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { roleMeta } from "@/lib/auth/permissions";
import { senderAddressFor } from "@/lib/email/sender";
import { buildSignature } from "@/lib/email/signature";
import { PageHeader } from "@/components/page-header";
import { ProfilePanel } from "@/components/profile-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Hồ sơ của tôi" };

export default async function ProfilePage() {
  const session = await requireSession();
  const store = getStore();
  const [me, users] = await Promise.all([
    store.getUserByEmail(session.email).catch(() => null),
    store.listUsers().catch(() => []),
  ]);
  // Địa chỉ gửi riêng đang áp dụng cho tài khoản này (tự sinh hoặc đặt tay)
  const mySenderAddress = senderAddressFor(me, users);
  const meta = roleMeta(session.role);

  return (
    <>
      <PageHeader
        title="Hồ sơ của tôi"
        sub="Thông tin đăng nhập, chữ ký email cá nhân và đổi mật khẩu — gom về một chỗ."
      />
      <ProfilePanel
        name={session.name || session.email}
        email={session.email}
        roleLabel={meta.label}
        roleDescription={meta.description}
        phone={me?.phone ?? null}
        signatureHtml={me?.signature_html ?? null}
        autoSignature={buildSignature(session.name, me?.phone, mySenderAddress)}
        senderAddress={mySenderAddress}
        senderAddressCustom={Boolean(me?.sender_email)}
      />
    </>
  );
}
