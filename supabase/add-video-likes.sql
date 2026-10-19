-- Jalankan di Supabase SQL Editor setelah deploy kode.
-- Menambahkan kategori produk Shopee Video Likes dan empat paketnya.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_category_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_category_check
  CHECK (category IN ('followers', 'account', 'video_views', 'video_likes'));

INSERT INTO public.products (category, qty, price, original, sold, image_url, sort_order)
SELECT v.category, v.qty, v.price, v.original, v.sold, v.image_url, v.sort_order
FROM (VALUES
  ('video_likes', 100, 3600, 3600, '', 'assets/100.webp', 1),
  ('video_likes', 200, 6400, 6400, '', 'assets/200.webp', 2),
  ('video_likes', 500, 10500, 10500, '', 'assets/500.webp', 3),
  ('video_likes', 1000, 18700, 18700, '', 'assets/1000.webp', 4)
) AS v(category, qty, price, original, sold, image_url, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.category = v.category AND p.qty = v.qty
);
