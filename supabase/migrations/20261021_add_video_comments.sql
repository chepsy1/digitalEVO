-- Jalankan sekali di Supabase SQL Editor sebelum menguji checkout Custom Comments.
-- Menambah penyimpanan isi komentar dan mengizinkan kategori video_comments.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS comment_text text;

DO $$
DECLARE r record;
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    FOR r IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.products'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%category%'
    LOOP
      EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', r.conname);
    END LOOP;
    ALTER TABLE public.products
      ADD CONSTRAINT products_category_allowed_check
      CHECK (category IN ('followers','account','video_views','video_likes','video_comments','product_likes'));
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    FOR r IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.orders'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%category%'
    LOOP
      EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', r.conname);
    END LOOP;
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_category_allowed_check
      CHECK (category IS NULL OR category IN ('followers','account','video_views','video_likes','video_comments','product_likes'));
  END IF;
END $$;

INSERT INTO public.products (category, qty, original, price, sold, image_url, sort_order)
SELECT 'video_comments', 10, 13700, 13700, '', 'assets/100.webp',
       COALESCE((SELECT MAX(sort_order) FROM public.products WHERE category='video_comments'), 0) + 1
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE category='video_comments' AND qty=10);

INSERT INTO public.products (category, qty, original, price, sold, image_url, sort_order)
SELECT 'video_comments', 20, 27200, 27200, '', 'assets/200.webp',
       COALESCE((SELECT MAX(sort_order) FROM public.products WHERE category='video_comments'), 0) + 1
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE category='video_comments' AND qty=20);
