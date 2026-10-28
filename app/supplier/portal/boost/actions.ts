"use server";

import { getSession } from "@/lib/auth/session";
import type { RequestResult } from "./types";

/** Reject stale clients and forged submissions from the retired consultation flow. */
export async function submitSponsoredRequestAction(_previous: RequestResult, _form: FormData): Promise<RequestResult> {
  const session = await getSession();
  if (!session || session.role !== "supplier") return { ok: false, message: "Vui lòng đăng nhập cổng nhà cung cấp." };
  return { ok: false, message: "Yêu cầu tư vấn đẩy sản phẩm đã ngừng nhận. Chức năng tự mua gói đang được chuẩn bị." };
}
