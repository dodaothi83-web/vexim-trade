-- Vai trò "Biên tập nội dung" (editor): chỉ viết và đăng blog.
-- Quyền chi tiết nằm ở lib/auth/permissions.ts; CSDL chỉ cần chấp nhận giá trị mới.
alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('admin','sale','sourcing','reviewer','editor','viewer','supplier'));
