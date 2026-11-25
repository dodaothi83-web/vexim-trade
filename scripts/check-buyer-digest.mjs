// node --experimental-strip-types --no-warnings scripts/check-buyer-digest.mjs
// Thư giới thiệu hằng tuần (đợt 2): tự tổng hợp từ nội dung đã duyệt, không lặp mục trong 4 tuần, không gửi
// thư rỗng, gói Pro xếp trước và độc quyền nhà cung cấp nổi bật, mùa vụ lấy từ lịch có sẵn, đúng mức nhận.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const d = await import("../lib/buyer/digest.ts");
const intro = await import("../lib/buyer/introductions.ts");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const now = new Date("2026-12-08T03:00:00Z"); // thứ Ba
const C = "11111111-1111-1111-1111-111111111111", P = "22222222-2222-2222-2222-222222222222";
const day = (n) => new Date(now.getTime() - n * 86_400_000).toISOString();
const product = (id, over = {}) => ({ id, name: id, href: `/p/${id}`, imagePath: null, categoryId: C, supplierId: "s1", pro: false, moq: "1 MT", leadTime: "14 days", price: null, createdAt: day(30), updatedAt: day(30), ...over });

// 1. Lịch gửi: thứ Ba sản phẩm, thứ Sáu thị trường (giờ VN); tuần ISO.
assert.equal(d.vietnamWeekday(now), 2);
assert.equal(d.DIGEST_DAY.products, 2);
assert.equal(d.DIGEST_DAY.brief, 5);
assert.equal(d.isoWeek(new Date("2026-12-08T00:00:00Z")), "2026-W50");

// 2. Sản phẩm: mới (14 ngày) hoặc cập nhật (7 ngày), đúng ngành; Pro trước; tối đa 6.
const list = [product("old"), product("new1", { createdAt: day(3), updatedAt: day(3) }), product("upd", { updatedAt: day(2) }),
  product("pro", { createdAt: day(5), updatedAt: day(5), pro: true }), product("other", { categoryId: P, createdAt: day(1), updatedAt: day(1) })];
const picked = d.pickProducts([C], list, new Map(), now);
assert.deepEqual(picked.map((p) => p.id), ["pro", "upd", "new1"]);
assert.equal(picked.find((p) => p.id === "upd").badge, "UPDATED");
assert.equal(d.pickProducts([C], Array.from({ length: 9 }, (_, k) => product(`n${k}`, { createdAt: day(1), updatedAt: day(1) })), new Map(), now).length, d.DIGEST_MAX_PRODUCTS);

// 3. Không lặp trong 4 tuần, trừ khi vừa cập nhật sau lần gửi.
const recent = new Map([["product:new1", day(1)], ["product:upd", day(6)]]);
assert.deepEqual(d.pickProducts([C], list, recent, now).map((p) => p.id), ["pro", "upd"], "upd cập nhật sau lần gửi nên được gửi lại; new1 thì không");

// 4. Nhà cung cấp nổi bật: chỉ danh sách Pro truyền vào, đúng ngành, tối đa 2, bỏ người vừa giới thiệu.
const sup = (id, cats = [C]) => ({ id, name: id, href: "/s", location: "VN", type: "Manufacturer", products: "", checks: [], categoryIds: cats });
assert.equal(d.pickFeatured([C], [sup("a"), sup("b"), sup("c"), sup("x", [P])], new Map(), now).length, 2);
assert.deepEqual(d.pickFeatured([C], [sup("a"), sup("b")], new Map([["supplier:a", day(3)]]), now).map((s) => s.id), ["b"]);

// 4b. Thứ tự gói trong thư: Pro → Premium → Basic, cùng gói thì mới cập nhật trước.
{
  const tiers = [product("basic", { createdAt: day(1), updatedAt: day(1) }), product("prem", { createdAt: day(4), updatedAt: day(4), premium: true }),
    product("pro2", { createdAt: day(6), updatedAt: day(6), pro: true }), product("prem2", { createdAt: day(2), updatedAt: day(2), premium: true })];
  assert.deepEqual(d.pickProducts([C], tiers, new Map(), now).map((p) => p.id), ["pro2", "prem2", "prem", "basic"], "Pro, then Premium, then Basic");
}

// 4c. Luân phiên công bằng khi đông: 60 nhà cung cấp Pro cùng ngành (hơn 53 tuần ISO), ai cũng tới lượt.
{
  const many = Array.from({ length: 60 }, (_, k) => sup(`s${String(k).padStart(2, "0")}`));
  const seen = new Set();
  for (let w = 0; w < 30; w++) {
    for (const s of d.pickFeatured([C], many, new Map(), new Date(now.getTime() + w * 7 * 86_400_000))) seen.add(s.id);
  }
  assert.equal(seen.size, 60, "With 60 Pro suppliers, every one is featured within 30 weeks (2 per week)");
  assert.equal(d.rotationWeek(new Date("2027-01-04T00:00:00Z")) - d.rotationWeek(new Date("2026-12-28T00:00:00Z")), 1, "The rotation week keeps counting across the new year");
}

// 5. Không gửi thư rỗng: thư sản phẩm cần ít nhất 2 mục; thư thị trường cần một bài.
const data = { products: [product("new1", { createdAt: day(3), updatedAt: day(3) })], suppliers: [], categories: [{ id: C, slug: "cashew", name: "Cashew kernels", harvest: null }], posts: [] };
assert.equal(d.buildProductsDigest([C], data, new Map(), now), null, "Chỉ 1 mục thì bỏ tuần này");
assert.equal(d.buildBriefDigest([C], data, new Map(), now), null);

