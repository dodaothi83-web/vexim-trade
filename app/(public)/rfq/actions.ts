"use server";

import { submitRfq } from "@/lib/rfq/submit";
import type { SubmitRfqInput } from "@/lib/rfq/submit";

export async function submitRfqAction(raw: SubmitRfqInput) {
  return submitRfq(raw);
}
