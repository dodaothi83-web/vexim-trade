import { COMPANY } from "@/lib/config";
import { getStore } from "@/lib/db";
import {
  buildBuyerContext,
  buildSupplierContext,
  toRecentMail,
  type ComposeContext,
  type RecentMail,
} from "@/lib/compose-context";
import { buildSignature } from "@/lib/email/signature";
import { unwrapEmailShell } from "@/lib/email/templates";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { ComposeMail, type ComposeInitial, type Contact } from "@/components/compose-mail";
import { requirePagePermission } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Soạn thư" };

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; supplier?: string; draft?: string; dir?: string }>;
}) {
  await requirePagePermission("mail.send", "/mail");
  const sp = await searchParams;
  const store = getStore();
  const [buyers, suppliers, products, messages] = await Promise.all([
    store.listBuyers(),
    store.listSuppliers(),
    store.listProducts(),
    store.listMessages(120),
  ]);

  // Cột phải của trang soạn thư: ngữ cảnh từng buyer / NCC + email đã trao đổi
  const contexts: ComposeContext[] = [
    ...buyers.map((b) => buildBuyerContext(b, { suppliers, supplierProducts: products })),
    ...suppliers.map((s) => buildSupplierContext(s, { supplierProducts: products })),
  ];
  const recent: RecentMail[] = messages.map(toRecentMail);

  const contacts: Contact[] = [
    ...buyers
      .filter((b) => b.email)
      .map((b) => ({ id: b.id, name: b.company, email: b.email, kind: "buyer" as const })),
    ...suppliers
      .filter((s) => s.email)
      .map((s) => ({ id: s.id, name: s.name, email: s.email, kind: "supplier" as const })),
  ];

  // -------- Mở bản nháp --------
  if (sp.draft) {
    const msg = await store.getMessage(sp.draft);
    if (msg) {
      const buyer = buyers.find((b) => b.id === msg.buyer_id) ?? null;
      return (
        <Shell>
          <ComposeMail
            initial={{
              buyerId: msg.buyer_id,
              supplierId: msg.supplier_id,
              direction: msg.direction,
              to: msg.to_emails,
              cc: msg.cc_emails,
              bcc: msg.bcc_emails,
              subject: msg.subject,
              bodyHtml: unwrapEmailShell(msg.body_html),
              attachments: msg.attachments,
              draftId: msg.id,
            }}
            contacts={contacts}
            buyer={buyer}
            signature={buildSignature(msg.created_by)}
            contexts={contexts}
            recent={recent}
            company={COMPANY}
          />
        </Shell>
      );
    }
  }

  // -------- Soạn cho một buyer cụ thể --------
  const buyer = sp.to ? (buyers.find((b) => b.id === sp.to) ?? null) : null;
  const supplier = sp.supplier
    ? (suppliers.find((s) => s.id === sp.supplier) ?? null)
    : (buyer?.supplier_id ? (suppliers.find((s) => s.id === buyer.supplier_id) ?? null) : null);

  const direction: "buyer" | "supplier" =
    sp.dir === "supplier" || (!buyer && supplier) ? "supplier" : "buyer";

  const initial: ComposeInitial = { buyerId: buyer?.id ?? null, supplierId: supplier?.id ?? null, direction, to: [], cc: [] };

  const sig = buildSignature(buyer?.owner);
  if (direction === "buyer" && buyer) {
    initial.to = buyer.email ? [buyer.email] : [];
    initial.cc = (buyer.cc_emails ?? "")
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
    initial.subject = "";
    initial.bodyHtml = `<p>Dear ${buyer.contact_name || buyer.company},</p><p><br/></p>${sig}`;
  } else if (direction === "supplier" && supplier) {
    initial.to = supplier.email ? [supplier.email] : [];
    initial.subject = "";
    initial.bodyHtml = `<p>Kính gửi Anh/Chị ${supplier.contact_name || supplier.name},</p><p><br/></p>${sig}`;
  }

  return (
    <Shell
      sub={
        direction === "buyer"
          ? buyer
            ? `Gửi tới ${buyer.company} — nội dung đã nạp sẵn theo giai đoạn hiện tại, bạn có thể sửa tự do.`
            : "Chọn người nhận từ danh sách buyer (gõ vào ô Tới)."
          : supplier
            ? `Gửi tới ${supplier.name} — nội dung tiếng Việt đã nạp sẵn theo giai đoạn hiện tại.`
            : "Chọn người nhận từ danh sách nhà cung cấp."
      }
    >
      <ComposeMail
        initial={initial}
        contacts={contacts}
        buyer={buyer}
        signature={buildSignature(buyer?.owner)}
        contexts={contexts}
        recent={recent}
        company={COMPANY}
      />
    </Shell>
  );
}

function Shell({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <>
      <PageHeader
        title="Soạn email"
        sub={sub}
        breadcrumbs={<Breadcrumbs items={[{ label: "Hộp thư", href: "/mail" }, { label: "Soạn thư" }]} />}
      />
      {children}
    </>
  );
}
