"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

/** Token đặc biệt: server đang bật CHALLENGE_DISABLED nên không cần giải. */
export const CHALLENGE_DISABLED_TOKEN = "__challenge_disabled__";

type ChallengeStatus = "loading" | "success" | "error";

const BATCH = 200;
/** Nhả luồng UI sau mỗi số lô này để trang không giật (setTimeout bị kẹp ~4ms/lần). */
const YIELD_EVERY_BATCHES = 5;
/** Trần tìm kiếm: vượt qua là báo lỗi và thử lại (thực tế không bao giờ chạm). */
const MAX_ATTEMPTS = 2_000_000;

function hexPrefix(buffer: ArrayBuffer, chars: number): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let index = 0; index < 8; index++) hex += bytes[index].toString(16).padStart(2, "0");
  return hex.slice(0, chars);
}

/**
 * Tìm nonce cho proof-of-work — tách riêng để kiểm thử được: client giải đúng cái
 * mà server (lib/security/challenge.ts) sẽ xác minh. Trả về token đầy đủ
 * "<challenge>.<nonce>" hoặc null nếu không giải nổi trong trần tìm kiếm.
 */
export async function solveFormChallenge(challenge: string): Promise<string | null> {
  const parts = challenge.split(".");
  const difficulty = Number(parts[2]);
  if (parts.length !== 4 || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 6) return null;
  const prefix = "0".repeat(difficulty);
  const encoder = new TextEncoder();
  let batchesSinceYield = 0;
  for (let base = 0; base < MAX_ATTEMPTS; base += BATCH) {
    const digests = await Promise.all(
      Array.from({ length: BATCH }, (_, offset) =>
        globalThis.crypto.subtle.digest("SHA-256", encoder.encode(`${parts[0]}:${base + offset}`))),
    );
    for (let offset = 0; offset < BATCH; offset++) {
      if (hexPrefix(digests[offset], difficulty) === prefix) return `${challenge}.${base + offset}`;
    }
    if (++batchesSinceYield >= YIELD_EVERY_BATCHES) {
      batchesSinceYield = 0;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return null;
}

/**
 * Widget challenge chống bot TỰ CHỦ thay cho Cloudflare Turnstile — không còn
 * request ra bên ngoài (điều khiến người dùng mạng VN bị chặn 401). Trình duyệt
 * tự lấy challenge từ chính site, tính proof-of-work ngầm (≈1 giây) rồi trả token.
 * Người thật không phải làm gì cả; bot script phải tốn công tính mới submit được.
 * Giao diện HOÀN TOÀN ẨN khi chạy bình thường (chỉ còn sr-only cho trình đọc màn
 * hình); một dòng lỗi + thử lại chỉ xuất hiện khi challenge không chạy được.
 */
export function FormChallenge({ purpose, onChange }: {
  purpose: string;
  onChange: (token: string | null) => void;
}) {
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState<ChallengeStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const fail = useCallback(() => {
    onChangeRef.current(null);
    setStatus("error");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    onChangeRef.current(null);

    (async () => {
      try {
        if (!globalThis.crypto?.subtle) throw new Error("no-webcrypto");
        const response = await fetch(`/api/challenge?purpose=${encodeURIComponent(purpose)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`challenge-fetch-${response.status}`);
        const payload = await response.json() as { challenge?: string; disabled?: boolean };
        if (cancelled) return;
        if (payload.disabled) {
          onChangeRef.current(CHALLENGE_DISABLED_TOKEN);
          setStatus("success");
          return;
        }
        const challenge = typeof payload.challenge === "string" ? payload.challenge : "";
        const solvedToken = await solveFormChallenge(challenge);
        if (cancelled) return;
        if (!solvedToken) throw new Error("challenge-unsolved");
        onChangeRef.current(solvedToken);
        setStatus("success");
        return;
      } catch {
        if (!cancelled) fail();
      }
    })();

    return () => { cancelled = true; };
  }, [attempt, fail, purpose]);

  const retry = () => setAttempt((value) => value + 1);

  // Bình thường (loading/success) widget HOÀN TOÀN ẨN: challenge chạy ngầm, không
  // còn khung "Security check complete" lộ giao diện kỹ thuật hay chiếm chỗ trong
  // form. Trình đọc màn hình vẫn có dòng trạng thái sr-only. CHỈ khi thật sự lỗi
  // (mất kết nối tới chính site, trình duyệt không có WebCrypto) mới hiện một dòng
  // nhỏ kèm nút thử lại — vì khi đó nút submit đang bị khóa, ẩn luôn thì người dùng
  // không biết vì sao không bấm được.
  return (
    <div data-form-challenge-status={status}>
      {status !== "error" && (
        <p role="status" className="sr-only">
          {status === "success" ? "Security check complete" : "Loading security check…"}
        </p>
      )}
      {status === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[12.5px] text-ink-600">
          <span className="inline-flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            We couldn’t complete the security check.
          </span>
          <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-bold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </button>
        </div>
      )}
      <noscript><p className="mt-2 text-[12px] text-red-600">Please enable JavaScript to complete the security check.</p></noscript>
    </div>
  );
}
