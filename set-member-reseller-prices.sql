-- DigitalEVO Member/Reseller prices
-- Run once in Supabase SQL Editor.
-- Synchronizes the regular promo price (products.price) and member_price to the
-- latest price list supplied by the site owner. Does not change checkout/QRIS settings.
begin;

with product_prices(category, qty, regular_price, member_price) as (
  values
    ('account', 10000, 325000, 325000),
    ('account', 20000, 520000, 520000),
    ('account', 30000, 700000, 700000),
    ('account', 50000, 999000, 999000),
    ('followers', 100, 7800, 5800),
    ('followers', 200, 15600, 11600),
    ('followers', 300, 21500, 17500),
    ('followers', 500, 29800, 25800),
    ('followers', 1000, 57200, 47200),
    ('followers', 1500, 84500, 72600),
    ('followers', 2000, 112000, 99000),
    ('followers', 3000, 168000, 148000),
    ('followers', 5000, 275000, 250000),
    ('product_likes', 100, 3600, 2000),
    ('product_likes', 200, 6200, 4000),
    ('product_likes', 500, 13500, 10000),
    ('video_comments', 10, 13700, 8600),
    ('video_comments', 20, 27200, 17200),
    ('video_likes', 100, 3600, 1800),
    ('video_likes', 200, 6400, 3000),
    ('video_likes', 500, 10500, 6000),
    ('video_likes', 1000, 18700, 11500),
    ('video_views', 500, 6000, 3300),
    ('video_views', 1000, 10600, 5600)
)
update public.products as p
set price = pp.regular_price,
    member_price = pp.member_price
from product_prices as pp
where p.category = pp.category
  and p.qty = pp.qty;

-- Verify the matched rows and prices.
select category, qty, price as regular_price, member_price
from public.products
where (category, qty) in (
  ('account',10000), ('account',20000), ('account',30000), ('account',50000),
  ('followers',100), ('followers',200), ('followers',300), ('followers',500),
  ('followers',1000), ('followers',1500), ('followers',2000), ('followers',3000), ('followers',5000),
  ('product_likes',100), ('product_likes',200), ('product_likes',500),
  ('video_comments',10), ('video_comments',20),
  ('video_likes',100), ('video_likes',200), ('video_likes',500), ('video_likes',1000),
  ('video_views',500), ('video_views',1000)
)
order by category, qty;

commit;
