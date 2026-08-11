-- Migration 012 -- what the mat actually is, and what colour.
--
-- Run once in Supabase Studio > SQL Editor. Safe to re-run.
--
-- The warranty and terms added in 011 belong to the business. The
-- specification belongs to the product: a 2x2 ft 70 mm mat rated to 500 kg is
-- not the same object as the next one on the list, and a buyer needs to know
-- which they were handed.
--
-- Free text rather than columns for thickness, weight and load. Those numbers
-- are quoted in whatever units a supplier uses, they change between product
-- lines, and a fixed set of columns would either not fit the next mat or sit
-- empty for most of them.

alter table products add column if not exists spec text;
alter table products add column if not exists colour text;

comment on column products.spec is
  'One line describing the product, printed under its item on the bill. e.g. "2x2 ft · 70 mm · 2.9 kg · 500 kg load".';

comment on column products.colour is
  'Shown wherever the product is listed, so two otherwise identical mats can be told apart at a glance.';

-- ---------------------------------------------------------------------------
-- The create function gains both. Its argument list changes, so the old
-- version is dropped rather than left as an overload for PostgREST to choose
-- between.
-- ---------------------------------------------------------------------------
drop function if exists create_product(uuid, text, text, integer, numeric, integer, text);

create or replace function create_product(
  p_id           uuid,
  p_name         text,
  p_size         text,
  p_gsm          integer,
  p_spec         text,
  p_colour       text,
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
  insert into products (
    id, name, size, gsm, spec, colour, default_rate, low_stock_at, notes, created_by
  )
  values (
    coalesce(p_id, gen_random_uuid()),
    p_name,
    p_size,
    p_gsm,
    nullif(trim(coalesce(p_spec, '')), ''),
    nullif(trim(coalesce(p_colour, '')), ''),
    p_default_rate,
    coalesce(p_low_stock_at, 0),
    p_notes,
    auth.uid()
  )
  on conflict (id) do nothing
  returning id into new_id;

  return coalesce(new_id, p_id);
end;
$$;

-- Colour is part of what a product is, so stock_view has to carry it or the
-- Stock screen cannot tell two otherwise identical mats apart.
drop view if exists stock_view;

create view stock_view
with (security_invoker = true)
as
with movement as (
  select
    p.id, p.name, p.size, p.gsm, p.default_rate, p.low_stock_at, p.colour, p.archived,
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
  id, name, size, gsm, default_rate, low_stock_at, colour, archived,
  total_bought, total_sold,
  total_bought - total_sold as qty_left
from movement
where archived = false or total_bought <> total_sold;
