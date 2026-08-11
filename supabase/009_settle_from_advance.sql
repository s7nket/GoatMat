-- Migration 009 -- settling a bill from an advance already taken.
--
-- Run once in Supabase Studio > SQL Editor. Safe to re-run.
--
-- A customer pays ahead, then collects the mats later. The balance already
-- handles this -- the advance is negative, the bill is positive, they cancel --
-- but until now the bill had to be recorded as 'credit', which says the
-- opposite of what happened. They did not take it on credit; they had already
-- paid.
--
-- Recording it as cash was the dangerous alternative: paid_amount would be set
-- to the full total, so the books would show the advance still untouched *and*
-- another payment at the counter that never happened.

do $$
declare
  constraint_name text;
begin
  foreach constraint_name in array array['sales_payment_mode_check', 'purchases_payment_mode_check']
  loop
    execute format('alter table %I drop constraint if exists %I',
      split_part(constraint_name, '_payment_mode_check', 1), constraint_name);
  end loop;
end;
$$;

alter table sales
  add constraint sales_payment_mode_check
  check (payment_mode in ('cash', 'upi', 'bank', 'credit', 'advance'));

alter table purchases
  add constraint purchases_payment_mode_check
  check (payment_mode in ('cash', 'upi', 'bank', 'credit', 'advance'));
