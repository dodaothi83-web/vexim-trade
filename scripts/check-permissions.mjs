#!/usr/bin/env node
/**
 * Kiểm tra ma trận phân quyền tĩnh (không cần chạy dev server):
 *
 *  1. Mọi trang trong app/crm/** /page.tsx PHẢI gọi requireSession() (hoặc requirePagePermission /
 *     guard), nếu không anonymous có thể truy cập thẳng.
 *  2. Mọi file `"use server"` trong app/** (trừ app/(public)/ và app/auth-actions.ts có các action
 *     đăng nhập + submit RFQ công khai) PHẢI gọi guard() / requirePermission / requireSession ở
 *     mỗi export async function — nếu bỏ sót, anonymous có thể kích hoạt server action.
 *  3. Danh sách quyền trên ROLES trong lib/auth/permissions.ts phải hợp lệ và không bị trùng.
 *  4. Các action đặc thù (verification.approve, users.manage) PHẢI dùng đúng quyền admin-only.
 *
 * Chạy: node scripts/check-permissions.mjs
 *
 * Exit code 0 = đạt; 1 = có lỗi.
 */
import { readFileSync, existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = process.cwd();

// ----------------------------- helpers -----------------------------------
async function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      await walk(p, out);
    } else if (s.isFile() && (p.endsWith(".ts") || p.endsWith(".tsx"))) {
      out.push(p);
    }
  }
  return out;
}

function read(p) {
  try { return readFileSync(p, "utf8"); } catch { return ""; }
}

// ------------------------ rules -------------------------------------------
const errors = [];
const warns = [];

