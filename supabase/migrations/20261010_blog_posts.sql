-- Module blog (veximtrade.com/blog).
-- Gộp các thay đổi của module CMS gốc thành một migration; chạy một lần trên Supabase.
-- Bảng chỉ được đọc/ghi qua server bằng service role. RLS bật và KHÔNG có chính sách
-- công khai, nên khóa anon không đọc được bản nháp hay ghi được bài viết.

CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  -- Nội dung dạng JSON các khối (heading / paragraph / image / quote / table / list)
  content TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL,
  featured_image TEXT,
  featured_image_alt TEXT,
  meta_title TEXT,
  meta_description TEXT,
  focus_keyword TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_status ON public.posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON public.posts(published_at DESC);

CREATE OR REPLACE FUNCTION public.posts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_set_updated_at ON public.posts;
CREATE TRIGGER posts_set_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_set_updated_at();

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
