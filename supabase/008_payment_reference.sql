-- Migration 008 -- a reference number for UPI and bank transactions.
--
-- Run once in Supabase Studio > SQL Editor. Safe to re-run.
--
-- Cash leaves no trace and needs none. A UPI or bank transfer has a UTR,
-- cheque number or transaction id, and that is what settles an argument months
-- later when a customer says a payment was never received. It was only being
-- kept in people's heads.
--
-- Deliberately free text and never validated: UTRs are twelve digits, but
-- cheque numbers, NEFT references and bank statement ids all look different,
-- and rejecting a valid reference is worse than storing an odd-looking one.

alter table sales     add column if not exists reference text;
alter table purchases add column if not exists reference text;
alter table payments  add column if not exists reference text;

-- Looking a payment up by its reference is the actual question when one is
-- disputed. Partial, because most rows have no reference at all.
create index if not exists sales_reference_idx     on sales (reference)     where reference is not null;
create index if not exists purchases_reference_idx on purchases (reference) where reference is not null;
create index if not exists payments_reference_idx  on payments (reference)  where reference is not null;

-- ---------------------------------------------------------------------------
-- The create functions gain the parameter. Argument lists change, so the old
-- versions are dropped rather than left as overloads for PostgREST to guess
-- between.
-- ---------------------------------------------------------------------------
drop function if exists create_sale(uuid, uuid, date, text, numeric, text, jsonb);
drop function if exists create_purchase(uuid, uuid, date, text, text, numeric, text, jsonb);
drop function if exists create_payment(uuid, uuid, date, numeric, text, text, text);

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
    coalesce(p_id, gen_random_uuid()),
    v_no,
    p_customer_id,
    coalesce(p_bill_date, current_date),
    p_payment_mode,
    coalesce(p_paid_amount, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_reference, '')), ''),
    auth.uid()
  )
  on conflict (id) do nothing;

  insert into sale_items (sale_id, product_id, qty, rate)
  select
    coalesce(p_id, (select id from sales where bill_no = v_no and owner_id = auth.uid())),
    (item ->> 'product_id')::uuid,
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
    coalesce(p_id, gen_random_uuid()),
    v_no,
    p_supplier_id,
    coalesce(p_bill_date, current_date),
    nullif(trim(coalesce(p_supplier_ref, '')), ''),
    p_payment_mode,
    coalesce(p_paid_amount, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_reference, '')), ''),
    auth.uid()
  )
  on conflict (id) do nothing;

  insert into purchase_items (purchase_id, product_id, qty, rate)
  select
    coalesce(p_id, (select id from purchases where bill_no = v_no and owner_id = auth.uid())),
    (item ->> 'product_id')::uuid,
    (item ->> 'qty')::integer,
    (item ->> 'rate')::numeric
  from jsonb_array_elements(p_items) as item;

  return coalesce(p_id, (select id from purchases where bill_no = v_no and owner_id = auth.uid()));
end;
$$;

create or replace function create_payment(
  p_id        uuid,
  p_party_id  uuid,
  p_pay_date  date,
  p_amount    numeric,
  p_direction text,
  p_mode      text,
  p_note      text,
  p_reference text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_id uuid;
begin
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'A payment needs an amount';
  end if;

  insert into payments (
    id, party_id, pay_date, amount, direction, mode, note, reference, created_by
  )
  values (
    coalesce(p_id, gen_random_uuid()),
    p_party_id,
    coalesce(p_pay_date, current_date),
    p_amount,
    p_direction,
    p_mode,
    nullif(trim(coalesce(p_note, '')), ''),
    nullif(trim(coalesce(p_reference, '')), ''),
    auth.uid()
  )
  on conflict (id) do nothing
  returning id into new_id;

  return coalesce(new_id, p_id);
end;
$$;
