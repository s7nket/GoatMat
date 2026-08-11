-- Migration 011 -- warranty and terms printed on the bill.
--
-- Run once in Supabase Studio > SQL Editor. Safe to re-run.
--
-- Held per account rather than hard-coded. Several businesses use this app and
-- their terms are their own: one seller's warranty period and weight limit
-- have no business appearing on another's invoice.
--
-- Left empty by default for the same reason. Nothing is printed until the
-- owner writes their own, and the app offers a starting point to edit rather
-- than assuming one.

alter table profiles add column if not exists warranty text;
alter table profiles add column if not exists bill_terms text;

comment on column profiles.warranty is
  'Short warranty line printed on the bill, e.g. "4 years". Free text: warranties are quoted in years, seasons or usage, and a number column would force one of those.';

comment on column profiles.bill_terms is
  'Terms and conditions, one per line. Rendered as a numbered list on the bill.';
