// Run: node --experimental-strip-types --no-warnings scripts/check-category-schema-error.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { categorySchemaError } from '../lib/db/category-schema-error.ts';

const missing = new Error("updateCategory: Could not find the 'active_on_homepage' column of 'categories' in the schema cache");
const message = categorySchemaError(missing);
assert.match(message, /20261017_cms_supplier_images\.sql/);
assert.match(message, /đúng project/);
assert.match(message, /Không có thay đổi nào được lưu/);
assert.match(categorySchemaError(new Error("createCategory: PGRST204 Could not find the 'body_i18n' column of 'categories' in the schema cache")), /migration/i);
assert.equal(categorySchemaError(new Error('updateCategory: duplicate key value violates unique constraint')), null);
assert.equal(categorySchemaError(new Error("updateSupplier: Could not find column of 'categories' in the schema cache")), null);
const actions = readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
assert.match(actions, /message: categorySchemaError\(err\)/);
const migration = readFileSync(new URL('../supabase/migrations/20261017_cms_supplier_images.sql', import.meta.url), 'utf8');
assert.match(migration, /add column if not exists active_on_homepage/);
assert.match(migration, /notify pgrst, 'reload schema'/);
console.log('✅ Category schema errors explain the required migration; no silent partial writes.');
