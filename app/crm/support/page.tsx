import { requirePagePermission } from "@/lib/auth/session";
import { SupportInbox } from "@/components/crm/support-inbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat với người mua" };

/** Người mua bấm "Chat with Vexim" trên trang công khai; nhân viên kinh doanh trả lời tại đây. */
export default async function CrmSupportPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await requirePagePermission("support.view", "/crm/dashboard");
  const { c } = await searchParams;
  return <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Chat với người mua</h1>
      <p className="mt-1 text-sm text-ink-600">Người mua nhắn qua nút Chat with Vexim trên trang công khai. Trả lời tại đây, người mua thấy ngay trên trang và nhận email báo.</p>
    </div>
    <SupportInbox initialId={c && /^[0-9a-f-]{8,64}$/i.test(c) ? c : null} />
  </div>;
}
