-- Migration 010 -- stop stock disappearing when a product is archived.
--
-- Run once in Supabase Studio > SQL Editor. Safe to re-run.
--
-- stock_view excluded archived products outright, so archiving one that still
-- held stock made those pieces vanish from the Stock screen while every bill
-- referencing it stayed. An account did exactly that with 1,962 pieces, and
-- the product they were then sold under read -651 with no way to see why.
--
-- An archived product is meant to be hidden from *new* bills. It was never
-- meant to hide stock that physically exists.

-- Dropped rather than replaced: `create or replace view` can only append
-- columns at the end, and `archived` belongs beside the other product fields.
-- Nothing else reads this view, so dropping it costs nothing.
drop view if exists stock_view;

create view stock_view
with (security_invoker = true)
as
with movement as (
  select
    p.id,
    p.name,
    p.size,
    p.gsm,
    p.default_rate,
    p.low_stock_at,
    p.archived,
    coalesce(b.bought, 0) as total_bought,
    coalesce(s.sold, 0)   as total_sold
  from products p
  left join (
    select pi.product_id, sum(pi.qty) as bought
    from purchase_items pi
    join purchases pu on pu.id = pi.purchase_id and pu.voided_at is null
    group by pi.product_id
  ) b on b.product_id = p.id
  left join (
    select si.product_id, sum(si.qty) as sold
    from sale_items si
    join sales sa on sa.id = si.sale_id and sa.voided_at is null
    group by si.product_id
  ) s on s.product_id = p.id
)
select
  id, name, size, gsm, default_rate, low_stock_at, archived,
  total_bought, total_sold,
  total_bought - total_sold as qty_left
from movement
-- Archived products stay out of the way once they are actually empty. While
-- they still hold stock -- or owe it, if the count went negative -- they must
-- remain visible, because that stock is real either way.
where archived = false or total_bought <> total_sold;

-- ---------------------------------------------------------------------------
-- Two products with the same name in one account are indistinguishable in the
-- picker, which is how purchases and sales end up on different rows. Across
-- accounts the name is free -- several businesses selling the same mat will
-- all call it the same thing, and that is correct.
-- ---------------------------------------------------------------------------
create unique index if not exists products_owner_name_key
  on products (owner_id, lower(trim(name)))
  where archived = false;
