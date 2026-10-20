-- DigitalEVO: Shopee Produk Favorite/Likes
-- Jalankan sekali di Supabase SQL Editor sebelum kategori digunakan di website.
-- Mempertahankan kategori produk yang sudah dipakai website.

alter table public.products
  drop constraint if exists products_category_check;

alter table public.products
  add constraint products_category_check
  check (category in ('followers', 'account', 'video_views', 'video_likes', 'product_likes'));

insert into public.products (category, qty, original, price, sold, image_url, sort_order, updated_at)
select seed.category, seed.qty, seed.original, seed.price, '', seed.image_url, seed.sort_order, now()
from (values
  ('product_likes', 100, 3600, 3600, 'assets/100.webp', 1),
  ('product_likes', 200, 6200, 6200, 'assets/200.webp', 2),
  ('product_likes', 500, 13500, 13500, 'assets/500.webp', 3)
) as seed(category, qty, original, price, image_url, sort_order)
where not exists (
  select 1
  from public.products existing
  where existing.category = seed.category
    and existing.qty = seed.qty
);
