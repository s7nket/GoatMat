-- Migration 013 -- colour belongs to the line, not the product.
--
-- Run once in Supabase Studio > SQL Editor. Safe to re-run.
--
-- 012 put colour on the product, which was wrong. The same mat arrives in
-- several colours: a purchase is "200 red and 150 green", and a sale is "80
-- red". Colour is chosen per line, and stock has to split the same way or
-- there is no answer to "have I got red left".

-- The half of 012 that was right. Carried here so this file stands alone:
-- 012 both added the spec column and put colour on the product, and running it
-- to get the first would reinstate the second.
alter table products add column if not exists spec text;

comment on column products.spec is
  'One line printed under the product on a bill -- size, thickness, load rating.';

alter table products add column if not exists colour text;
update products set colour = null where colour is not null;
alter table products drop column if exists colour;

alter table purchase_items add column if not exists colour text;
alter table sale_items     add column if not exists colour text;

comment on column purchase_items.colour is
  'Colour of the mats on this line. Null means the product has no colour variants.';
comment on column sale_items.colour is
  'Colour of the mats on this line. Null means the product has no colour variants.';

create index if not exists purchase_items_colour_idx on purchase_items (product_id, colour);
create index if not exists sale_items_colour_idx     on sale_items (product_id, colour);

-- ---------------------------------------------------------------------------
-- Two views for two different questions.
--
-- stock_view answers "how many of this product", which is what the low-stock
-- warning, the oversell check and the product screen all ask.
--
-- colour_stock_view answers "how many red", which is what the Stock screen
-- shows and what decides whether a colour can be sold.
-- ---------------------------------------------------------------------------
drop view if exists stock_view;

create view stock_view
with (security_invoker = true)
as
with movement as (
  select
    p.id, p.name, p.size, p.gsm, p.default_rate, p.low_stock_at, p.archived,
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
where archived = false or total_bought <> total_sold;

drop view if exists colour_stock_view;

create view colour_stock_view
with (security_invoker = true)
as
with lines as (
  select pi.owner_id, pi.product_id, pi.colour, pi.qty as bought, 0 as sold
  from purchase_items pi
  join purchases pu on pu.id = pi.purchase_id and pu.voided_at is null

  union all

  select si.owner_id, si.product_id, si.colour, 0 as bought, si.qty as sold
  from sale_items si
  join sales sa on sa.id = si.sale_id and sa.voided_at is null
),
agg as (
  select owner_id, product_id, colour, sum(bought) as bought, sum(sold) as sold
  from lines
  group by owner_id, product_id, colour
)
select
  -- Composite key: a product appears once per colour, so the product id alone
  -- no longer identifies a row.
  a.product_id || ':' || coalesce(a.colour, '') as id,
  a.product_id,
  a.colour,
  p.name,
  p.size,
  p.gsm,
  p.default_rate,
  p.low_stock_at,
  p.archived,
  a.bought as total_bought,
  a.sold   as total_sold,
  a.bought - a.sold as qty_left
from agg a
join products p on p.id = a.product_id
where p.archived = false or a.bought <> a.sold;

-- Colours this account has actually used, so the picker can offer them without
-- anyone maintaining a list. Free text with no list gives "Red", "red" and
-- "RED" as three colours inside a month.
drop view if exists colours_used;

create view colours_used
with (security_invoker = true)
as
select distinct colour
from (
  select owner_id, colour from purchase_items where colour is not null
  union all
  select owner_id, colour from sale_items where colour is not null
) c
where owner_id = auth.uid();

-- ---------------------------------------------------------------------------
-- The item payload gains a colour. create_product loses the one it should
-- never have had.
-- ---------------------------------------------------------------------------
drop function if exists create_product(uuid, text, text, integer, text, text, numeric, integer, text);

create or replace function create_product(
  p_id           uuid,
  p_name         text,
  p_size         text,
  p_gsm          integer,
  p_spec         text,
  p_default_rate numeric,
  p_low_stock_at integer,
  p_notes        text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into products (id, name, size, gsm, spec, default_rate, low_stock_at, notes, created_by)
  values (
    coalesce(p_id, gen_random_uuid()),
    p_name, p_size, p_gsm,
    nullif(trim(coalesce(p_spec, '')), ''),
    p_default_rate, coalesce(p_low_stock_at, 0), p_notes, auth.uid()
  )
  on conflict (id) do nothing
  returning id into new_id;

  return coalesce(new_id, p_id);
end;
$$;

create or replace function create_sale(
  p_id           uuid,
  p_customer_id  uuid,
  p_bill_date    date,
  p_payment_mode text,
  p_paid_amount  numeric,
  p_notes        text,
  p_reference    text,
  p_items        jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_no integer;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'A bill needs at least one item';
  end if;

  if p_id is not null and exists (select 1 from sales where id = p_id) then
    return p_id;
  end if;

  v_no := next_bill_no('sale');

  insert into sales (
    id, bill_no, customer_id, bill_date, payment_mode, paid_amount, notes, reference, created_by
  )
  values (
    coalesce(p_id, gen_random_uuid()), v_no, p_customer_id,
    coalesce(p_bill_date, current_date), p_payment_mode, coalesce(p_paid_amount, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_reference, '')), ''),
    auth.uid()
  )
  on conflict (id) do nothing;

  insert into sale_items (sale_id, product_id, colour, qty, rate)
  select
    coalesce(p_id, (select id from sales where bill_no = v_no and owner_id = auth.uid())),
    (item ->> 'product_id')::uuid,
    nullif(trim(coalesce(item ->> 'colour', '')), ''),
    (item ->> 'qty')::integer,
    (item ->> 'rate')::numeric
  from jsonb_array_elements(p_items) as item;

  return coalesce(p_id, (select id from sales where bill_no = v_no and owner_id = auth.uid()));
end;
$$;

create or replace function create_purchase(
  p_id           uuid,
  p_supplier_id  uuid,
  p_bill_date    date,
  p_supplier_ref text,
  p_payment_mode text,
  p_paid_amount  numeric,
  p_notes        text,
  p_reference    text,
  p_items        jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_no integer;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'A bill needs at least one item';
  end if;

  if p_id is not null and exists (select 1 from purchases where id = p_id) then
    return p_id;
  end if;

  v_no := next_bill_no('purchase');

  insert into purchases (
    id, bill_no, supplier_id, bill_date, supplier_ref, payment_mode, paid_amount,
    notes, reference, created_by
  )
  values (
    coalesce(p_id, gen_random_uuid()), v_no, p_supplier_id,
    coalesce(p_bill_date, current_date),
    nullif(trim(coalesce(p_supplier_ref, '')), ''),
    p_payment_mode, coalesce(p_paid_amount, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_reference, '')), ''),
    auth.uid()
  )
  on conflict (id) do nothing;

  insert into purchase_items (purchase_id, product_id, colour, qty, rate)
  select
    coalesce(p_id, (select id from purchases where bill_no = v_no and owner_id = auth.uid())),
    (item ->> 'product_id')::uuid,
    nullif(trim(coalesce(item ->> 'colour', '')), ''),
    (item ->> 'qty')::integer,
    (item ->> 'rate')::numeric
  from jsonb_array_elements(p_items) as item;

  return coalesce(p_id, (select id from purchases where bill_no = v_no and owner_id = auth.uid()));
end;
$$;
