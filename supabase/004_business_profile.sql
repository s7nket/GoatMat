-- Migration 004 -- business profile.
--
-- Run once in Supabase Studio > SQL Editor. Safe to re-run.
--
-- A bill handed to a customer has to say who issued it. These details are
-- edited in the app under Settings rather than hard-coded, so changing a phone
-- number does not need a new APK.

create table if not exists business_profile (
  -- Single-row table: the primary key can only ever hold true, so a second
  -- insert collides instead of quietly creating a rival profile.
  id            boolean primary key default true check (id),
  business_name text not null default 'GoatMat',
  owner_name    text,
  phone         text,
  address       text,
  bill_footer   text,
  updated_at    timestamptz not null default now()
);

insert into business_profile (id) values (true) on conflict (id) do nothing;

drop trigger if exists business_profile_touch on business_profile;
create trigger business_profile_touch
before update on business_profile
for each row execute function touch_updated_at();

alter table business_profile enable row level security;

drop policy if exists business_profile_member_all on business_profile;
create policy business_profile_member_all on business_profile
  for all using (is_member()) with check (is_member());
