-- Migration 007 -- payments against a running balance.
--
-- Run once in Supabase Studio > SQL Editor. Safe to re-run.
--
-- Until now money could only be recorded at the moment a bill was created, so
-- there was nowhere to put "Ramesh owed 8,000 and handed over 5,000 today".
-- That is most of how this trade actually settles.
--
-- The payments table and party_balance_view already account for these rows;
-- what was missing was a way to create one. Same shape as bill creation: the
-- client supplies the id so a retry after a dropped connection cannot record
-- the same money twice.

create or replace function create_payment(
  p_id       uuid,
  p_party_id uuid,
  p_pay_date date,
  p_amount   numeric,
  p_direction text,
  p_mode     text,
  p_note     text
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

  insert into payments (id, party_id, pay_date, amount, direction, mode, note, created_by)
  values (
    coalesce(p_id, gen_random_uuid()),
    p_party_id,
    coalesce(p_pay_date, current_date),
    p_amount,
    p_direction,
    p_mode,
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid()
  )
  on conflict (id) do nothing
  returning id into new_id;

  -- Nothing returned means an earlier attempt already landed this payment.
  return coalesce(new_id, p_id);
end;
$$;

-- Voided rather than deleted, like bills: party_balance_view already ignores
-- rows with voided_at set, and a receipt that vanishes without trace is worse
-- than one marked cancelled.
create or replace function void_payment(p_id uuid)
returns void
language sql
set search_path = public
as $$
  update payments
     set voided_at = now()
   where id = p_id and voided_at is null;
$$;
