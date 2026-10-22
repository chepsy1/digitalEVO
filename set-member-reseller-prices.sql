-- DigitalEVO Member/Reseller prices
-- Run once in Supabase SQL Editor. This updates only products.member_price;
-- regular prices, checkout/QRIS gateway settings, and product order are unchanged.
begin;

with member_prices(category, qty, member_price) as (
  values
    ('followers', 100, 5800),
    ('followers', 200, 11600),
    ('followers', 300, 17500),
    ('followers', 500, 25800),
    ('followers', 1000, 47200),
    ('followers', 1500, 72600),
    ('followers', 2000, 99000),
    ('followers', 3000, 148000),
    ('followers', 5000, 250000),
    ('video_views', 500, 3300),
    ('video_views', 1000, 5600),
    ('video_likes', 100, 1800),
    ('video_likes', 200, 3000),
    ('video_likes', 500, 6000),
    ('video_likes', 1000, 11500),
    ('video_comments', 10, 8600),
    ('video_comments', 20, 17200),
    ('product_likes', 100, 2000),
    ('product_likes', 200, 4000),
    ('product_likes', 500, 10000),
    ('account', 10000, 325000),
    ('account', 20000, 520000),
    ('account', 30000, 700000),
    ('account', 50000, 999000)
)
update public.products as p
set member_price = mp.member_price
from member_prices as mp
where p.category = mp.category
  and p.qty = mp.qty;

-- Review matched products and their new member prices before committing in production.
select category, qty, price as regular_price, member_price
from public.products
where (category, qty) in (
  ('followers',100), ('followers',200), ('followers',300),
  ('followers',500), ('followers',1000), ('followers',1500),
  ('followers',2000), ('followers',3000), ('followers',5000),
  ('video_views',500), ('video_views',1000),
  ('video_likes',100), ('video_likes',200), ('video_likes',500), ('video_likes',1000),
  ('video_comments',10), ('video_comments',20),
  ('product_likes',100), ('product_likes',200), ('product_likes',500),
  ('account',10000), ('account',20000), ('account',30000), ('account',50000)
)
order by category, qty;

commit;
