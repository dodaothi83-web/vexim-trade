import type { ReactNode } from "react";

import { dataStatus, getStore } from "@/lib/db";
import { supabaseProbe } from "@/lib/db";
import { emailMode } from "@/lib/config";
import { requireSession } from "@/lib/auth/session";
import { permissionsFor } from "@/lib/auth/permissions";
import { Sidebar } from "@/components/sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Chưa đăng nhập thì đưa về /login (mọi trang trong nhóm này đều được bảo vệ)
  const session = await requireSession();

  // Thử Supabase một lần thật nhẹ để biết có kết nối được hay không
  try {
    await supabaseProbe();
  } catch {
    /* bỏ qua */
  }

  // Số thư đến chưa đọc cho badge ở menu Hộp thư
  let unreadMail = 0;
  if (permissionsFor(session.role).includes("mail.view")) {
    unreadMail = await getStore()
      .listMessages(500)
      .then((ms) => ms.filter((m) => m.kind === "inbound" && !m.read_at).length)
      .catch(() => 0);
  }

  let dbMode: "supabase" | "local" = "local";
  let dbDegraded = false;
  try {
    const status = dataStatus();
    dbMode = status.mode;
    dbDegraded = status.degraded;
  } catch {
    dbMode = "local";
  }

  return (
    <>
      <Sidebar
        dataMode={dbMode}
        dataDegraded={dbDegraded}
        emailMode={emailMode()}
        session={{
          name: session.name,
          email: session.email,
          role: session.role,
        }}
        permissions={permissionsFor(session.role)}
        unreadMail={unreadMail}
      />
      <div className="lg:pl-60">
        <main className="mx-auto min-h-screen w-full max-w-[1500px] px-4 pt-16 pb-16 sm:px-6 lg:px-8 lg:pt-8">
          {children}
        </main>
      </div>
    </>
  );
}
