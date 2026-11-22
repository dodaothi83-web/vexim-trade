import type { Metadata } from "next";
import { BuyerAccountNav } from "@/components/buyer-account-nav";
import { requireBuyerSession } from "@/lib/auth/buyer-session";
import { getLocale } from "@/lib/i18n/server";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { BUYER_CHAT_LABELS } from "@/lib/chat/buyer-labels";
import { getStore } from "@/lib/db";
import { supplierName } from "@/lib/chat/service";
import { RFQ_CODE } from "@/lib/rfq/chat-link";
import { quotePortalCopy } from "@/lib/rfq/portal-copy";

export const metadata: Metadata = { title: "Messages | Vexim Trade", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Mã nhà cung cấp chỉ dùng để tra cứu; giới hạn ký tự để không đưa chuỗi lạ vào đường dẫn đăng nhập. */
const SUPPLIER_ID = /^[0-9A-Za-z-]{1,64}$/;

/**
 * Tin nhắn của người mua với các nhà cung cấp — kênh trao đổi duy nhất giữa hai bên.
 * `?supplier=<id>` (mở từ trang yêu cầu RFQ): mở lại cuộc sẵn có với nhà cung cấp đó, chưa có thì
 * hiện cuộc mới chưa lưu; `&rfq=<mã>` chỉ điền sẵn câu mở đầu.
 */
export default async function BuyerMessagesPage({ searchParams }: { searchParams: Promise<{ c?: string; supplier?: string; rfq?: string }> }) {
  const { c, supplier: supplierParam, rfq } = await searchParams;
  const initialId = c && /^[0-9a-f-]{8,64}$/i.test(c) ? c : null;
  const supplierId = !initialId && supplierParam && SUPPLIER_ID.test(supplierParam) ? supplierParam : null;
  const rfqCode = supplierId && rfq && RFQ_CODE.test(rfq) ? rfq : null;
  const next = initialId ? `?c=${initialId}` : supplierId ? `?supplier=${supplierId}${rfqCode ? `&rfq=${rfqCode}` : ""}` : "";
  await requireBuyerSession(`/buyer/account/messages${next}`);
  const vi = (await getLocale()) === "vi";
  // Chỉ lấy tên hiển thị; quyền mở cuộc mới vẫn do /api/chat/start kiểm khi gửi tin đầu.
  const record = supplierId ? await getStore().getSupplier(supplierId).catch(() => null) : null;
  const supplier = record && record.status === "published" ? { id: record.id, name: supplierName(record) } : null;
  const initialDraft = supplier && rfqCode ? quotePortalCopy[vi ? "vi" : "en"].chat.buyerDraft.replace("{code}", rfqCode) : "";
  // Cùng bố cục với các mục khác của tài khoản người mua: cột menu bên trái, tin nhắn bên phải.
  return <div lang={vi ? "vi" : "en"} className="bg-slate-50">
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)]">
        <BuyerAccountNav active="messages" vi={vi} />
        <div className="min-w-0">
          <h1 className="sr-only">{vi ? "Tin nhắn" : "Messages"}</h1>
          <ChatWorkspace side="buyer" labels={BUYER_CHAT_LABELS[vi ? "vi" : "en"]} locale={vi ? "vi-VN" : "en-GB"} initialId={initialId}
            supplier={supplier} initialDraft={initialDraft} />
        </div>
      </div>
    </div>
  </div>;
}
