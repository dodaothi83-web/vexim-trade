import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const palette = JSON.parse(read('lib/brand/colors.json'));
execFileSync(process.execPath, ['scripts/sync-brand-colors.mjs', '--check']);
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((n) => parseInt(n, 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a, b) { const values = [luminance(a), luminance(b)].sort((a, b) => b - a); return (values[0] + .05) / (values[1] + .05); }
for (const key of ['primary', 'primaryHover', 'secondary', 'text', 'muted']) assert.ok(contrast(palette[key], '#FFFFFF') >= 4.5, `${key}: white contrast`);
for (const key of ['success', 'warning', 'error']) assert.ok(contrast(palette[key], palette[`${key}Surface`]) >= 4.5, `${key}: semantic contrast`);
assert.doesNotMatch(read('app/(public)/home.tsx'), /(?:amber|yellow)-\d/);
for (const file of ['lib/email/templates.ts', 'lib/email/rfq.ts', 'lib/email/buyer-auth.ts', 'lib/email/service-inquiry.ts', 'lib/email/signature.ts', 'lib/rfq/buyer-notify.ts', 'lib/rfq/supplier-question.ts']) {
  assert.match(read(file), /@\/lib\/brand\/colors.json/);
  assert.doesNotMatch(read(file), /#(?:0f766e|0d9488|134e4a|f0fdfa|ccfbf1)\b/i, file);
}
assert.match(read('components/verification-tier.tsx'), /bg-emerald-100/);
assert.doesNotMatch(read('components/verification-tier.tsx'), /(?:bg|text|border)-(?:amber|brand)-\d/);
console.log('Brand palette: generated CSS matches tokens, text contrast ≥ 4.5:1, no gold homepage accents, semantic verification and shared email colours.');
