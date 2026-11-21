// node --experimental-strip-types --no-warnings scripts/check-product-aplus.mjs
// Nội dung A+ (Premium/Pro): khối hợp lệ, ảnh đúng sản phẩm, tiếng Anh, không liên hệ trực tiếp,
// Basic chỉ có mô tả chữ, ảnh A+ chỉ công khai khi đang dùng và gói còn quyền.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const a = await import("../lib/products/aplus.ts");
const plans = await import("../lib/supplier-plans.ts");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const sid = "11111111-1111-1111-1111-111111111111", pid = "22222222-2222-2222-2222-222222222222";
const ctx = { supplierId: sid, productId: pid };
const img = (n = 3) => `aplus/${sid}/${pid}/${String(n).repeat(8)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(12)}.webp`;

// 1. Năm loại khối hợp lệ.
const good = [
  { id: "m-000001", type: "image", image_path: img(3), caption: "Our drying yard" },
  { id: "m-000002", type: "image_text", image_path: img(4), title: "Grown in Dak Lak", body: "Hand-picked cherries.", image_side: "right" },
  { id: "m-000003", type: "gallery", items: [{ image_path: img(5), caption: "" }, { image_path: img(6), caption: "Sorting" }] },
  { id: "m-000004", type: "text", title: "Quality control", body: "Moisture checked per lot." },
  { id: "m-000005", type: "video", video_uid: "ab".repeat(16), title: "Factory tour" },
];
const ok = a.validateAplusModules(good, ctx);
assert.equal(ok.ok, true);
assert.equal(ok.modules.length, 5);
assert.deepEqual(a.aplusImagePaths(ok.modules), [img(3), img(4), img(5), img(6)]);

// 2. Từ chối: ảnh của sản phẩm/nhà cung cấp khác, thiếu tiêu đề, quá dài, lưới sai số ảnh, video sai mã.
const bad = (module) => a.validateAplusModules([module], ctx);
assert.equal(bad({ ...good[0], image_path: img(3).replace(pid, sid) }).problem.code, "imageRequired", "Ảnh phải thuộc đúng sản phẩm");
assert.equal(bad({ ...good[1], title: "" }).problem.code, "titleRequired");
assert.equal(bad({ ...good[3], body: "x".repeat(a.APLUS_BODY_MAX + 1) }).problem.code, "tooLong");
assert.equal(bad({ ...good[2], items: [good[2].items[0]] }).problem.code, "galleryCount");
assert.equal(bad({ ...good[4], video_uid: "not-a-uid" }).problem.code, "video");
assert.equal(a.validateAplusModules(Array.from({ length: a.APLUS_MAX_MODULES + 1 }, (_, i) => ({ id: `t-${String(i).padStart(6, "0")}`, type: "text", title: "Hi", body: "" })), ctx).problem.code, "tooMany");

// 3. Người mua là khách quốc tế; liên hệ đi qua Vexim.
assert.equal(bad({ ...good[3], title: "Kiểm soát chất lượng từng lô" }).problem.code, "language");
assert.equal(bad({ ...good[3], body: "Email sales@farm.vn for prices" }).problem.code, "contact");
assert.equal(bad({ ...good[3], body: "Call +84 912 345 678" }).problem.code, "contact");
assert.equal(bad({ ...good[3], body: "See www.farm.vn" }).problem.code, "contact");

// 4. Đọc dữ liệu hỏng không làm hỏng trang: bỏ đúng khối hỏng.
assert.equal(a.readAplusModules([good[0], { id: "x", type: "evil" }], ctx).length, 1);
assert.deepEqual(a.readAplusModules(null, ctx), []);

// 5. Quyền theo gói: Basic chỉ mô tả chữ; Premium/Pro có A+; gói hết hạn mất A+.
assert.equal(plans.supplierPlanRules({ plan: "basic" }).richContent, false);
assert.equal(plans.supplierPlanRules({ plan: "premium" }).richContent, true);
assert.equal(plans.supplierPlanRules({ plan: "pro", plan_expires_at: "2020-01-01T00:00:00Z" }).richContent, false);