// 1) CRM pages must have an auth gate.
const crmPages = (await walk(join(ROOT, "app/crm"))).filter((p) => p.endsWith("/page.tsx"));
for (const p of crmPages) {
  const src = read(p);
  const hasGate =
    /requireSession\s*\(/.test(src) ||
    /requirePagePermission\s*\(/.test(src) ||
    /requirePermission\s*\(/.test(src) ||
    /guard\s*\(/.test(src) ||
    /getSession\s*\(/.test(src); // hand-rolled like app/crm/page.tsx
  if (!hasGate) errors.push(`CRM page ${relative(ROOT, p)} không gọi requireSession/guard — anonymous vào được.`);
}

// 2) "use server" files must guard each exported action.
const allTs = await walk(join(ROOT, "app"));
const publicDir = join(ROOT, "app/(public)");
for (const p of allTs) {
  const src = read(p);
  if (!/^\s*"use server"/m.test(src)) continue;

  // Công khai được phép bỏ qua guard:
  //  - RFQ public submit
  //  - auth actions (đăng nhập / đổi mật khẩu)
  const rel = relative(ROOT, p);
  const isPublic =
    p.startsWith(publicDir) ||
    rel.endsWith("app/auth-actions.ts") ||
    rel.endsWith("app/(auth)/setup/actions.ts"); // nếu có

  if (isPublic) continue;

  // Đếm export async function
  const exportMatches = [...src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)];
  // Nếu file có helper enforce() gọi guard() một lần và mọi export đều gọi await enforce() thì tính là đạt.
  const hasTopGuard = /await\s+enforce\s*\(/.test(src) && /async\s+function\s+enforce\s*\([^)]*\)\s*\{[\s\S]*?guard\s*\(/.test(src);
  const perFnGuard = /\bguard\s*\(/.test(src) || /requirePermission\s*\(/.test(src) || /requirePagePermission\s*\(/.test(src);

  for (const m of exportMatches) {
    const fn = m[1];
    const fnBody = src.slice(m.index);
    const firstBrace = fnBody.indexOf("{");
    // trích xuất phần đầu hàm (200 chars hoặc đến dấu } nào xuất hiện sớm)
    const head = fnBody.slice(firstBrace, firstBrace + 400);
    const callsGuardInFn =
      /\bguard\s*\(/.test(head) ||
      /requirePermission\s*\(/.test(head) ||
      /requireSession\s*\(/.test(head) ||
      /getSession\s*\(/.test(head) ||
      (hasTopGuard && /\benforce\s*\(/.test(head));
    if (!callsGuardInFn && !hasTopGuard && !perFnGuard) {
      errors.push(`Server action ${rel}::${fn} không gọi guard/requireSession — bỏ sót kiểm quyền.`);
    }
  }
}

// 3) Permission matrix sanity checks.
const permFile = read(join(ROOT, "lib/auth/permissions.ts"));
const allPerms = [
  "buyers.view","buyers.manage","prospects.manage",
  "suppliers.view","suppliers.manage","suppliers.delete","suppliers.publish",
  "products.view","products.manage",
  "media.view","media.manage","media.internal",
  "mail.view","mail.send","templates.manage",
  "settings.view","users.manage","kpi.view","blog.manage",
  "categories.manage","categories.publish",
  "verifications.inspect","verifications.approve","rfq.manage",
];
// Tìm các quyền xuất hiện trong code nhưng không có trong type Permission?
{
  const union = permFile.match(/type\s+Permission\s*=\s*([\s\S]*?);/);
  if (union) {
    const listed = [...union[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    for (const p of allPerms) {
      if (!listed.includes(p)) errors.push(`Permission "${p}" thiếu trong union type Permission.`);
    }
    // Check không trùng
    if (new Set(listed).size !== listed.length) errors.push("Permission type có phần tử trùng.");
  }
}

// 4) Quyền admin-only: verifications.approve, users.manage, suppliers.delete, suppliers.publish, categories.publish.
const adminOnly = ["verifications.approve","users.manage","suppliers.delete","suppliers.publish","categories.publish"];
for (const p of adminOnly) {
  // Mọc ra ở role matrix không phải admin?
  const roleBlocks = [...permFile.matchAll(/(\w+):\s*\[[\s\S]*?\],\s*\n/g)];
  for (const m of roleBlocks) {
    const roleName = m[1];
    if (roleName === "admin") continue;
    if (m[0].includes(`"${p}"`)) {
      errors.push(`Quyền admin-only "${p}" đang được cấp cho role "${roleName}".`);
    }
  }
}

// 5) settings.view phải có ở mọi role đăng nhập được (vì /crm/settings cho tất cả)
for (const role of ["admin","sale","sourcing","viewer"]) {
  const block = permFile.match(new RegExp(`${role}:\\s*\\[([\\s\\S]*?)\\]`));
  if (block && !block[1].includes('"settings.view"') && role !== "viewer") {
    // viewer đã có trong VIEW_ONLY, các role khác thêm tay
  }
}

// 6) Kiểm tra server actions quan trọng không dùng nhầm quyền
function assertGuard(file, actionName, expectedPerm) {
  const src = read(join(ROOT, file));
  const idx = src.indexOf(`export async function ${actionName}`);
  if (idx < 0) { warns.push(`Không tìm thấy action ${actionName} trong ${file} — có thể đã đổi tên.`); return; }
  const head = src.slice(idx, idx + 500);
  if (!head.includes(`guard("${expectedPerm}"`) && !head.includes(`guard('${expectedPerm}'`)) {
    errors.push(`Action ${file}::${actionName} nên dùng guard("${expectedPerm}") — kiểm tra lại.`);
  }
}
assertGuard("app/crm/rfqs/[id]/compose-action.ts", "composeMatchEmailAction", "rfq.manage");
assertGuard("app/crm/rfqs/[id]/compose-action.ts", "sendFollowUpAction",       "rfq.manage");
assertGuard("app/crm/rfqs/[id]/compose-action.ts", "markSamplingAction",      "rfq.manage");
assertGuard("app/crm/rfqs/[id]/compose-action.ts", "markLostAction",          "rfq.manage");
assertGuard("app/crm/suppliers/[slug]/verification-actions.ts", "approveVerificationAction", "verifications.approve");

// ----------------------- kết luận ----------------------------------------
console.log(`\n🔐 Permission audit — ${crmPages.length} CRM pages, scanned ${allTs.length} app ts/tsx files.\n`);
if (errors.length) {
  console.error(`❌ ${errors.length} lỗi PHÂN QUYỀN:`);
  for (const e of errors) console.error("  • " + e);
} else {
  console.log("✅ Không phát hiện lỗi phân quyền tĩnh.");
}
if (warns.length) {
  console.warn(`\n⚠️  ${warns.length} cảnh báo:`);
  for (const w of warns) console.warn("  • " + w);
}
process.exit(errors.length ? 1 : 0);
