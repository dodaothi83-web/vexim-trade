#!/usr/bin/env node
/**
 * Kiểm tra kết nối Supabase của Vexim Trade CRM.
 *
 *   npm run check:supabase
 *
 * Script sẽ lần lượt:
 *   1. Đọc .env.local / .env, hiển thị dự án đang cấu hình.
 *   2. Phân giải DNS + mở TLS tới <ref>.supabase.co:443.
 *   3. Gọi REST API bằng key đang cấu hình (mặc định service_role).
 *   4. Kiểm tra từng bảng của schema (supabase/schema.sql) đã tạo chưa.
 *
 * Mã thoát: 0 = sẵn sàng · 1 = thiếu schema/bảng · 2 = không kết nối được.
 */

import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import tls from "node:tls";

const ROOT = process.cwd();
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const green = (t) => c("32", t);
const red = (t) => c("31", t);
const yellow = (t) => c("33", t);
const dim = (t) => c("90", t);
const bold = (t) => c("1", t);

const okMark = green("✔");
const badMark = red("✖");
const warnMark = yellow("▲");

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = {
  ...parseEnvFile(path.join(ROOT, ".env")),
  ...parseEnvFile(path.join(ROOT, ".env.local")),
};
const env = { ...fileEnv, ...process.env };

const rawUrl = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const url = rawUrl.replace(/\/+$/, "");
const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const anonKey = (env.SUPABASE_ANON_KEY ?? "").trim();
const key = serviceKey || anonKey;

console.log(bold("\nVEXIM TRADE CRM — kiểm tra kết nối Supabase"));
console.log(dim("─".repeat(58)));

if (!url || !key) {
  console.log(`${badMark} Chưa cấu hình SUPABASE_URL và/hoặc khoá Supabase.`);
  console.log(
    dim("  → Copy .env.example thành .env.local rồi điền Project URL + service_role key."),
  );
  process.exit(2);
}

const projectRefInUrl = /^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)$/i.exec(url);
const jwtRef = (() => {
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8"),
    );
    return { ref: payload.ref, role: payload.role, exp: payload.exp };
  } catch {
    return null;
  }
})();

console.log(`  URL          : ${bold(url)}`);
console.log(`  Dự án (ref)  : ${jwtRef?.ref ?? projectRefInUrl?.[1] ?? "?"}`);
console.log(
  `  Khoá đang dùng: ${serviceKey ? "service_role" : "anon"}${jwtRef?.role ? dim(` (JWT role: ${jwtRef.role})`) : ""}`,
);
if (jwtRef?.exp) {
  const exp = new Date(jwtRef.exp * 1000);
  const daysLeft = Math.round((exp.getTime() - Date.now()) / 86_400_000);
  console.log(
    `  Khoá hết hạn : ${exp.toISOString().slice(0, 10)} ${daysLeft > 0 ? dim(`(còn ${daysLeft} ngày)`) : red("(ĐÃ HẾT HẠN)")}`,
  );
}
if (jwtRef?.ref && projectRefInUrl?.[1] && jwtRef.ref !== projectRefInUrl[1]) {
  console.log(
    `${warnMark} Khoá thuộc dự án "${jwtRef.ref}" nhưng URL trỏ tới "${projectRefInUrl[1]}" — kiểm tra lại!`,
  );
}
console.log(dim("─".repeat(58)));

const host = new URL(url).hostname;

// 1) DNS -------------------------------------------------------------------
console.log(bold("1. Phân giải DNS"));
let addresses = [];
try {
  addresses = await dns.lookup(host, { all: true });
  console.log(`  ${okMark} ${host} → ${addresses.map((a) => a.address).join(", ")}`);
} catch (err) {
  console.log(`  ${badMark} Không phân giải được ${host}: ${err.code ?? err.message}`);
  console.log(red("\nKhông kết nối được Supabase (lỗi DNS). Dừng kiểm tra."));
  process.exit(2);
}

