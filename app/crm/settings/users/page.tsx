import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getStore } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { supabaseAuthReachable } from "@/lib/auth/authenticate";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { UserManager } from "@/components/user-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Người dùng & phân quyền" };

export default async function UsersPage() {
  const session = await requireSession();
  if (!hasPermission(session.role, "users.manage")) redirect("/crm/settings");

  const store = getStore();
  const users = await store.listUsers();
  const reachable = await supabaseAuthReachable();

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Cài đặt", href: "/crm/settings" },
              { label: "Người dùng & phân quyền" },
            ]}
          />
        }
        title="Người dùng & phân quyền"
        sub="Quản lý tài khoản nhân sự Vexim và tài khoản NCC theo từng nhóm."
        actions={
          <Link href="/crm/settings" className="btn btn-ghost">
            <ArrowLeft className="h-4 w-4" />
            Về Cài đặt
          </Link>
        }
      />
      <UserManager users={users} supabaseReachable={reachable} meId={session.uid} />
    </>
  );
}
