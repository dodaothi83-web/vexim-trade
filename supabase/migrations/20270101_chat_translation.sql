-- Dịch tin nhắn chat tự động (người mua viết tiếng Anh, nhà cung cấp đọc tiếng Việt và ngược lại).
-- Bản gốc vẫn ở cột body; bản dịch chỉ là thêm, không thay đổi nội dung người gửi.
alter table public.chat_messages
  add column if not exists body_lang text,
  add column if not exists translation text,
  add column if not exists translation_lang text;

notify pgrst, 'reload schema';
