# Supplier annual output and product-level MOQ

## Meaning and data safety

Company annual output is stored as nullable `suppliers.annual_output` text, including the supplier's stated quantity and unit. It is not a renamed monthly-capacity column. Production capacity and actual output are different facts, and legacy text cannot be reliably converted by multiplying by 12.

- Existing `suppliers.capacity_per_month` and `suppliers.moq_text` are retained.
- The supplier onboarding/correction and approved-owner edit forms no longer send either legacy field. Their parsers do not include those keys in update patches, even if forged by a client.
- An absent annual-output field preserves the existing value for older clients. An explicitly submitted blank clears only annual output.
- Existing profiles start with annual output blank, not a monthly number relabeled as annual output.
- Product `monthly_capacity`, product MOQ, grade pricing and product quantity rules are unchanged.
- Legacy company MOQ may still appear in existing public/CRM consumers. This change removes supplier-profile MOQ collection, not historical records or product MOQ.

## Mapping

1. Portal onboarding/corrections and approved-owner forms use `annual_output`, with EN/VI labels and quantity/unit guidance.
2. `parseSupplierProfile`, the profile API's explicit creation payload and `saveSupplierProfileEditAction` carry that field to supplier storage.
3. The owner read-only profile reads annual output. CRM can edit annual output; its old monthly-capacity field is clearly labeled legacy and read-only.
4. Supplier types include the optional annual-output field, so existing local/demo data remains compatible.
5. Translation source, hash, strict parsing, prompt and JSON cache have an independent annual-output field. Parser version is 4. The prompt prohibits annualizing monthly quantities.
6. The annual translation cache records its source snapshot. Public display uses a translated annual value only when that snapshot matches the current annual source. Pending or failed translation falls back to the current source, not an old quantity. Staff summary edits preserve that snapshot.
7. The public supplier storefront shows Annual output when supplied. Otherwise, existing monthly capacity remains under Monthly capacity, never under an annual label.
8. The SQL public supplier view appends annual output after its existing columns, preserving PostgreSQL view replacement compatibility. The public catalog's direct supplier reads also receive the new field.

## Deployment order

No remote database changes have been executed for this task.

1. Review and run `supabase/migrations/20261108_supplier_annual_output.sql` on the intended database before deploying the application change. The filename continues the repository's migration sequence.
2. The migration adds the nullable column, replaces the public view with its existing columns plus annual output at the end, and reloads PostgREST's schema cache. It does not backfill or overwrite monthly capacity or company MOQ.
3. Verify the new column and view, and that legacy monthly-capacity/MOQ values are unchanged.
4. Deploy the application. Test onboarding/corrections, approved-owner editing, CRM editing and the public supplier page with annual output present and absent.
5. Confirm that editing a profile without legacy controls does not clear those legacy fields, and that product MOQ still saves independently.

Application rollback can leave the additive column in place. Do not delete old fields or automatically convert historical numbers as part of rollback or rollout.

## Local verification

Passed:

- `npm run check:supplier-profile`: parser patch safety, approved-owner action execution, authentication/approval guards, form and creation mappings, translations and cache freshness, source units, additive migration structure, existing onboarding and CRM layout checks.
- `npm run check:i18n`, `npm run typecheck`, UI copy and `git diff --check`.
- Product local-store, product-detail display, product UI and grade-pricing checks.
- `npm run build`.

Limitation: `npm run check:supplier-products` stops in its first script because the VM harness does not mock `./requested-category` imported by `category-proposals.ts`. Those two files are unchanged from the branch baseline. Targeted product checks listed above passed, but the complete product suite is not green. Live database migration and production browser verification remain outstanding.
