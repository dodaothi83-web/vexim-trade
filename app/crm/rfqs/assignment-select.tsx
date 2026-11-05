"use client";

import { assignRfqInlineAction } from "./actions-inline";

import type { RfqAssignee } from "@/lib/rfq/assignees";

export function RfqAssignmentSelect({ rfqId, assignedTo, users }: {
  rfqId: string;
  assignedTo: string | null;
  users: RfqAssignee[];
}) {
  return (
    <form action={assignRfqInlineAction} className="flex items-center gap-1">
      <input type="hidden" name="id" value={rfqId} />
      <select
        name="to"
        defaultValue={assignedTo ?? ""}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="input py-1 text-[12px]"
        aria-label="Phân công RFQ"
      >
        <option value="">— Chưa phân công —</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>{user.label}</option>
        ))}
      </select>
    </form>
  );
}
