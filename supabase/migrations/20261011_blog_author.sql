-- Tác giả và người duyệt nội dung cho bài blog (tín hiệu E-E-A-T).
-- Chạy một lần trên Supabase sau 20261010_blog_posts.sql. Có thể chạy lại an toàn.

alter table public.posts
  add column if not exists author_name text,
  add column if not exists reviewer_name text;

comment on column public.posts.author_name is 'Tên người viết bài hiển thị cho người đọc (để trống thì hiển thị Veximtrade)';
comment on column public.posts.reviewer_name is 'Người kiểm duyệt nội dung chuyên môn (tùy chọn)';