// 6. Máy chủ: lưu và tải lên kiểm tra quyền gói từ phiên; ảnh công khai chỉ khi đang dùng và gói còn quyền.
const action = read("app/supplier/portal/aplus-actions.ts");
assert.match(action, /supplierPortalAccess\(\)/);
assert.match(action, /\.richContent\) return \{ ok: false, message: e\.plan \}/);
assert.match(action, /canEditAplus\(product\)/);
const upload = read("app/api/supplier-portal/products/[id]/aplus/route.ts");
assert.match(upload, /\.richContent\) return fail\(e\.plan, 403\)/);
assert.match(upload, /createStreamDirectUpload\(/);
assert.doesNotMatch(upload, /NEXT_PUBLIC_CLOUDFLARE/, "Khoá Cloudflare chỉ ở máy chủ");

// 7. Tối ưu Cloudflare Stream: chỉ phát trên tên miền Vexim, giới hạn thời lượng, kiểm tra video khi lưu,
// xoá video bị bỏ, ảnh bìa thay iframe cho tới khi bấm phát, VideoObject cho SEO.
const stream = read("lib/media/cloudflare-stream.ts");
assert.match(stream, /CLOUDFLARE_STREAM_API_TOKEN/);
assert.doesNotMatch(stream, /NEXT_PUBLIC_/, "Khoá Cloudflare chỉ ở máy chủ");
assert.match(stream, /stream\$\{path\}/);
assert.match(stream, /"\/direct_upload"/);
assert.match(stream, /allowedOrigins: streamAllowedOrigins\(\)/);
assert.match(stream, /maxDurationSeconds: APLUS_VIDEO_MAX_SECONDS/);
assert.match(stream, /product_id: input\.productId/);
assert.match(stream, /method: "DELETE"/);
assert.match(action, /video\.meta\.product_id !== ctx\.productId/, "Video mới phải do Vexim xin tải lên cho đúng sản phẩm");
assert.match(action, /after\(\(\) => Promise\.all\(droppedVideos\.map\(deleteStreamVideo\)\)\)/, "Video bị bỏ thì xoá trên Cloudflare");
assert.match(read("app/crm/products/[slug]/edit/aplus-actions.ts"), /deleteStreamVideo/, "CRM gỡ khối video thì xoá video");
assert.match(a.aplusVideoEmbedUrl("ab".repeat(16)), /preload=none/);
assert.match(a.aplusVideoEmbedUrl("ab".repeat(16), { autoplay: true }), /autoplay=true/);
assert.equal(a.aplusVideoThumbnailUrl("ab".repeat(16)), `https://videodelivery.net/${"ab".repeat(16)}/thumbnails/thumbnail.jpg?height=720`);
assert.equal(a.isoDuration(95), "PT1M35S");
assert.equal(a.isoDuration(3600), "PT1H");
const withMeta = a.validateAplusModules([{ ...good[4], duration: 95.4, uploaded_at: "2026-11-20T01:02:03Z" }], ctx);
assert.equal(withMeta.modules[0].duration, 95);
assert.equal(withMeta.modules[0].uploaded_at, "2026-11-20T01:02:03.000Z");
assert.deepEqual(a.aplusVideoUids(ok.modules), ["ab".repeat(16)]);
const facade = read("components/public/aplus-video.tsx");
assert.match(facade, /playing\s*\n?\s*\? <iframe/, "Iframe chỉ nạp khi người mua bấm phát");
assert.match(read("components/public/product-aplus.tsx"), /<AplusVideo /);
const media = read("app/public-media/[...path]/route.ts");
assert.match(media, /aplusImagePaths\(readAplusModules\(product\.aplus_content/, "Ảnh A+ chỉ phục vụ khi đang nằm trong nội dung");
assert.match(media, /\.richContent\)\s*\n\s*return new NextResponse\("Not found"/, "Gói hết quyền thì ảnh A+ không công khai");
const page = read("app/(public)/products/[slug]/[productId]/page.tsx");
assert.match(page, /"@type": "VideoObject"/);
assert.match(page, /subjectOf: videoJsonLd/);
assert.match(page, /richContent\s*\n?\s*\? readAplusModules/, "Trang người mua chỉ dựng A+ khi gói còn quyền");
const migration = read("supabase/migrations/20261130_product_aplus_content.sql");
assert.match(migration, /add column if not exists aplus_content jsonb not null default '\[\]'::jsonb/);
assert.match(migration, /rename column media_allowed to rich_content/);
// 8. Video sản phẩm trong dãy ảnh: chỉ gói có quyền video; Basic không thấy ô video.
assert.deepEqual(a.readGalleryVideo({ video_uid: "AB".repeat(16), duration: 12.6, uploaded_at: "2026-11-20T00:00:00Z" }),
  { video_uid: "ab".repeat(16), duration: 13, uploaded_at: "2026-11-20T00:00:00.000Z" });
assert.equal(a.readGalleryVideo({ video_uid: "nope" }), null);
assert.equal(a.readGalleryVideo(null), null);
assert.equal(plans.supplierPlanRules({ plan: "basic" }).video, false);
assert.equal(plans.supplierPlanRules({ plan: "premium" }).video, true);
const offCatalog = { ...plans.DEFAULT_PLAN_CATALOG, premium: { ...plans.DEFAULT_PLAN_CATALOG.premium, richContent: false } };
assert.equal(plans.supplierPlanRules({ plan: "premium" }, new Date(), offCatalog).video, false, "Video đi cùng công tắc A+ trong CRM");
assert.match(action, /export async function saveProductVideoAction/);
assert.match(action, /\.video\) return \{ ok: false, message: v\.plan \}/, "Lưu video kiểm tra quyền gói từ phiên");
assert.match(action, /video\.meta\.product_id !== productId/);
assert.match(action, /after\(\(\) => deleteStreamVideo\(before\.video_uid\)\)/, "Video cũ bị thay hoặc xoá thì xoá trên Cloudflare");
const editor = read("app/supplier/portal/products/product-editor.tsx");
assert.match(editor, /\(richContentAllowed \|\| !!readGalleryVideo\(product\?\.gallery_video\)\) && <Row label=\{aplusCopy\.productVideo\.label\}>/, "Basic không thấy ô video");
assert.match(page, /const galleryVideo = planRules\?\.video \? readGalleryVideo\(p\.gallery_video\) : null/, "Trang người mua chỉ hiện video khi gói còn quyền");
assert.match(page, /streamVideo=\{galleryVideo \?/);
assert.match(read("components/product-media-gallery.tsx"), /aria-label=\{`Play product video of \$\{name\}`\}/);
assert.match(read("app/crm/products/[slug]/edit/aplus-actions.ts"), /export async function removeGalleryVideoAction/);
const videoMigration = read("supabase/migrations/20261201_product_gallery_video.sql");
assert.match(videoMigration, /add column if not exists gallery_video jsonb/);
// 9. Gói có A+: A+ thay ô mô tả chữ ở mục 7. Mô tả cũ vẫn lưu, hiện cho người mua khi chưa có A+ hoặc gói hết hạn.
assert.match(editor, /\{!richContentAllowed && <div className="text-\[12px\]">\s*<span[^>]*>\{copy\.detail\.label\}/, "Premium/Pro không còn ô mô tả chữ");
assert.match(page, /const enDetail = aplus\.length \? null : textDetail;/, "Có A+ thì không hiện mô tả chữ");
const productActions = read("app/supplier/portal/product-actions.ts");
assert.match(productActions, /description_detail: form\.has\("description_detail"\)[\s\S]{0,160}: existing\?\.description_detail \?\? null/, "Form không gửi ô chữ thì giữ mô tả cũ");
// 10. Sản phẩm mới: A+ và video tải lên trước khi lưu (khu chờ), gắn khi lưu, bỏ ngang thì dọn sau 24 giờ.
const pendingLib = read("lib/supplier-portal/pending-media.ts");
const pendingRoute = read("app/api/supplier-portal/pending-media/route.ts");
assert.match(pendingRoute, /\.richContent\) return fail\(e\.plan, 403\)/, "Khu chờ chỉ cho gói có quyền video và A+");
assert.match(pendingRoute, /PENDING_UPLOADS_PER_DAY\) return fail\(e\.tooManyUploads, 429\)/, "Giới hạn số tệp chờ mỗi ngày");
assert.match(pendingRoute, /productId: null/, "Video chờ chưa gắn mã sản phẩm");
assert.match(pendingRoute, /isAplusImagePath\(path, access\.supplier\.id, PENDING_PRODUCT_ID\)/, "Chỉ chính nhà cung cấp xem được ảnh chờ của mình");
assert.match(stream, /pending: "true", supplier_id: input\.supplierId/);
assert.match(pendingLib, /video\.meta\.supplier_id !== supplierId \|\| video\.meta\.pending !== "true"/, "Video chờ phải đúng nhà cung cấp và chưa gắn sản phẩm");
assert.match(pendingLib, /validateAplusModules\(parsed, \{ supplierId, productId: PENDING_PRODUCT_ID \}, \{ draft: true \}\)/, "A+ soạn trước chỉ dùng ảnh trong khu chờ của chính nhà cung cấp");
assert.match(pendingLib, /PENDING_TTL_HOURS = 24/);
assert.match(read("app/api/cron/rfq-sla/route.ts"), /cleanupPendingUploads\(\)/, "Dọn tệp chờ chạy cùng cron hằng ngày");
const create = read("app/supplier/portal/product-actions.ts");
assert.match(create, /readPendingMediaForm\(form, access\.supplier\.id\)/, "Kiểm tra A+ soạn trước trước khi tạo sản phẩm");
assert.match(create, /!existing && pendingMedia && supplierPlanRules\([^)]*\)[^.]*\.richContent/, "Chỉ gắn khi gói còn quyền");
assert.match(read("components/products/aplus-editor.tsx"), /name="pending_aplus_json"/);
assert.match(read("components/products/product-video-field.tsx"), /name="pending_video_uid"/);
assert.match(read("supabase/migrations/20261202_supplier_pending_uploads.sql"), /enable row level security/);
const ref = `aplus/${sid}/pending/${"7".repeat(8)}-7777-7777-7777-${"7".repeat(12)}.webp`;
assert.equal(a.validateAplusModules([{ id: "m-000001", type: "image", image_path: ref, caption: "" }], { supplierId: sid, productId: "pending" }).ok, true);
assert.equal(a.validateAplusModules([{ id: "m-000001", type: "image", image_path: ref.replace(sid, pid), caption: "" }], { supplierId: sid, productId: "pending" }).ok, false, "Không dùng được ảnh chờ của nhà cung cấp khác");

// 7. Bản duyệt docs/aplus-editor (2026-11-20): viết tiếng Việt, dịch khi lưu, 5 khối B2B, mức hoàn thiện.
assert.equal(a.APLUS_MODULE_TYPES.length, 10);
assert.deepEqual([...a.APLUS_B2B_TYPES], ["hero", "highlights", "steps", "packing", "faq"]);
const hero = { id: "m-hero0001", type: "hero", image_path: img(3), alt: "Kernels", eyebrow: "", headline: "Hand-graded W320 cashew kernels", sub: "" };
const steps = { id: "m-step0001", type: "steps", items: [1, 2, 3].map((n) => ({ image_path: n === 2 ? "" : img(n + 3), alt: "Step", title: `Step ${n}`, text: "" })) };
const packing = { id: "m-pack0001", type: "packing", image_path: img(7), alt: "Cartons", title: "", rows: [{ label: "Inner packing", value: "Vacuum bag, 22.68 kg" }, { label: "20ft container", value: "700 cartons" }] };
const faq = { id: "m-faq00001", type: "faq", items: [{ q: "Samples?", a: "Request through Vexim." }, { q: "Own label?", a: "Yes." }] };
const highlights = { id: "m-high0001", type: "highlights", items: [{ icon: "samples", title: "Samples", text: "" }, { icon: "capacity", title: "Moisture", text: "" }, { icon: "evil", title: "Cartons", text: "" }] };
const b2b = a.validateAplusModules([hero, highlights, steps, packing, faq], ctx);
assert.equal(b2b.ok, true, "5 khối B2B hợp lệ");
assert.equal(b2b.modules[1].items[2].icon, "inspection", "Biểu tượng lạ thay bằng biểu tượng mặc định");
assert.deepEqual(a.aplusImagePaths([b2b.modules[2]]), [img(4), img(6)], "Ảnh bước không bắt buộc");
assert.equal(bad({ ...steps, items: steps.items.slice(0, 2) }).problem.code, "itemCount");
assert.equal(bad({ ...faq, items: [{ q: "Samples?", a: "" }, faq.items[1]] }).problem.code, "titleRequired", "Câu hỏi phải có trả lời");
assert.equal(bad({ ...packing, rows: [{ label: "x", value: "Call 0912.345.678" }, packing.rows[1]] }).problem.code, "contact");
// Số điện thoại viết liền, có khoảng trắng, chấm, gạch, ngoặc đều bị bắt; số đo, mã HS, số lượng thì không.
for (const phone of ["0912345678", "0912 345 678", "0912.345.678", "0912-345-678", "(028) 3822-1234", "+84 912 345 678", "84912345678"])
  assert.equal(a.findContact(`Contact ${phone} now`), "phone", phone);
for (const fact of ["2 x 22.68 kg vacuum bags", "HS 0801.32.00", "1,400 cartons per 40ft", "20ft: 700 cartons, 40ft: 1400", "Crop 2026-11-20"])
  assert.equal(a.findContact(fact), null, fact);
assert.equal(a.findContact("Zalo me"), "app");
// Bản tiếng Việt theo ô chữ; nháp chấp nhận chữ tiếng Việt, bản người mua thấy thì không.
const viText = { id: "m-text0001", type: "text", title: "", body: "", vi: ["Kiểm soát chất lượng từng lô", "Độ ẩm tối đa 5%, lấy mẫu mỗi 2 giờ."] };
assert.equal(a.validateAplusModules([viText], ctx, { draft: true }).ok, true, "Nháp tiếng Việt lưu được để dịch");
assert.equal(a.validateAplusModules([viText], ctx).ok, false, "Chưa dịch thì chưa hiện cho người mua");
assert.equal(a.aplusNeedsTranslation(a.validateAplusModules([viText], ctx, { draft: true }).modules[0]), true);
const translated = { ...a.withAplusText(viText, ["Quality control per lot", "Moisture max 5%, sampled every 2 hours."]), src: a.aplusSourceHash(viText.vi) };
assert.equal(a.validateAplusModules([translated], ctx).ok, true);
assert.equal(a.aplusNeedsTranslation(translated), false, "Đã dịch đúng bản tiếng Việt thì không dịch lại");
assert.equal(a.aplusNeedsTranslation({ ...translated, vi: ["Kiểm soát chất lượng", viText.vi[1]] }), true, "Đổi bản tiếng Việt thì dịch lại");
const edited = { ...translated, en_edited: true, vi: ["Kiểm soát chất lượng", viText.vi[1]] };
assert.equal(a.aplusNeedsTranslation(edited), false, "Đã sửa tay bản tiếng Anh thì không tự dịch đè");
assert.equal(a.aplusTranslationStale(edited), true, "Nhưng nhắc dịch lại từ tiếng Việt");
assert.equal(a.validateAplusModules([{ ...viText, title: "Quality", vi: ["only one"] }], ctx, { draft: true }).modules[0].vi, undefined, "Bản tiếng Việt sai số ô thì bỏ");
// Cảnh báo số liệu lệch giữa hai bản (khác dấu thập phân vẫn khớp).
assert.deepEqual(a.aplusNumberDrift("Bao 22,68 kg, 1.400 thùng, độ ẩm 5%", "Bag 22.68 kg, 1,400 cartons, moisture 5%"), []);
assert.deepEqual(a.aplusNumberDrift("Bao 22,68 kg, 700 thùng", "Bag 22 kg, 70 cartons"), ["22,68", "700"]);
// Mức hoàn thiện: 6 tiêu chí rõ ràng.
const score = a.aplusCompleteness(b2b.modules);
assert.deepEqual(score.map((c) => c.key), ["blocks", "opening", "complete", "alt", "b2b", "english"]);
assert.equal(score.find((c) => c.key === "opening").done, true);
assert.equal(score.find((c) => c.key === "b2b").done, true);
assert.equal(score.find((c) => c.key === "alt").done, false, "Bước 2 chưa có ảnh");
assert.deepEqual(a.aplusBlockIssues({ ...faq, items: [...faq.items, { q: "Lead time?", a: "" }] }), ["answers"]);
assert.deepEqual(a.aplusBlockIssues({ ...hero, alt: "" }), ["alt"]);
// Bộ mẫu: khung khối kèm mã gợi ý, không điền sẵn nội dung giả.
const T = await import("../lib/products/aplus-templates.ts");
assert.deepEqual([...T.APLUS_TEMPLATE_IDS], ["cashew", "coffee", "pepper", "cinnamon", "general"]);
const built = T.buildAplusTemplate("cashew", (() => { let n = 0; return () => `t-${String(++n).padStart(8, "0")}`; })());
assert.equal(built.length, 6);
assert.ok(built.every((m, i) => m.hint === `cashew:${i}` && a.aplusModuleText(m).every((t) => t === "")), "Chữ để trống");
const i18n = read("lib/i18n/portal/aplus.ts");
for (const id of T.APLUS_TEMPLATE_IDS) assert.equal((i18n.match(new RegExp(`${id}: \\{ name:`, "g")) ?? []).length, 2, `Gợi ý mẫu ${id} có cả hai ngôn ngữ`);
// Dịch khi lưu, một nút Lưu chung với sản phẩm, trang người mua dựng đủ 10 loại khối.
assert.match(action, /prepareAplusForSave\(modules, ctx/);
assert.match(read("lib/products/aplus-server.ts"), /validateAplusModules\(raw, ctx, \{ draft: true \}\)[\s\S]*translateAplusModules[\s\S]*validateAplusModules\(modules, ctx\)/);
assert.match(read("lib/ai/translate-aplus.ts"), /Keep every number, unit/);
assert.match(read("lib/ai/translate-aplus.ts"), /Keep formatting markers exactly/);
assert.match(create, /prepareAplusForSave\(pending\.value\.aplus/, "Sản phẩm mới: dịch A+ trước khi tạo");
assert.match(editor, /aplusRef\.current\.save\(\)/, "Lưu sản phẩm là lưu luôn A+");
// Chữ có định dạng: đậm, nghiêng, đậm nghiêng, gạch đầu dòng, dấu sao thật; ghi lại không đổi nội dung.
{
  const rich = "Hôm nay **đẹp** và *mát*, ***rất*** tốt\n\n- **Mục** một\n- mục *hai*\n\nGiá 5\\* sao";
  const nodes = a.parseAplusRich(rich);
  assert.deepEqual(nodes[0].runs, [{ t: "Hôm nay " }, { t: "đẹp", b: true }, { t: " và " }, { t: "mát", i: true }, { t: ", " }, { t: "rất", b: true, i: true }, { t: " tốt" }]);
  assert.deepEqual(nodes.map((n) => n.kind), ["p", "li", "li", "p"]);
  assert.equal(nodes[3].runs[0].t, "Giá 5* sao");
  assert.equal(a.serializeAplusRich(nodes), rich, "Ghi lại giữ nguyên");
  assert.equal(a.serializeAplusRich([{ kind: "p", runs: [{ t: "chữ ", b: true }, { t: "x" }] }]), "**chữ** x", "Khoảng trắng nằm ngoài dấu đậm");
}
// Viết thẳng tiếng Anh (nhà cung cấp nước ngoài): không cần dịch, không báo "cần dịch lại".
{
  const english = { id: "m-en0001", type: "text", title: "Quality control", body: "Moisture checked per lot.", en_edited: true, vi: ["", ""] };
  assert.equal(a.aplusHasVietnamese(english), false);
  assert.equal(a.aplusNeedsTranslation(english), false);
  assert.equal(a.aplusTranslationStale(english), false, "Khối tiếng Anh không bị coi là cần dịch lại");
  assert.equal(a.aplusCompleteness([english]).find((c) => c.key === "english").done, true);
}
const editorSrc = read("components/products/aplus-rich-editor.tsx");
assert.match(editorSrc, /toggleItalic/, "Ô soạn có nút nghiêng");
assert.doesNotMatch(read("components/products/aplus-editor.tsx"), /<label[^>]*>\{label\}\s*<AplusRichEditor/, "Ô soạn có thanh công cụ không nằm trong label");
const render = read("components/public/product-aplus.tsx");
for (const type of a.APLUS_MODULE_TYPES) assert.match(render, new RegExp(`case "${type}":`), `Trang người mua dựng khối ${type}`);
assert.match(render, /alt=\{item\.alt \|\| fallbackAlt\}/, "Ảnh dùng mô tả ảnh");
assert.match(render, /<details/, "Câu hỏi thường gặp dùng details");
console.log("✅ Nội dung A+: 10 loại khối (5 khối B2B), viết tiếng Việt dịch khi lưu, bộ mẫu, mức hoàn thiện, ảnh đúng sản phẩm, tiếng Anh, không liên hệ trực tiếp, Basic chỉ mô tả chữ, ảnh công khai theo gói, video sản phẩm chỉ Premium/Pro, tải trước khi lưu sản phẩm.");
