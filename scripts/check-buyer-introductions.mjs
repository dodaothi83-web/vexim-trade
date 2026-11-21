// node --experimental-strip-types --no-warnings scripts/check-buyer-introductions.mjs
// Người mua nhận giới thiệu (đợt 1): chỉ tính đồng ý khi người mua tự bấm, mặc định tắt, mời một lần
// và nhắc một lần, "không hỏi lại", ngành đọc từ danh mục đang đăng, không lộ danh tính, không theo dõi.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const i = await import("../lib/buyer/introductions.ts");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
const now = new Date("2026-12-10T00:00:00Z");
const base = { verified_at: "2026-11-01T00:00:00Z", marketing_opt_in: false, introductions: {}, created_at: "2026-12-01T00:00:00Z" };

// 1. Đọc dữ liệu: chỉ mã ngành hợp lệ, bỏ trùng, mốc thời gian hợp lệ.
assert.deepEqual(i.readIntroductions({ categories: [A, A, "x", B.toUpperCase()], consent_source: "hack", invite_sent_at: "nope" }), { categories: [A, B] });
assert.deepEqual(i.readIntroductions(null), {});

// 2. Đang nhận giới thiệu: phải bật VÀ có ngành VÀ đã xác thực. Mặc định tắt.
assert.equal(i.receivesIntroductions(base), false);
assert.equal(i.receivesIntroductions({ ...base, marketing_opt_in: true }), false, "Bật mà chưa chọn ngành thì chưa nhận");
assert.equal(i.receivesIntroductions({ ...base, marketing_opt_in: true, introductions: { categories: [A] } }), true);
assert.equal(i.receivesIntroductions({ ...base, verified_at: null, marketing_opt_in: true, introductions: { categories: [A] } }), false);

// 3. Đồng ý ghi thời điểm, nguồn; "add" gộp ngành.
const c = i.withConsent({ categories: [A] }, [B], "rfq", now, "add");
assert.deepEqual(c.categories, [A, B]);
assert.equal(c.consent_source, "rfq");
assert.equal(c.consent_at, now.toISOString());
assert.deepEqual(i.withConsent({ categories: [A] }, [B], "account", now).categories, [B], "Tài khoản: thay danh sách");

// 4. Thư mời: một lần; nhắc một lần sau 14 ngày; "không hỏi lại" là dừng hẳn.
assert.equal(i.inviteEligible(base), true);
assert.equal(i.inviteEligible({ ...base, introductions: { invite_sent_at: "2026-11-20T00:00:00Z" } }), false, "Không mời lần hai");
assert.equal(i.inviteEligible({ ...base, introductions: { invite_declined_at: "2026-11-20T00:00:00Z" } }), false);
assert.equal(i.reminderDue({ ...base, introductions: { invite_sent_at: "2026-11-20T00:00:00Z" } }, now), true);
assert.equal(i.reminderDue({ ...base, introductions: { invite_sent_at: "2026-12-01T00:00:00Z" } }, now), false, "Chưa đủ 14 ngày");
assert.equal(i.reminderDue({ ...base, introductions: { invite_sent_at: "2026-11-01T00:00:00Z", invite_reminded_at: "2026-11-15T00:00:00Z" } }, now), false, "Chỉ nhắc một lần");
assert.equal(i.reminderDue({ ...base, introductions: { invite_sent_at: "2026-11-01T00:00:00Z", invite_declined_at: "2026-11-02T00:00:00Z" } }, now), false);

// 5. Thư chào mừng: tài khoản mới sau 24 giờ; người mua cũ không nhận; có lời mời khi chưa chọn ngành.
assert.equal(i.welcomeDue(base, now), true);
assert.equal(i.welcomeDue({ ...base, created_at: "2026-11-10T00:00:00Z" }, now), false, "Tài khoản cũ nhận thư mời của nhân viên, không nhận thư chào mừng");
assert.equal(i.welcomeDue({ ...base, created_at: "2026-12-09T12:00:00Z" }, now), false, "Chưa đủ 24 giờ");
assert.equal(i.welcomeIncludesInvite({ ...base, marketing_opt_in: true, introductions: { categories: [A] } }), false, "Đã chọn ngành thì không mời lại");

// 6. Lời mời đúng lúc: không hỏi người đang nhận; 30 ngày sau "No"; không hỏi người đã từ chối.
assert.equal(i.canPromptIntroductions(base, now), true);
assert.equal(i.canPromptIntroductions({ ...base, introductions: { prompt_dismissed_at: "2026-12-01T00:00:00Z" } }, now), false);
assert.equal(i.canPromptIntroductions({ ...base, introductions: { prompt_dismissed_at: "2026-10-01T00:00:00Z" } }, now), true);
assert.equal(i.showOnboarding({ ...base, introductions: { onboarding_done_at: "2026-12-01T00:00:00Z" } }), false, "Skip là thôi");

// 7. Ngành trong thư: ngành liên quan lên đầu, rồi nhiều sản phẩm nhất, tối đa 8.
const cats = Array.from({ length: 12 }, (_, k) => ({ id: `id${k}`, products: k }));
const picked = i.emailCategories(cats, ["id2"]);
assert.equal(picked.length, i.INTRO_EMAIL_MAX_CATEGORIES);
assert.equal(picked[0].id, "id2");
assert.equal(picked[1].id, "id11");

// 8. Máy chủ: ngành đọc từ danh mục đang đăng; link ký; không theo dõi mở thư; thư có "Don't ask me again".
const server = read("lib/buyer/introductions-server.ts");
assert.match(server, /snapshot\.categories\.filter\(\(c\) => !c\.parent_id && c\.status === "published" && c\.is_published\)/, "Ngành lấy từ danh mục đang đăng, không gắn cứng");
assert.match(server, /createHmac\("sha256", getAuthSecret\(\)\)\.update\(`buyer-intro:\$\{body\}`\)/);
assert.match(server, /timingSafeEqual/);
assert.match(server, /Don't ask me again/);
assert.doesNotMatch(server, /pixel|open-tracking|<img[^>]*track/i, "Không theo dõi mở thư");
const actions = read("app/(public)/buyer/introductions/actions.ts");
assert.match(actions, /verifyIntroToken\(token\)/, "Danh tính từ link ký");
assert.match(actions, /getBuyerSession\(\)/, "Hoặc từ phiên đăng nhập");
assert.match(actions, /allowed\.has\(id\)/, "Chỉ nhận ngành đang đăng");
assert.match(read("components/buyer-introductions.tsx"), /function IntroStopForm[\s\S]*stopInvitesWithTokenAction/, "Ngừng mời phải bấm nút (máy quét thư mở link không tự huỷ)");
assert.match(read("app/crm/buyers/introductions/actions.ts"), /guard\("buyers\.manage"\)[\s\S]*filter\(inviteEligible\)/, "Nhân viên gửi đợt mời: đúng quyền, đúng người");
assert.doesNotMatch(read("app/crm/buyers/introductions/page.tsx"), /\.email\b/, "Trang CRM không liệt kê email");
assert.match(read("app/api/cron/rfq-sla/route.ts"), /runIntroductionMail\(\)/, "Thư chào mừng, thư nhắc chạy hằng ngày");
assert.match(read("supabase/migrations/20261222_buyer_introductions.sql"), /add column if not exists introductions jsonb not null default '\{\}'::jsonb/);
console.log("✅ Người mua nhận giới thiệu: tự bấm mới tính đồng ý, mời một lần nhắc một lần, không hỏi lại, ngành từ danh mục đang đăng, không lộ danh tính, không theo dõi mở thư.");
