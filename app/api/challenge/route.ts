import { CHALLENGE_PURPOSES, isFormChallengeDisabled, issueFormChallenge, type ChallengePurpose } from "@/lib/security/challenge";
import { requestIp } from "@/lib/auth/abuse-protection";
import { gcRateLimit, rateLimit } from "@/lib/rfq/rate-limit";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * GET /api/challenge?purpose=login — phát challenge chống bot tự chủ cho form.
 *
 * Endpoint rẻ (random + HMAC, không đụng CSDL/dịch vụ ngoài) nhưng vẫn giới hạn
 * theo IP để không bị bắn loạt: widget chỉ gọi vài lần mỗi phiên form.
 * Trả về no-store để không ai nhận challenge cũ từ cache CDN.
 */
export async function GET(request: Request) {
  const purpose = new URL(request.url).searchParams.get("purpose") ?? "";
  if (!CHALLENGE_PURPOSES.includes(purpose as ChallengePurpose)) {
    return Response.json({ error: "unknown_purpose" }, { status: 400, headers: NO_STORE });
  }
  if (isFormChallengeDisabled()) {
    return Response.json({ disabled: true }, { headers: NO_STORE });
  }
  // Giới hạn nhẹ theo IP (và cả khi không đọc được IP thì theo vân UA) —
  // 90 lần / 15 phút là dư cho người thật kể cả thử lại vài lần.
  gcRateLimit();
  const ip = requestIp(request.headers);
  const fingerprint = crypto
    .createHash("sha256")
    .update(`challenge-fetch:v1|${ip ?? `ua|${request.headers.get("user-agent")?.slice(0, 200) ?? ""}`}`)
    .digest("hex");
  const limit = rateLimit(`challenge-fetch:${fingerprint}`, { windowMs: 15 * 60_000, max: 90 });
  if (!limit.ok) {
    return Response.json({ error: "too_many_requests" }, { status: 429, headers: NO_STORE });
  }
  return Response.json({ challenge: issueFormChallenge(purpose as ChallengePurpose) }, { headers: NO_STORE });
}
