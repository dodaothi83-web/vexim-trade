import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { inviteEligible, readIntroductions, receivesIntroductions } from "@/lib/buyer/introductions";
import { introCategories, listVerifiedBuyerUsers } from "@/lib/buyer/introductions-server";
import { SendInvitesButton } from "./send-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Người mua nhận giới thiệu" };

/**
 * CRM: người mua đồng ý nhận giới thiệu nhà cung cấp (đợt 1). Số tổng theo ngành, số người sẽ nhận
 * đợt thư mời (xem trước khi gửi). Không hiện danh sách email ở đây.
 */
export default async function BuyerIntroductionsPage() {
  const session = await requirePagePermission("buyers.view", "/crm");
  const [users, categories] = await Promise.all([listVerifiedBuyerUsers().catch(() => []), introCategories().catch(() => [])]);
  const receiving = users.filter(receivesIntroductions);
  const eligible = users.filter(inviteEligible).length;
  const invited = users.filter((u) => readIntroductions(u.introductions).invite_sent_at).length;
  const declined = users.filter((u) => readIntroductions(u.introductions).invite_declined_at).length;
  const perCategory = categories.map((c) => ({ ...c, buyers: receiving.filter((u) => readIntroductions(u.introductions).categories?.includes(c.id)).length }));
  const stat = (label: string, value: number, hint?: string) => <div className="rounded-xl border border-ink-200 bg-white p-4">
    <p className="text-xs font-semibold text-ink-500">{label}</p><p className="mt-1 text-2xl font-bold text-ink-900">{value}</p>{hint && <p className="mt-0.5 text-[11px] text-ink-500">{hint}</p>}</div>;
  return <>
    <PageHeader title="Người mua nhận giới thiệu" sub="Người mua tự đồng ý nhận giới thiệu nhà cung cấp và tự chọn ngành hàng. Nhà cung cấp không thấy tên, email người mua." />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stat("Tài khoản đã xác thực", users.length)}
      {stat("Đang nhận giới thiệu", receiving.length, "Đã bật và chọn ít nhất một ngành")}
      {stat("Đã gửi thư mời", invited, `${declined} người chọn "không hỏi lại"`)}
      {stat("Sẽ nhận đợt thư mời tới", eligible, "Chưa nhận giới thiệu, chưa được mời, chưa từ chối")}
    </div>
    <section className="card mt-4 p-5">
      <h2 className="text-sm font-bold text-ink-900">Gửi thư mời chọn ngành hàng</h2>
      <p className="mt-1 text-xs leading-5 text-ink-500">Mỗi người mua chỉ nhận thư mời một lần; hệ thống tự nhắc một lần sau 14 ngày nếu chưa bấm. Tài khoản mới tự nhận thư chào mừng kèm lời mời sau 24 giờ, không cần gửi ở đây.</p>
      <div className="mt-3">{hasPermission(session.role, "buyers.manage")
        ? <SendInvitesButton count={eligible} />
        : <p className="text-xs text-ink-500">Cần quyền quản lý người mua để gửi.</p>}</div>
    </section>
    <section className="card mt-4 p-5">
      <h2 className="text-sm font-bold text-ink-900">Theo ngành hàng</h2>
      <p className="mt-1 text-xs text-ink-500">Ngành đọc từ danh mục đang đăng; ngành mới đăng tự xuất hiện.</p>
      <table className="mt-3 w-full text-sm">
        <thead><tr className="border-b border-ink-200 text-left text-xs text-ink-500"><th className="py-2 font-semibold">Ngành hàng</th><th className="py-2 text-right font-semibold">Người mua nhận giới thiệu</th><th className="py-2 text-right font-semibold">Sản phẩm đang hiện</th></tr></thead>
        <tbody>{perCategory.map((c) => <tr key={c.id} className="border-b border-ink-100"><td className="py-2 font-medium text-ink-900">{c.name}</td><td className="py-2 text-right">{c.buyers}</td><td className="py-2 text-right text-ink-500">{c.products}</td></tr>)}</tbody>
      </table>
    </section>
  </>;
}
