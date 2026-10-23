-- DigitalEVO: urutan manual ulasan
-- Jalankan sekali di Supabase SQL Editor.
alter table public.comments
  add column if not exists sort_order integer;

with ranked_reviews as (
  select
    id,
    row_number() over (
      order by pinned desc nulls last, created_at desc nulls last, id
    )::integer as position
  from public.comments
)
update public.comments as comments
set sort_order = ranked_reviews.position
from ranked_reviews
where comments.id = ranked_reviews.id
  and comments.sort_order is null;

create index if not exists comments_review_order_idx
  on public.comments (status, pinned desc, sort_order asc, created_at desc);
