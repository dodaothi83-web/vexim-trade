import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

// Giả lập trình duyệt tối thiểu trước khi nạp module.
const created = [];
globalThis.Image = class {
  constructor() { created.push(this); }
  set src(value) { this._src = value; }
  get src() { return this._src; }
};
let idleTasks = [];
globalThis.window = {
  requestIdleCallback: (fn) => { idleTasks.push(fn); return idleTasks.length; },
  cancelIdleCallback: (handle) => { idleTasks[handle - 1] = null; },
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.document = { readyState: "complete" };

const { preloadImage, canPreloadInBackground, whenPageIdle } = await import("../lib/public/preload-image.ts");

// 1. Mỗi ảnh chỉ tải một lần dù rê chuột, chạm và tab nhiều lần.
preloadImage("/public-media/certificate/a");
preloadImage("/public-media/certificate/a");
preloadImage(null);
preloadImage("");
assert.equal(created.length, 1, "Một ảnh chỉ tải trước một lần");
assert.equal(created[0].src, "/public-media/certificate/a");

// 2. Lỗi mạng cho phép thử lại ở lần sau.
preloadImage("/public-media/certificate/b");
created[1].onerror();
preloadImage("/public-media/certificate/b");
assert.equal(created.length, 3, "Ảnh lỗi được tải lại khi người mua có ý định mở lần nữa");

// 3. Tải ngầm khi rảnh tôn trọng tiết kiệm dữ liệu và mạng chậm.
assert.equal(canPreloadInBackground(undefined), true, "Trình duyệt không báo mạng: vẫn tải");
assert.equal(canPreloadInBackground({ effectiveType: "4g" }), true);
assert.equal(canPreloadInBackground({ effectiveType: "4g", saveData: true }), false, "Bật tiết kiệm dữ liệu: không tải ngầm");
for (const slow of ["slow-2g", "2g", "3g"]) assert.equal(canPreloadInBackground({ effectiveType: slow }), false, `Mạng ${slow}: không tải ngầm`);

// 4. Việc chờ rảnh chạy được và huỷ được khi rời trang.
let ran = 0;
whenPageIdle(() => { ran++; });
const cancel = whenPageIdle(() => { ran += 10; });
cancel();
idleTasks.forEach((task) => task?.());
assert.equal(ran, 1, "Việc đã huỷ không chạy");

// 5. Thẻ trang sản phẩm: tải khi có ý định mở và khi rảnh, chỉ vài giấy đầu.
const cards = read("components/public/product-certificate-cards.tsx");
assert.match(cards, /onPointerEnter=\{\(\) => preloadImage\(certificate\.imageUrl\)\}/, "Rê chuột vào thẻ là tải ảnh");
assert.match(cards, /onTouchStart=\{\(\) => preloadImage\(certificate\.imageUrl\)\}/, "Chạm vào thẻ là tải ảnh");
assert.match(cards, /onFocus=\{\(\) => preloadImage\(certificate\.imageUrl\)\}/, "Tab tới thẻ là tải ảnh");
assert.match(cards, /canPreloadInBackground\(connection\)/, "Tải ngầm kiểm tra mạng của người dùng");
assert.match(cards, /IDLE_PRELOAD_COUNT = 3/, "Chỉ tải sẵn 3 giấy đầu");

// 6. CDN giữ ảnh đúng một phút như trình duyệt, không phục vụ bản cũ quá hạn.
const route = read("app/public-media/certificate/[mediaId]/route.ts");
assert.match(route, /"Cache-Control": "public, max-age=60, s-maxage=60"/, "CDN giữ ảnh một phút");
assert.doesNotMatch(route, /"Cache-Control": "[^"]*stale-while-revalidate/, "Không phục vụ ảnh cũ sau khi giấy bị thu hồi");
assert.match(route, /"Cache-Control": "no-store"/, "404 không được cache");

console.log("✅ Ảnh chứng nhận: tải trước khi rảnh và khi có ý định mở, tôn trọng tiết kiệm dữ liệu, CDN giữ một phút.");
