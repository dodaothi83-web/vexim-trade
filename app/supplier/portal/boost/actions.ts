"use server";

import { getSession } from "@/lib/auth/session";
import { getPortalMessages } from "@/lib/i18n/server";
import type { RequestResult } from "./types";

/** Reject stale clients and forged submissions from the retired consultation flow. */
export async function submitSponsoredRequestAction(_previous: RequestResult, _form: FormData): Promise<RequestResult> {
  const { m } = await getPortalMessages();
  const session = await getSession();
  if (!session || session.role !== "supplier") return { ok: false, message: m.boost.actions.signIn };
  return { ok: false, message: m.boost.actions.closed };
}
