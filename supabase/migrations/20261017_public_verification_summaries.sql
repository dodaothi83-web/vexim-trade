-- Apply after 20261017_verification_workflow.sql and 20261017_delivery_history_audit.sql.
-- Historical inspector-entered summaries remain private; no backfill or auto-publication.
begin;
alter table public.verifications
  add column if not exists public_summary_published_at timestamptz,
  add column if not exists public_summary_published_by uuid references public.app_users(id) on delete set null;
-- Publication is separate from approval of the review and cannot apply to drafts.
alter table public.verifications drop constraint if exists verification_summary_publish_ck;
alter table public.verifications add constraint verification_summary_publish_ck check (
  public_summary_published_at is null or
  (status = 'approved' and target_level in (2, 3) and nullif(btrim(public_summary_i18n->>'en'), '') is not null)
);
commit;
notify pgrst, 'reload schema';
