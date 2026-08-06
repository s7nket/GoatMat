-- Migration 003 -- bill entry.
--
-- Run once in Supabase Studio > SQL Editor. Safe to re-run.
--
-- A bill and its line items must appear together or not at all. Inserting the
-- bill from the app and then the items in a second call leaves a totalled-zero
-- orphan bill on the books whenever the phone loses signal between the two.
-- These functions do both inside one transaction.
--
-- Deliberately NOT security definer: they run as the caller, so the RLS
-- policies still apply and a non-member gets nothing.

create or replace function create_sale(
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

  insert into sales (customer_id, bill_date, payment_mode, paid_amount, notes, created_by)
  values (
    p_customer_id,
    coalesce(p_bill_date, current_date),
    p_payment_mode,
    coalesce(p_paid_amount, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning id into new_id;

  -- total_amount is set by the line-item trigger, not by the caller.
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
    supplier_id, bill_date, supplier_ref, payment_mode, paid_amount, notes, created_by
  )
  values (
    p_supplier_id,
    coalesce(p_bill_date, current_date),
    nullif(trim(coalesce(p_supplier_ref, '')), ''),
    p_payment_mode,
    coalesce(p_paid_amount, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning id into new_id;

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

-- Voiding is the only way to undo a bill. The row stays, drops out of every
-- view and report, and the stock it moved is released.
create or replace function void_sale(p_id uuid, p_reason text)
returns void
language sql
set search_path = public
as $$
  update sales
     set voided_at = now(),
         voided_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_id and voided_at is null;
$$;

create or replace function void_purchase(p_id uuid, p_reason text)
returns void
language sql
set search_path = public
as $$
  update purchases
     set voided_at = now(),
         voided_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_id and voided_at is null;
$$;
