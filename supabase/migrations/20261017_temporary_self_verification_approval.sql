-- Temporary exception: an admin who inspected a supplier may also approve
-- the same submitted verification. Only the four-eyes CHECK is removed;
-- existing rows, status rules, inspector_id and approved_by are untouched.
-- Apply to the production Supabase project BEFORE deploying the matching app code.
begin;
alter table public.verifications drop constraint if exists verifications_four_eyes;
commit;
notify pgrst, 'reload schema';
