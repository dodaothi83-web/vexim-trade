"use client";

import { assignRfqInlineAction } from "./actions-inline";

type AssignmentUser = { id: string; name: string | null; email: string };

export function RfqAssignmentSelect({ rfqId, assignedTo, users }: {
  rfqId: string;
  assignedTo: string | null;
  users: AssignmentUser[];
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
          <option key={user.id} value={user.id}>{user.name ?? user.email}</option>
        ))}
      </select>
    </form>
  );
}
