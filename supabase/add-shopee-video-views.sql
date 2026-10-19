-- DigitalEVO: add Shopee Video Views products.
-- Run this once in Supabase SQL Editor before enabling checkout.
insert into public.products (category, qty, original, price, sold, sort_order)
select 'video_views', 500, 6000, 6000, '', 1
where not exists (
  select 1 from public.products where category = 'video_views' and qty = 500
);

insert into public.products (category, qty, original, price, sold, sort_order)
select 'video_views', 1000, 10600, 10600, '', 2
where not exists (
  select 1 from public.products where category = 'video_views' and qty = 1000
);
