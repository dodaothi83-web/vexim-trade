import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { supportConversationViews } from "@/lib/chat/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hộp chat với người mua trong CRM. `filter`: mine | unassigned | all. */
export async function GET(request: Request) {
  const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const session = await requirePermission("support.view");
  if (!session) return json({ error: "forbidden" }, 403);
  const filter = new URL(request.url).searchParams.get("filter");
  try {
    const store = getStore();
    const rows = await store.listSupportConversations(filter === "mine" ? { assignedTo: session.uid } : filter === "unassigned" ? { assignedTo: null } : {});
    const conversations = await supportConversationViews(store, rows);
    return json({ conversations, unread: conversations.filter((c) => c.unread).length, me: session.uid });
  } catch (error) {
    console.error("[support] staff list failed", error);
    return json({ error: "unavailable" }, 503);
  }
}
