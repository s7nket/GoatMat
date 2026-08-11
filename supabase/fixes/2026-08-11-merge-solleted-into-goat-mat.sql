-- One-off data fix for udaybanne222@gmail.com, 2026-08-11.
--
-- Not a migration. This repairs one account's books and should not be run
-- against a fresh database.
--
-- What happened: the opening stock was entered against a product called
-- "Solleted Mat 2*2", which was then archived. Sales were recorded against
-- "Goat Mat". stock_view excludes archived products, so the 1,962 pieces
-- disappeared from the Stock screen while the 652 sold pieces stayed, leaving
-- Goat Mat reading -651.
--
-- The mats are real and were always the same product. This moves the purchase
-- lines onto the product the sales already use.
--
-- Safe to re-run: the second run finds nothing left to move.

begin;

do $$
declare
  v_owner    uuid := 'ada8e6b4-8c8b-42b2-b877-9d57c4c2dcbb';
  v_from     uuid := 'a542d38d-d8c1-4c41-af20-1529143311a1'; -- Solleted Mat 2*2
  v_into     uuid := 'f7358d1f-a7cc-429a-8163-122e925f554f'; -- Goat Mat
  v_moved    integer;
begin
  -- Guard: never touch rows that are not this owner's, whatever the ids say.
  if not exists (
    select 1 from products where id = v_from and owner_id = v_owner
  ) or not exists (
    select 1 from products where id = v_into and owner_id = v_owner
  ) then
    raise exception 'Both products must belong to owner %', v_owner;
  end if;

  update purchase_items
     set product_id = v_into
   where product_id = v_from
     and owner_id = v_owner;
  get diagnostics v_moved = row_count;
  raise notice 'Moved % purchase line(s)', v_moved;

  -- None expected, but a stray sale would strand stock the same way.
  update sale_items
     set product_id = v_into
   where product_id = v_from
     and owner_id = v_owner;
  get diagnostics v_moved = row_count;
  raise notice 'Moved % sale line(s)', v_moved;
end;
$$;

-- Read the result back before committing.
select p.name,
       p.archived,
       coalesce((select sum(pi.qty) from purchase_items pi
                 join purchases pu on pu.id = pi.purchase_id and pu.voided_at is null
                 where pi.product_id = p.id), 0) as bought,
       coalesce((select sum(si.qty) from sale_items si
                 join sales s on s.id = si.sale_id and s.voided_at is null
                 where si.product_id = p.id), 0) as sold,
       coalesce((select sum(pi.qty) from purchase_items pi
                 join purchases pu on pu.id = pi.purchase_id and pu.voided_at is null
                 where pi.product_id = p.id), 0)
       - coalesce((select sum(si.qty) from sale_items si
                   join sales s on s.id = si.sale_id and s.voided_at is null
                   where si.product_id = p.id), 0) as in_stock
from products p
where p.owner_id = 'ada8e6b4-8c8b-42b2-b877-9d57c4c2dcbb'
order by p.name;

-- Expect: Goat Mat 1963 bought, 652 sold, 1311 in stock.
--         Solleted Mat 2*2 all zeroes, still archived.
--
-- If that is what you see, run:   commit;
-- If it is not, run:              rollback;
