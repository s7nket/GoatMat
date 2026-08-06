-- Migration 002 -- automatic membership.
--
-- Run this once in Supabase Studio > SQL Editor if you already ran the earlier
-- version of schema.sql. Fresh projects do not need it: schema.sql now contains
-- all of this. Safe to re-run either way.
--
-- What changes: membership rows stop being hand-inserted. Adding a user in
-- Studio (Authentication > Users > Add user) is now the only step -- a trigger
-- creates their membership. To revoke access later, set members.active = false
-- in the table editor; their login survives but every query starts failing.

alter table members add column if not exists active boolean not null default true;

create or replace function is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from members
    where user_id = auth.uid() and active
  );
$$;

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_user boolean;
  display    text;
begin
  select count(*) = 0 into first_user from members;

  display := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    initcap(replace(split_part(new.email, '@', 1), '.', ' ')),
    'Member'
  );

  insert into members (user_id, full_name, role)
  values (new.id, display, case when first_user then 'owner' else 'staff' end)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_auth_user();

-- Backfill users created before the trigger existed.
insert into members (user_id, full_name, role)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    initcap(replace(split_part(u.email, '@', 1), '.', ' ')),
    'Member'
  ),
  case when row_number() over (order by u.created_at) = 1 then 'owner' else 'staff' end
from auth.users u
on conflict (user_id) do nothing;