// 2) TLS/TCP ---------------------------------------------------------------
console.log(bold("\n2. Mở kết nối HTTPS (443)"));
try {
  await new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port: 443, servername: host, timeout: 12_000 },
      () => {
        socket.end();
        resolve();
      },
    );
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("quá thời gian chờ (12s)"));
    });
    socket.on("error", reject);
  });
  console.log(`  ${okMark} Đã bắt tay TLS thành công tới ${host}:443`);
} catch (err) {
  console.log(`  ${badMark} Không mở được kết nối: ${err.code ?? err.message}`);
  console.log(
    red(
      "\nKhông kết nối được Supabase từ máy này.\n" +
        "  • Sandbox/preview của Arena: chỉ mở Internet tới github/npm/pypi — Supabase bị chặn,\n" +
        "    đây là giới hạn của môi trường, không phải lỗi cấu hình.\n" +
        "  • Máy của bạn: kiểm tra mạng, VPN, tường lửa rồi chạy lại.\n" +
        "  • Xem mục “Kiểm tra kết nối Supabase” trong README.md.",
    ),
  );
  process.exit(2);
}

// 3) REST API --------------------------------------------------------------
async function apiGet(pathname, extraHeaders = {}) {
  const res = await fetch(`${url}${pathname}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...extraHeaders },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

console.log(bold("\n3. Gọi REST API"));
const root = await apiGet("/rest/v1/");
if ([200, 400].includes(root.res.status) || root.res.status < 500) {
  console.log(`  ${okMark} REST API trả lời (HTTP ${root.res.status}) — key được chấp nhận.`);
} else {
  console.log(`  ${badMark} REST API lỗi HTTP ${root.res.status}: ${JSON.stringify(root.body)}`);
}

if (root.res.status === 401) {
  console.log(
    red("\nSupabase từ chối khoá (401). Kiểm tra SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY."),
  );
  process.exit(2);
}

// 4) Bảng của schema -------------------------------------------------------
const TABLES = [
  "suppliers",
  "supplier_products",
  "buyers",
  "buyer_activities",
  "email_messages",
];

console.log(bold("\n4. Kiểm tra các bảng (supabase/schema.sql)"));
let missing = [];
for (const table of TABLES) {
  try {
    const { res, body } = await apiGet(`/rest/v1/${table}?select=id&limit=1`, {
      Prefer: "count=exact",
      Range: "0-0",
    });
    if (res.status === 200 || res.status === 206) {
      const count = (res.headers.get("content-range") ?? "").split("/")[1] ?? "?";
      const rows = Array.isArray(body) ? body.length : 0;
      const empty = count === "0" || (count === "?" && rows === 0);
      console.log(
        `  ${okMark} ${table.padEnd(18)} ${empty ? yellow("bảng trống (chưa có dữ liệu)") : `đã có ${count} bản ghi`}`,
      );
    } else if (res.status === 404 || body?.code === "PGRST205") {
      console.log(`  ${badMark} ${table.padEnd(18)} ${red("chưa tồn tại")}`);
      missing.push(table);
    } else {
      console.log(
        `  ${warnMark} ${table.padEnd(18)} HTTP ${res.status} ${dim(JSON.stringify(body)?.slice(0, 110) ?? "")}`,
      );
    }
  } catch (err) {
    console.log(`  ${badMark} ${table.padEnd(18)} lỗi: ${err.code ?? err.message}`);
    missing.push(table);
  }
}

console.log(dim("─".repeat(58)));
if (missing.length) {
  console.log(
    yellow(
      `KẾT LUẬN: kết nối OK nhưng còn ${missing.length} bảng chưa có.\n` +
        "  → Mở Supabase → SQL Editor → dán toàn bộ nội dung supabase/schema.sql → Run.",
    ),
  );
  process.exit(1);
}

console.log(
  green("KẾT LUẬN: Supabase sẵn sàng — app sẽ dùng dữ liệu thật khi chạy `npm run dev`."),
);
console.log(
  dim(
    "  Nhắc: nếu chạy trong sandbox/preview (Internet bị giới hạn), app tự chuyển sang\n" +
      "  dữ liệu tạm và hiện băng cảnh báo vàng — xem README.md.",
  ),
);
process.exit(0);
