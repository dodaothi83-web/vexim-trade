#!/usr/bin/env node
/**
 * Kiểm tra sau deploy: bảo đảm bot tìm kiếm và bot AI không bị chặn ngoài ý muốn.
 *
 * Chạy:  npm run check:ai-crawl -- [baseUrl]
 *        node scripts/check-ai-crawlability.mjs https://www.veximtrade.com
 *
 * Mặc định kiểm tra bản production. Script thoát mã 1 nếu:
 *  - robots.txt không tải được, chặn toàn bộ website, hoặc thiếu khai báo bot AI;
 *  - trang chủ trả lỗi, bị gắn noindex, hoặc thiếu dữ liệu có cấu trúc;
 *  - llms.txt không tải được.
 */

const base = (process.argv[2] || process.env.CHECK_BASE_URL || "https://www.veximtrade.com").replace(/\/+$/, "");
const failures = [];
const notes = [];

function fail(message) { failures.push(message); }
function pass(message) { notes.push(`OK  ${message}`); }

async function fetchText(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${base}${path}`, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "VeximCrawlCheck/1.0 (+https://www.veximtrade.com)" },
    });
    return { res, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

/** Tách robots.txt thành các nhóm theo User-agent để kiểm tra từng nhóm bot. */
function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) { current = null; continue; }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (current && (field === "allow" || field === "disallow")) {
      current.rules.push({ field, value });
    }
  }
  return groups;
}

function groupBlocksAll(group) {
  if (!group) return false;
  const disallowsAll = group.rules.some((r) => r.field === "disallow" && r.value === "/");
  const allowsRoot = group.rules.some((r) => r.field === "allow" && r.value === "/");
  return disallowsAll && !allowsRoot;
}

async function checkRobots() {
  let result;
  try {
    result = await fetchText("/robots.txt");
  } catch (e) {
    fail(`Không tải được /robots.txt: ${e.message}`);
    return;
  }
  const { res, text } = result;
  if (res.status !== 200) { fail(`/robots.txt trả mã ${res.status}`); return; }

  const groups = parseRobots(text);
  const wildcard = groups.find((g) => g.agents.includes("*"));
  if (!wildcard) fail("robots.txt thiếu nhóm User-agent: *");
  else if (groupBlocksAll(wildcard)) fail("robots.txt đang chặn toàn bộ website với mọi bot (Disallow: /)");
  else pass("robots.txt không chặn toàn bộ website");

  for (const bot of ["gptbot", "oai-searchbot", "claudebot", "perplexitybot"]) {
    const group = groups.find((g) => g.agents.includes(bot));
    if (!group) { fail(`robots.txt chưa khai báo tường minh bot ${bot}`); continue; }
    if (groupBlocksAll(group)) fail(`robots.txt đang chặn toàn bộ website với bot ${bot}`);
  }
  if (!failures.some((f) => f.includes("bot"))) pass("Các bot AI chính đã được khai báo tường minh và không bị chặn toàn site");

  if (!/^sitemap:\s*\S+/im.test(text)) fail("robots.txt thiếu dòng Sitemap");
  else pass("robots.txt có khai báo Sitemap");
}

async function checkHomepage() {
  let result;
  try {
    result = await fetchText("/");
  } catch (e) {
    fail(`Không tải được trang chủ: ${e.message}`);
    return;
  }
  const { res, text } = result;
  if (res.status !== 200) { fail(`Trang chủ trả mã ${res.status}`); return; }

  const headerRobots = (res.headers.get("x-robots-tag") || "").toLowerCase();
  if (headerRobots.includes("noindex")) fail(`Trang chủ bị gắn X-Robots-Tag: ${headerRobots}`);
  const metaRobots = text.match(/<meta[^>]+name=["']robots["'][^>]*>/i)?.[0]?.toLowerCase() || "";
  if (metaRobots.includes("noindex")) fail("Trang chủ có meta robots chứa noindex");
  if (!headerRobots.includes("noindex") && !metaRobots.includes("noindex")) pass("Trang chủ không bị noindex");

  if (!text.includes("application/ld+json")) fail("Trang chủ thiếu dữ liệu có cấu trúc JSON-LD");
  else pass("Trang chủ có dữ liệu có cấu trúc JSON-LD");
}

async function checkLlms() {
  let result;
  try {
    result = await fetchText("/llms.txt");
  } catch (e) {
    fail(`Không tải được /llms.txt: ${e.message}`);
    return;
  }
  if (result.res.status !== 200) { fail(`/llms.txt trả mã ${result.res.status}`); return; }
  if (!result.text.includes("# Vexim Trade")) fail("/llms.txt không có tiêu đề mong đợi");
  else pass("/llms.txt tải được và đúng định dạng");
}

console.log(`Kiểm tra khả năng bot truy cập tại ${base}`);
await checkRobots();
await checkHomepage();
await checkLlms();

for (const note of notes) console.log(note);
if (failures.length) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  console.error(`Kết quả: ${failures.length} lỗi. Cần xử lý trước khi coi deploy là hoàn tất.`);
  process.exit(1);
}
console.log("Kết quả: đạt. Bot tìm kiếm và bot AI truy cập được nội dung công khai.");
