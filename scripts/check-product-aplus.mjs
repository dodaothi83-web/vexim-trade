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
console.log("✅ Nội dung A+: 5 loại khối, ảnh đúng sản phẩm, tiếng Anh, không liên hệ trực tiếp, Basic chỉ mô tả chữ, ảnh công khai theo gói, video sản phẩm chỉ Premium/Pro.");
