-- Migration 005 -- idempotent bill creation.
--
-- Run once in Supabase Studio > SQL Editor. Safe to re-run.
--
-- Why this exists: with an outbox, a failed request gets retried. But a request
-- can fail *after* Postgres has already committed -- the signal drops while the
-- response is coming back. The retry then writes the bill a second time, and
-- nobody notices, because both copies look correct.
--
-- The fix is for the phone to decide the bill's id before sending. A retry
-- carries the same id, and the insert does nothing the second time.

create or replace function create_sale(
  p_id           uuid,
  p_customer_id  uuid,
  p_bill_date    date,
  p_payment_mode text,
  p_paid_amount  numeric,
  p_notes        text,
  p_items        jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_id uuid;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'A bill needs at least one item';
  end if;

  insert into sales (id, customer_id, bill_date, payment_mode, paid_amount, notes, created_by)
  values (
    coalesce(p_id, gen_random_uuid()),
    p_customer_id,
    coalesce(p_bill_date, current_date),
    p_payment_mode,
    coalesce(p_paid_amount, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  on conflict (id) do nothing
  returning id into new_id;

  -- No id returned means this bill already landed on an earlier attempt.
  -- Return quietly: the caller's retry has succeeded, there is nothing to add.
  if new_id is null then
    return p_id;
  end if;

  insert into sale_items (sale_id, product_id, qty, rate)
  select
    new_id,
    (item ->> 'product_id')::uuid,
    (item ->> 'qty')::integer,
    (item ->> 'rate')::numeric
  from jsonb_array_elements(p_items) as item;

  return new_id;
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
  p_items        jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_id uuid;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'A bill needs at least one item';
  end if;

  insert into purchases (
    id, supplier_id, bill_date, supplier_ref, payment_mode, paid_amount, notes, created_by
  )
  values (
    coalesce(p_id, gen_random_uuid()),
    p_supplier_id,
    coalesce(p_bill_date, current_date),
    nullif(trim(coalesce(p_supplier_ref, '')), ''),
    p_payment_mode,
    coalesce(p_paid_amount, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  on conflict (id) do nothing
  returning id into new_id;

  if new_id is null then
    return p_id;
  end if;

  insert into purchase_items (purchase_id, product_id, qty, rate)
  select
    new_id,
    (item ->> 'product_id')::uuid,
    (item ->> 'qty')::integer,
    (item ->> 'rate')::numeric
  from jsonb_array_elements(p_items) as item;

  return new_id;
end;
$$;

-- The old five- and seven-argument versions would otherwise sit alongside the
-- new ones as overloads, and PostgREST would have to guess which to call.
drop function if exists create_sale(uuid, date, text, numeric, text, jsonb);
drop function if exists create_purchase(uuid, date, text, text, numeric, text, jsonb);

-- Products and parties are created offline too, so they need the same
-- treatment: the client supplies the id, and a replay is a no-op.
create or replace function create_product(
  p_id           uuid,
  p_name         text,
  p_size         text,
  p_gsm          integer,
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
  insert into products (id, name, size, gsm, default_rate, low_stock_at, notes, created_by)
  values (
    coalesce(p_id, gen_random_uuid()),
    p_name, p_size, p_gsm, p_default_rate, coalesce(p_low_stock_at, 0), p_notes, auth.uid()
  )
  on conflict (id) do nothing
  returning id into new_id;

  return coalesce(new_id, p_id);
end;
$$;

create or replace function create_party(
  p_id      uuid,
  p_kind    text,
  p_name    text,
  p_phone   text,
  p_address text,
  p_notes   text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into parties (id, kind, name, phone, address, notes, created_by)
  values (
    coalesce(p_id, gen_random_uuid()),
    p_kind, p_name, p_phone, p_address, p_notes, auth.uid()
  )
  on conflict (id) do nothing
  returning id into new_id;

  return coalesce(new_id, p_id);
end;
$$;