// 6. Bài blog: đúng ngành trước, rồi bài tin chung; bài đã gửi thì không gửi lại; đoán ngành theo tên.
const cats = [{ id: C, slug: "cashew", name: "Cashew kernels" }, { id: P, slug: "pepper", name: "Pepper" }];
assert.deepEqual(d.postCategories({ title: "Vietnam cashew exports rise", excerpt: "", related: [] }, cats), [C]);
assert.deepEqual(d.postCategories({ title: "Anything", excerpt: "", related: [P] }, cats), [P], "Ngành nhân viên gắn được ưu tiên");
assert.deepEqual(d.postCategories({ title: "Vexim joins a trade show", excerpt: "", related: [] }, cats), []);
const posts = [{ id: "g", title: "General", href: "/b/g", excerpt: "", imageUrl: null, publishedAt: day(1), categoryIds: [] },
  { id: "c", title: "Cashew", href: "/b/c", excerpt: "", imageUrl: null, publishedAt: day(4), categoryIds: [C] },
  { id: "old", title: "Old", href: "/b/o", excerpt: "", imageUrl: null, publishedAt: day(40), categoryIds: [C] }];
assert.equal(d.pickPost([C], posts, new Map(), now).id, "c");
assert.equal(d.pickPost([C], posts, new Map([["post:c", day(2)]]), now).id, "g");
assert.equal(d.pickPost([P], posts.slice(1), new Map(), now), null);

// 7. Mùa vụ: lấy từ lịch có sẵn, vụ đang diễn ra hoặc bắt đầu trong 30 ngày.
const harvest = { windows: [{ label: "Main crop", start_month: 2, end_month: 5, regions: ["Binh Phuoc"] }, { label: "Late", start_month: 7, end_month: 8 }] };
const jan = new Date("2027-01-10T00:00:00Z");
assert.deepEqual(d.seasonWatch([C], [{ id: C, slug: "c", name: "Cashew kernels", harvest }], jan).map((s) => [s.label, s.now]), [["Main crop", false]]);
assert.equal(d.seasonWatch([C], [{ id: C, slug: "c", name: "Cashew kernels", harvest }], new Date("2027-03-10T00:00:00Z"))[0].now, true);

// 8. Mức nhận: mặc định 2 thư; "weekly" chỉ thư sản phẩm.
assert.equal(intro.introFrequency({}), "twice");
assert.equal(intro.introFrequency(intro.readIntroductions({ frequency: "weekly" })), "weekly");

// 9. Máy chủ: tự gửi (không có bước duyệt), tạm dừng khẩn cấp, mỗi tuần một lần, đếm bấm không có mã người mua, huỷ một bấm.
const server = read("lib/buyer/digest-server.ts");
assert.match(server, /if \(await digestPaused\(\)\) return \{ \.\.\.result, paused: true \}/);
assert.match(server, /kind === "brief" && introFrequency\(intro\) !== "twice"/, "Thư thị trường chỉ cho mức hai thư");
assert.match(server, /\.eq\("kind", kind\)\.eq\("week", week\)/, "Mỗi loại thư một lần mỗi tuần");
assert.match(server, /"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"/);
assert.match(server, /supplierPlanRules\(s, now, catalog\)\.plan : "basic"/, "Gói đọc từ bảng gói hiện hành; gói hết hạn tính là Basic");
assert.match(server, /const pro = \(supplierId: string\) => planOf\(supplierId\) === "pro";/);
assert.match(server, /\(pro\(id\) \? featured : directory\)\.push/, "Nhà cung cấp nổi bật chỉ gói Pro");
assert.match(server, /pro: pro\(p\.supplierId\), premium: planOf\(p\.supplierId\) === "premium"/, "Sản phẩm mang gói Pro/Premium để xếp thứ tự trong thư");
assert.doesNotMatch(server, /chờ duyệt|awaiting approval|approved_by_staff|digest_approvals/i, "Không có bước duyệt thư");
assert.match(server, /p\.u\.startsWith\("\/"\) && !p\.u\.startsWith\("\/\/"\)/, "Link bấm chỉ chuyển về trang Vexim");
const click = read("supabase/migrations/20261223_buyer_digest.sql");
assert.doesNotMatch(click.slice(click.indexOf("buyer_digest_clicks_daily"), click.indexOf("create or replace function")), /buyer_id/, "Bảng lượt bấm không có mã người mua");
assert.match(read("app/(public)/buyer/introductions/unsubscribe/route.ts"), /export async function POST[\s\S]*marketing_opt_in: false/, "Huỷ một bấm (RFC 8058)");
assert.match(read("app/api/cron/rfq-sla/route.ts"), /runBuyerDigest\(\)/);
assert.match(read("components/blog/post-editor.tsx"), /Ngành hàng liên quan/);
assert.match(read("app/crm/buyers/digest/actions.ts"), /guard\("buyers\.manage"\)/, "Tạm dừng cần quyền quản lý người mua");
console.log("✅ Thư giới thiệu hằng tuần: tự tổng hợp từ nội dung đã duyệt, không lặp 4 tuần, không gửi thư rỗng, Pro nổi bật, mùa vụ từ lịch có sẵn, đúng mức nhận, huỷ một bấm.");
