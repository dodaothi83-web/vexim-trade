// node --experimental-strip-types --no-warnings scripts/check-home-rotation.mjs
// Trang chủ luân phiên theo giờ: tầng xác minh vẫn cứng, cùng giờ cùng thứ tự,
// lượt lên đầu chia gần đều, danh mục mở đầu không bị khoá vào một ngày trong tuần.
// Trang danh mục không luân phiên.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HOME_ROTATION_WINDOW_MINUTES,
  homeRotationWindow,
  rotateForWindow,
  rotateWithinVerificationTiers,
} from '../lib/public/supplier-product-order.ts';
assert.equal(HOME_ROTATION_WINDOW_MINUTES, 60, 'Trang chủ luân phiên mỗi giờ');
const hour = 3_600_000;
const t0 = Date.UTC(2026, 10, 5, 9, 0, 0);
assert.equal(homeRotationWindow(t0), homeRotationWindow(t0 + hour - 1), 'Trong cùng một giờ thứ tự không đổi');
assert.equal(homeRotationWindow(t0 + hour), homeRotationWindow(t0) + 1, 'Sang giờ mới là cửa sổ mới');

const tiered = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `t3-${i}`, verificationCount: 3 })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `t1-${i}`, verificationCount: 1 })),
];
const leaders = new Map();
for (let w = 0; w < 24 * 30; w++) {
  const order = rotateWithinVerificationTiers(tiered, w);
  assert.equal(order.length, tiered.length);
  assert.ok(order.slice(0, 6).every((p) => p.verificationCount === 3), 'Tầng xác minh cao luôn đứng trên, trong mọi giờ');
  assert.deepEqual(rotateWithinVerificationTiers(tiered, w).map((p) => p.id), order.map((p) => p.id), 'Cùng cửa sổ thì cùng thứ tự');
  leaders.set(order[0].id, (leaders.get(order[0].id) ?? 0) + 1);
}
assert.equal(leaders.size, 6, 'Mọi sản phẩm cùng tầng cao nhất đều có lượt lên đầu');
for (const [id, count] of leaders) assert.ok(count > 70 && count < 170, `${id} lên đầu ${count}/720 giờ, gần đều 120`);
assert.deepEqual(tiered.map((p) => p.id)[0], 't3-0', 'Không đổi mảng đầu vào');

const slugs = ['cashew', 'coffee', 'pepper', 'rice', 'cinnamon', 'fruit', 'seafood'];
const openers = new Map();
for (let w = 0; w < 24 * 7 * 8; w++) {
  const day = Math.floor(w / 24) % 7;
  const first = rotateForWindow(slugs, (s) => s, w)[0];
  openers.set(`${first}@${day}`, true);
}
for (const slug of slugs) for (let day = 0; day < 7; day++) {
  assert.ok(openers.has(`${slug}@${day}`), `${slug} có lúc mở đầu vào ngày ${day} trong tuần, không bị khoá vào một ngày`);
}

const homeRotationSource = readFileSync(new URL('../app/(public)/home.tsx', import.meta.url), 'utf8');
assert.match(homeRotationSource, /rotateForWindow\(productGroups, \(\{ category \}\) => category\.slug, rotationWindow\)/, 'Trang chủ xoay danh mục mở đầu');
assert.match(homeRotationSource, /rotateWithinVerificationTiers\(products, rotationWindow\)/, 'Trang chủ xoay trong cùng tầng xác minh');
const categoryPageSource = readFileSync(new URL('../app/(public)/products/[slug]/page.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(categoryPageSource, /rotateWithinVerificationTiers|homeRotationWindow/, 'Trang danh mục không luân phiên');
console.log('Homepage hourly rotation: tiers hard, same hour same order, fair leaders, no weekday lock, category page fixed');
