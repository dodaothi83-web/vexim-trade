// Legacy manual action tests replaced by the retired-flow guards and public copy checks.
import './check-sponsored-retired.mjs';
import assert from 'node:assert/strict';
const { servicesMessages } = await import('../lib/i18n/portal/services.ts');
// Quảng cáo banner giờ nằm ở mục "Dịch vụ Vexim" trong cổng, vẫn tách khỏi gói đẩy sản phẩm.
for (const lang of ['vi', 'en']) {
  const featured = JSON.stringify(servicesMessages[lang].services.featured_ads);
  assert.match(featured, /banner/i);
  assert.doesNotMatch(featured, /168 (giờ|hours)|chưa bật bộ lọc|no filters applied|supplier\/portal\/boost|sponsored/i);
}
console.log('✅ Banner advertising and product boost remain distinct.');
