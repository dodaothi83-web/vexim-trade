-- Hướng dẫn sử dụng cho nhà cung cấp (giai đoạn 1, 27/11/2026).
-- Bảng riêng, tách khỏi blog: bài chỉ hiện trong cổng nhà cung cấp, không công khai,
-- không vào sitemap hay thư gửi người mua. Đọc/ghi qua server bằng service role;
-- RLS bật và KHÔNG có chính sách nào, nên khóa anon không đọc được bài.
-- Idempotent: chạy lại an toàn.

CREATE TABLE IF NOT EXISTS public.supplier_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  topic TEXT NOT NULL,
  summary TEXT,
  -- Nội dung dạng JSON các khối (cùng trình soạn thảo blog, thêm khối video và lưu ý)
  content TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_guides_topic_order ON public.supplier_guides(topic, sort_order);
CREATE INDEX IF NOT EXISTS idx_supplier_guides_status ON public.supplier_guides(status);

CREATE OR REPLACE FUNCTION public.supplier_guides_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS supplier_guides_set_updated_at ON public.supplier_guides;
CREATE TRIGGER supplier_guides_set_updated_at
  BEFORE UPDATE ON public.supplier_guides
  FOR EACH ROW EXECUTE FUNCTION public.supplier_guides_set_updated_at();

ALTER TABLE public.supplier_guides ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
