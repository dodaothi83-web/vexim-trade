import Link from "next/link";
import { ChevronRight, CircleCheckBig } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui";
import { requirePagePermission } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { isPartnerL2, l2ScopeMatchesSupplier } from "@/lib/l2-scope";
import { auditHref } from "@/lib/verification";

export const dynamic = "force-dynamic";
export const metadata = { title: "Việc cần làm" };

interface Task { key: string; who: string; what: string; since: string; href: string; action: string }

/**
 * Một danh sách duy nhất cho người vận hành: mỗi dòng là một việc, bấm vào là làm.
 * Việc chờ lâu nhất đứng đầu. Chứng từ xuất khẩu mở trang xét nhanh hai nút;
 * các việc khác mở đúng trang hiện có cho đến khi được làm gọn tiếp.
 */
export default async function TasksPage() {
  await requirePagePermission("verifications.view", "/crm/dashboard");
  const store = getStore();
  const [verifications, submissions, suppliers, requests] = await Promise.all([
    store.listVerifications(),
    store.listSubmissions().catch(() => []),
    store.listSuppliers(),
    store.listSupplierVerificationRequests().catch(() => []),
  ]);
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const name = (id: string) => supplierById.get(id)?.name ?? "Nhà cung cấp";
  const open = (status: string) => ["in_progress", "scheduled", "submitted"].includes(status);
  const oldestFirst = (a: Task, b: Task) => a.since.localeCompare(b.since);

  const exportTasks: Task[] = [
    ...submissions.filter((s) => s.target_level === 3 && s.status === "pending_review").map((s) => ({
      key: `s-${s.id}`, who: name(s.supplier_id), what: "gửi chứng từ xuất khẩu",
      since: s.submitted_at ?? s.updated_at, href: `/crm/tasks/export/s-${s.id}`, action: "Xem và quyết định",
    })),
    ...verifications.filter((v) => v.target_level === 3 && open(v.status)).map((v) => ({
      key: `v-${v.id}`, who: name(v.supplier_id), what: "có chứng từ xuất khẩu đang chờ quyết định",
      since: v.updated_at, href: `/crm/tasks/export/v-${v.id}`, action: "Xem và quyết định",
    })),
  ].sort(oldestFirst);

  const factoryTasks: Task[] = [
    ...submissions.filter((s) => s.target_level === 2 && s.status === "pending_review").map((s) => ({
      key: `s-${s.id}`, who: name(s.supplier_id), what: isPartnerL2(s) ? "đặt lịch gọi nhà máy đối tác, chờ chốt giờ" : "đặt lịch gọi nhà máy, chờ chốt giờ",
      since: s.submitted_at ?? s.updated_at, href: `/crm/verifications/submissions/${s.id}`, action: "Chốt giờ",
    })),
    ...verifications.filter((v) => v.target_level === 2 && open(v.status)).map((v) => ({
      key: `v-${v.id}`, who: name(v.supplier_id), what: "đã chốt lịch gọi, chờ ghi kết quả",
      since: v.updated_at, href: auditHref(v.supplier_id, 2, v.id), action: "Mở cuộc gọi",
    })),
  ].sort(oldestFirst);

  const documentTasks: Task[] = verifications.filter((v) => v.target_level === 1 && open(v.status)).map((v) => ({
    key: `v-${v.id}`, who: name(v.supplier_id), what: "gửi giấy tờ doanh nghiệp, chờ duyệt",
    since: v.updated_at, href: auditHref(v.supplier_id, 1, v.id), action: "Mở giấy tờ",
  })).sort(oldestFirst);

  const contactTasks: Task[] = requests.filter((r) => r.status !== "contacted" && !verifications.some((v) =>
    v.supplier_id === r.supplier_id && v.target_level === r.target_level && v.status === "approved" &&
    l2ScopeMatchesSupplier(v, supplierById.get(r.supplier_id)?.supplier_type))).map((r) => ({
    key: `r-${r.supplier_id}-${r.target_level}`, who: name(r.supplier_id),
    what: r.target_level === 2 ? "nhờ Vexim liên hệ để xác minh nhà máy" : "nhờ Vexim liên hệ về chứng từ xuất khẩu",
    since: r.requested_at, href: `/crm/suppliers/${r.supplier_id}`, action: "Gọi cho nhà cung cấp",
  })).sort(oldestFirst);

  const groups = [
    { title: "Chứng từ xuất khẩu (L2)", tasks: exportTasks },
    { title: "Xác minh nhà máy (L3)", tasks: factoryTasks },
    { title: "Giấy tờ doanh nghiệp (L1)", tasks: documentTasks },
    { title: "Nhà cung cấp nhờ liên hệ", tasks: contactTasks },
  ].filter((group) => group.tasks.length);
  const total = groups.reduce((sum, group) => sum + group.tasks.length, 0);

  return <>
    <PageHeader title="Việc cần làm" sub={total ? `Còn ${total} việc. Việc chờ lâu nhất ở trên cùng; bấm vào một dòng để làm.` : "Không còn việc nào đang chờ."} />
    {!total && <Card className="flex items-center gap-3 p-6 text-ink-700">
      <CircleCheckBig className="h-6 w-6 text-success" aria-hidden="true" />Bạn đã xử lý hết việc. Khi nhà cung cấp gửi hồ sơ mới, việc sẽ hiện ở đây.
    </Card>}
    <div className="space-y-5">
      {groups.map((group) => <section key={group.title} aria-label={group.title}>
        <h2 className="mb-2 text-[15px] font-bold text-ink-900">{group.title} · {group.tasks.length}</h2>
        <ul className="overflow-hidden rounded-xl border border-ink-200 bg-white">
          {group.tasks.map((task) => <li key={task.key} className="border-b border-ink-100 last:border-0">
            <Link href={task.href} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3.5 transition hover:bg-brand-50/50">
              <span className="min-w-0 flex-1 text-[14px] text-ink-800"><strong className="text-ink-900">{task.who}</strong> {task.what}</span>
              <span className="text-xs text-ink-500">{waited(task.since)}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-3 py-1.5 text-[13px] font-semibold text-white">{task.action}<ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
            </Link>
          </li>)}
        </ul>
      </section>)}
    </div>
  </>;
}

/** "chờ 3 ngày", dễ đọc hơn ngày giờ đầy đủ. */
function waited(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "vừa gửi";
  if (hours < 24) return `chờ ${hours} giờ`;
  return `chờ ${Math.floor(hours / 24)} ngày`;
}
