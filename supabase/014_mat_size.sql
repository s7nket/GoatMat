-- Migration 014 -- the mat's real size, in feet.
--
-- Run once in Supabase Studio > SQL Editor. Safe to re-run.
--
-- `size` stays as it is: it is what gets printed, and suppliers quote it in
-- whatever form they like. But "how many mats for 1200 sq ft" is arithmetic,
-- and no amount of parsing "2x2 ft" is worth trusting when the answer decides
-- what a customer is quoted. So the two numbers are stored as numbers.
--
-- Null means unknown, and the calculator says so rather than guessing.

alter table products add column if not exists width_ft  numeric(6,2);
alter table products add column if not exists length_ft numeric(6,2);

comment on column products.width_ft is
  'One mat''s width in feet. Null when nobody has filled it in.';
comment on column products.length_ft is
  'One mat''s length in feet. Null when nobody has filled it in.';

-- A mat with a zero or negative side would divide the calculator by zero.
alter table products drop constraint if exists products_width_ft_positive;
alter table products drop constraint if exists products_length_ft_positive;
alter table products add constraint products_width_ft_positive
  check (width_ft is null or width_ft > 0);
alter table products add constraint products_length_ft_positive
  check (length_ft is null or length_ft > 0);

-- ---------------------------------------------------------------------------
-- The two new parameters default to null, so a phone still running the old
-- build -- or holding a product queued offline before this migration -- keeps
-- sending eight arguments and keeps working.
-- ---------------------------------------------------------------------------
drop function if exists create_product(uuid, text, text, integer, text, numeric, integer, text);

create or replace function create_product(
  p_id           uuid,
  p_name         text,
  p_size         text,
  p_gsm          integer,
  p_spec         text,
  p_default_rate numeric,
  p_low_stock_at integer,
  p_notes        text,
  p_width_ft     numeric default null,
  p_length_ft    numeric default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into products (
    id, name, size, gsm, spec, default_rate, low_stock_at, notes,
    width_ft, length_ft, created_by
  )
  values (
    coalesce(p_id, gen_random_uuid()),
    p_name, p_size, p_gsm,
    nullif(trim(coalesce(p_spec, '')), ''),
    p_default_rate, coalesce(p_low_stock_at, 0), p_notes,
    p_width_ft, p_length_ft, auth.uid()
  )
  -- The id comes from the phone, so a retry of a request that already landed
  -- must not create a second product.
  on conflict (id) do nothing
  returning id into new_id;

  return coalesce(new_id, p_id);
end;
$$;
