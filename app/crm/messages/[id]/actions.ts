"use server";

import { revalidatePath } from "next/cache";

import { hasPermission } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { unansweredNeedsStaff } from "@/lib/chat/core";
import { refreshCrmBadges } from "@/lib/crm/badges";
import { getStore } from "@/lib/db";

/**
 * Nhân viên ghi "đã liên hệ nhà cung cấp" cho một cuộc đã quá 48 giờ không trả lời.
 * Chỉ ghi mốc xử lý để việc rời khỏi "Việc cần làm"; không gửi tin vào cuộc trò chuyện và
 * không báo gì cho hai bên. Người mua nhắn thêm mà vẫn không ai trả lời thì việc mở lại.
 */
export async function markUnansweredHandledAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "rfq.view")) return;
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{8,64}$/i.test(id)) return;
  const store = getStore();
  const conversation = await store.getChatConversation(id);
  if (!conversation || !unansweredNeedsStaff(conversation)) return;
  await store.updateChatConversation(id, {
    unanswered_handled_at: new Date().toISOString(),
    unanswered_handled_by: session.email ?? session.uid,
  });
  revalidatePath(`/crm/messages/${id}`);
  revalidatePath("/crm/messages");
  revalidatePath("/crm/tasks");
  refreshCrmBadges();
}
