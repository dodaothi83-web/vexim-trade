import { PageHeader } from "@/components/page-header";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePagePermission } from "@/lib/auth/session";
import { unansweredNeedsStaff } from "@/lib/chat/core";
import { getStore } from "@/lib/db";
import { isPartnerL2, l2ScopeMatchesSupplier } from "@/lib/l2-scope";
import { auditHref } from "@/lib/verification";
import { isOverdue, TASK_ORDER, TaskList, type Task, type TaskType } from "./task-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Việc cần làm" };

/**
 * Một danh sách duy nhất cho người vận hành: mỗi dòng là một việc, bấm vào là làm.
 * Việc chờ lâu nhất đứng đầu. Chứng từ xuất khẩu mở trang xét nhanh hai nút;
 * các việc khác mở đúng trang hiện có cho đến khi được làm gọn tiếp.
 */
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ type?: string; overdue?: string }> }) {
  const sp = await searchParams;
  const type: TaskType | "all" = TASK_ORDER.includes(sp.type as TaskType) ? sp.type as TaskType : "all";
  const session = await requirePagePermission("verifications.view", "/crm/dashboard");
  const store = getStore();
  const [verifications, submissions, suppliers, requests, chats] = await Promise.all([
    store.listVerifications(),
    store.listSubmissions().catch(() => []),
    store.listSuppliers(),
    store.listSupplierVerificationRequests().catch(() => []),
    // Chat người mua ↔ nhà cung cấp chỉ dành cho người có quyền xem RFQ (như trang Tin nhắn).
    hasPermission(session.role, "rfq.view") ? store.listChatConversations({ limit: 1000 }).catch(() => []) : [],
  ]);
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const name = (id: string) => supplierById.get(id)?.name ?? "Nhà cung cấp";
  const open = (status: string) => ["in_progress", "scheduled", "submitted"].includes(status);
  const oldestFirst = (a: Task, b: Task) => a.since.localeCompare(b.since);

  const exportTasks: Task[] = [
    ...submissions.filter((s) => s.target_level === 3 && s.status === "pending_review").map((s) => ({
      key: `s-${s.id}`, type: "export" as const, who: name(s.supplier_id), what: "Gửi chứng từ xuất khẩu, chờ quyết định",
      since: s.submitted_at ?? s.updated_at, href: `/crm/tasks/export/s-${s.id}`, action: "Xem và quyết định",
    })),
    ...verifications.filter((v) => v.target_level === 3 && open(v.status)).map((v) => ({
      key: `v-${v.id}`, type: "export" as const, who: name(v.supplier_id), what: "Chứng từ xuất khẩu đang chờ quyết định",
      since: v.updated_at, href: `/crm/tasks/export/v-${v.id}`, action: "Xem và quyết định",
    })),
  ].sort(oldestFirst);

  const factoryTasks: Task[] = [
    ...submissions.filter((s) => s.target_level === 2 && s.status === "pending_review").map((s) => ({
      key: `s-${s.id}`, type: "factory" as const, who: name(s.supplier_id), what: isPartnerL2(s) ? "Đặt lịch gọi nhà máy đối tác, chờ chốt giờ" : "Đặt lịch gọi nhà máy, chờ chốt giờ",
      since: s.submitted_at ?? s.updated_at, href: `/crm/verifications/submissions/${s.id}`, action: "Chốt giờ",
    })),
    ...verifications.filter((v) => v.target_level === 2 && open(v.status)).map((v) => ({
      key: `v-${v.id}`, type: "factory" as const, who: name(v.supplier_id), what: "Đã chốt lịch gọi, chờ ghi kết quả",
      since: v.updated_at, href: auditHref(v.supplier_id, 2, v.id), action: "Mở cuộc gọi",
    })),
  ].sort(oldestFirst);

  const documentTasks: Task[] = verifications.filter((v) => v.target_level === 1 && open(v.status)).map((v) => ({
    key: `v-${v.id}`, type: "documents" as const, who: name(v.supplier_id), what: "Gửi giấy tờ doanh nghiệp, chờ duyệt",
    since: v.updated_at, href: auditHref(v.supplier_id, 1, v.id), action: "Mở giấy tờ",
  })).sort(oldestFirst);

  const contactTasks: Task[] = requests.filter((r) => r.status !== "contacted" && !verifications.some((v) =>
    v.supplier_id === r.supplier_id && v.target_level === r.target_level && v.status === "approved" &&
    l2ScopeMatchesSupplier(v, supplierById.get(r.supplier_id)?.supplier_type))).map((r) => ({
    key: `r-${r.supplier_id}-${r.target_level}`, type: "contact" as const, who: name(r.supplier_id),
    what: r.target_level === 2 ? "Nhờ Vexim liên hệ để xác minh nhà máy" : "Nhờ Vexim liên hệ về chứng từ xuất khẩu",
    since: r.requested_at, href: `/crm/suppliers/${r.supplier_id}`, action: "Gọi cho nhà cung cấp",
  })).sort(oldestFirst);

  // Người mua nhắn quá 48 giờ không được trả lời: gọi nhà cung cấp, rồi ghi "đã liên hệ".
  const unansweredTasks: Task[] = chats.filter(unansweredNeedsStaff).map((c) => ({
    key: `c-${c.id}`, type: "buyer" as const, who: name(c.supplier_id), what: `Chưa trả lời người mua${c.product_name ? ` về ${c.product_name}` : ""} quá 48 giờ`,
    since: c.last_message_at ?? c.created_at, href: `/crm/messages/${c.id}`, action: "Liên hệ nhà cung cấp",
  })).sort(oldestFirst);

  const tasks: Task[] = [...unansweredTasks, ...exportTasks, ...factoryTasks, ...documentTasks, ...contactTasks];
  const overdue = tasks.filter((t) => isOverdue(t)).length;

  return <>
    <PageHeader title="Việc cần làm" sub={tasks.length ? `${tasks.length} việc đang chờ${overdue ? `, ${overdue} việc quá hạn` : ""}. Bấm vào một dòng để làm.` : "Không còn việc nào đang chờ."} />
    <TaskList tasks={tasks} type={type} overdueOnly={sp.overdue === "1"} />
  </>;
}
