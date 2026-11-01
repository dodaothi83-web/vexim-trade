-- Resend báo bounce thì trước đây webhook bỏ qua, nên một địa chỉ không tồn tại
-- vẫn bị gửi tiếp và mỗi lần gửi lại trừ uy tín domain hello@veximtrade.com.
-- Bảng dưới đây là danh sách ngừng gửi, dùng chung cho mọi đường thư.
--
-- Quy tắc ghi:
--   hard_bounce         địa chỉ không tồn tại (Permanent, Undetermined)
--   complaint           người nhận bấm báo cáo thư rác
--   provider_suppressed Resend tự chặn địa chỉ đó
--   manual              nhân viên tự thêm
-- Bounce tạm (Transient: hộp thư đầy, máy chủ bận) không ghi vào đây.
begin;

create table if not exists public.email_suppressions (
  email         text primary key,
  reason        text not null check (reason in ('hard_bounce', 'complaint', 'provider_suppressed', 'manual')),
  provider      text not null default 'resend',
  event_type    text,
  detail        jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  -- Một địa chỉ chỉ có một dòng, luôn viết thường, và phải có dạng tên@tên miền.
  check (email = lower(btrim(email)) and length(email) <= 320
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
create index if not exists email_suppressions_seen_idx on public.email_suppressions (last_seen_at desc);

alter table public.email_suppressions enable row level security;
revoke all on table public.email_suppressions from public, anon, authenticated;
grant select, insert, update, delete on table public.email_suppressions to service_role;

-- Ghi một địa chỉ vào danh sách ngừng gửi, và tắt tài khoản nhà cung cấp dùng
-- đúng địa chỉ đó. Tài khoản nội bộ không bao giờ bị tắt bởi một cú bounce, vì
-- một lần hộp thư của nhân viên trục trặc không được phép khoá cửa cả hệ thống.
create or replace function public.record_email_suppression(
  p_email text, p_reason text, p_event_type text default null, p_detail jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  normalized text;
  already_known boolean;
  deactivated integer := 0;
begin
  normalized := lower(btrim(coalesce(p_email, '')));
  if p_reason not in ('hard_bounce', 'complaint', 'provider_suppressed', 'manual') or
     length(normalized) > 320 or normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select exists(select 1 from public.email_suppressions where email = normalized) into already_known;
  insert into public.email_suppressions (email, reason, event_type, detail)
    values (normalized, p_reason, p_event_type, coalesce(p_detail, '{}'::jsonb))
    on conflict (email) do update set
      last_seen_at = now(),
      reason = case when excluded.reason = 'complaint' then 'complaint' else public.email_suppressions.reason end,
      detail = excluded.detail;
  update public.app_users set is_active = false, updated_at = now()
    where lower(btrim(email)) = normalized and role = 'supplier' and is_active;
  get diagnostics deactivated = row_count;
  if deactivated > 0 then
    insert into public.audit_log (actor_id, actor_email, entity, entity_id, action, before, after)
      values (null, 'system', 'app_user', normalized, 'user.deactivated_email_bounce',
        jsonb_build_object('is_active', true),
        jsonb_build_object('is_active', false, 'reason', p_reason, 'event', p_event_type, 'accounts', deactivated));
  end if;
  return jsonb_build_object('status', 'saved', 'email', normalized, 'created', not already_known,
    'deactivated_accounts', deactivated);
end $$;

-- Gỡ một địa chỉ khỏi danh sách để gửi lại sau khi người nhận đã sửa hộp thư.
-- Không tự bật lại tài khoản: nhân viên quyết định việc đó trong CRM.
create or replace function public.clear_email_suppression(p_email text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare normalized text; removed integer := 0;
begin
  normalized := lower(btrim(coalesce(p_email, '')));
  delete from public.email_suppressions where email = normalized;
  get diagnostics removed = row_count;
  return jsonb_build_object('status', case when removed > 0 then 'cleared' else 'missing' end, 'email', normalized);
end $$;

revoke all on function public.record_email_suppression(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.clear_email_suppression(text) from public, anon, authenticated;
grant execute on function public.record_email_suppression(text, text, text, jsonb) to service_role;
grant execute on function public.clear_email_suppression(text) to service_role;

notify pgrst, 'reload schema';
commit;
