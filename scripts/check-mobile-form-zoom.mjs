// node scripts/check-mobile-form-zoom.mjs — mobile form controls must not trigger iOS focus zoom.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const start = css.indexOf('@media (max-width: 767.98px), (hover: none) and (pointer: coarse)');
const end = css.indexOf('@layer components', start);
assert.ok(start >= 0 && end > start, 'Mobile/touch form rule must exist');
const rule = css.slice(start, end);
assert.match(rule, /input:not\(\[type="checkbox"\]\)/, 'Text inputs must be covered without enlarging checkboxes');
assert.match(rule, /textarea,/);
assert.match(rule, /select \{/);
assert.match(rule, /font-size: 16px !important;/, 'Small utility font sizes must not re-enable iOS focus zoom');
assert.ok(!layout.includes('maximumScale') && !layout.includes('userScalable'),
  'Do not disable the user’s ability to zoom the page');

console.log('✅ Mobile forms: text controls use at least 16px on touch/small screens; page zoom remains accessible.');
