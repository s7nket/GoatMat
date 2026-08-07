-- Migration 006 -- one business per user.
--
-- Run once in Supabase Studio > SQL Editor. Safe to re-run.
--
-- Until now there was one shared business: RLS asked "are you on the roster",
-- so every member saw every row. This changes it to "is this row yours".
--
-- There are no staff. Each user is the sole owner of their own books and can
-- never see anyone else's, so the tenant is simply the user.

-- ---------------------------------------------------------------------------
-- 1. profiles -- replaces both `members` and the single-row `business_profile`.
--    One row per user, holding their business details and the kill switch.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  business_name text not null default 'My Business',
  owner_name    text,
  phone         text,
  address       text,
  bill_footer   text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Carry over anything the old tables held. Guarded on their existence, since
-- section 8 drops them and this file has to survive a second run.
do $$
begin
  if to_regclass('public.members') is not null then
    insert into profiles (user_id, owner_name, active, created_at)
    select m.user_id, m.full_name, m.active, m.created_at
    from members m
    on conflict (user_id) do nothing;
  end if;

  -- business_profile was global, so its details belong to whoever was using
  -- the app before the split -- the earliest account.
  if to_regclass('public.business_profile') is not null then
    update profiles p
       set business_name = coalesce(nullif(b.business_name, ''), p.business_name),
           phone         = coalesce(p.phone, b.phone),
           address       = coalesce(p.address, b.address),
           bill_footer   = coalesce(p.bill_footer, b.bill_footer),
           owner_name    = coalesce(p.owner_name, b.owner_name)
    from business_profile b
    where p.user_id = (select id from auth.users order by created_at limit 1);
  end if;
end;
$$;

-- Anyone in auth but not yet in profiles (created before this migration).
insert into profiles (user_id, owner_name)
select u.id, initcap(replace(split_part(u.email, '@', 1), '.', ' '))
from auth.users u
on conflict (user_id) do nothing;

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch
before update on profiles
for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Ownership on every data table.
--
--    The default is what makes this safe: Postgres stamps the owner, the app
--    never sends it, and a client bug cannot write into someone else's books.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'products','parties','purchases','purchase_items','sales','sale_items','payments','expenses'
  ] loop
    execute format('alter table %I add column if not exists owner_id uuid references auth.users (id)', t);
  end loop;
end;
$$;

-- Backfill. Rows carry created_by; anything older than that belongs to the
-- first account, which was the only one that existed.
do $$
declare
  fallback uuid := (select id from auth.users order by created_at limit 1);
begin
  update products       set owner_id = coalesce(created_by, fallback) where owner_id is null;
  update parties        set owner_id = coalesce(created_by, fallback) where owner_id is null;
  update purchases      set owner_id = coalesce(created_by, fallback) where owner_id is null;
  update sales          set owner_id = coalesce(created_by, fallback) where owner_id is null;
  update payments       set owner_id = coalesce(created_by, fallback) where owner_id is null;
  update expenses       set owner_id = coalesce(created_by, fallback) where owner_id is null;

  -- Line items inherit from their bill rather than guessing.
  update purchase_items pi set owner_id = pu.owner_id
    from purchases pu where pu.id = pi.purchase_id and pi.owner_id is null;
  update sale_items si set owner_id = sa.owner_id
    from sales sa where sa.id = si.sale_id and si.owner_id is null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'products','parties','purchases','purchase_items','sales','sale_items','payments','expenses'
  ] loop
    execute format('alter table %I alter column owner_id set default auth.uid()', t);
    execute format('alter table %I alter column owner_id set not null', t);
    execute format('create index if not exists %I_owner_idx on %I (owner_id)', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Bill numbers, per owner.
--
--    bill_no was one identity column shared by everyone. Two businesses would
--    interleave, and each would see gaps in its own numbering. A counter row
--    per owner is taken under a row lock, so two devices cannot claim the
--    same number.
-- ---------------------------------------------------------------------------
create table if not exists bill_counters (
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind     text not null check (kind in ('sale', 'purchase')),
  next_no  integer not null default 0,
  primary key (owner_id, kind)
);

alter table bill_counters enable row level security;

drop policy if exists bill_counters_own on bill_counters;
create policy bill_counters_own on bill_counters
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Seed each owner's counter past whatever they already have, so existing bill
-- numbers are never handed out a second time.
insert into bill_counters (owner_id, kind, next_no)
select owner_id, 'sale', max(bill_no) from sales group by owner_id
on conflict (owner_id, kind) do update set next_no = greatest(bill_counters.next_no, excluded.next_no);

insert into bill_counters (owner_id, kind, next_no)
select owner_id, 'purchase', max(bill_no) from purchases group by owner_id
on conflict (owner_id, kind) do update set next_no = greatest(bill_counters.next_no, excluded.next_no);

create or replace function next_bill_no(p_kind text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_no integer;
begin
  -- on conflict ... do update takes a row lock, so concurrent callers queue up
  -- rather than both reading the same value.
  insert into bill_counters (owner_id, kind, next_no)
  values (auth.uid(), p_kind, 1)
  on conflict (owner_id, kind)
    do update set next_no = bill_counters.next_no + 1
  returning next_no into v_no;

  return v_no;
end;
$$;

-- The identity column has to go, or it keeps overriding the per-owner number.
alter table sales     alter column bill_no drop identity if exists;
alter table purchases alter column bill_no drop identity if exists;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_owner_bill_no_key') then
    alter table sales add constraint sales_owner_bill_no_key unique (owner_id, bill_no);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchases_owner_bill_no_key') then
    alter table purchases add constraint purchases_owner_bill_no_key unique (owner_id, bill_no);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security -- ownership, not membership.
--
--    `active` is kept so a user can be cut off from the table editor without
--    deleting them, exactly as before. It is a stable security-definer lookup,
--    so Postgres evaluates it once per statement rather than once per row.
-- ---------------------------------------------------------------------------
create or replace function is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select active from profiles where user_id = auth.uid()), false);
$$;

alter table profiles enable row level security;

drop policy if exists profiles_own on profiles;
create policy profiles_own on profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'products','parties','purchases','purchase_items','sales','sale_items','payments','expenses'
  ] loop
    -- The old membership policy would otherwise sit alongside the new one, and
    -- policies are OR-ed: everyone would still see everything.
    execute format('drop policy if exists %I_member_all on %I', t, t);
    execute format('drop policy if exists %I_own on %I', t, t);
    execute format(
      'create policy %I_own on %I for all using (owner_id = auth.uid() and is_active()) '
      || 'with check (owner_id = auth.uid() and is_active())', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Views -- scoped by the base tables' RLS, so each owner sees only theirs.
--    Recreated because they now need to carry owner_id through.
-- ---------------------------------------------------------------------------
drop view if exists stock_view;
create view stock_view
with (security_invoker = true)
as
select
  p.id, p.name, p.size, p.gsm, p.default_rate, p.low_stock_at,
  coalesce(b.bought, 0) as total_bought,
  coalesce(s.sold, 0)   as total_sold,
  coalesce(b.bought, 0) - coalesce(s.sold, 0) as qty_left
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
where p.archived = false;

drop view if exists party_balance_view;
create view party_balance_view
with (security_invoker = true)
as
select
  pt.id, pt.kind, pt.name, pt.phone,
  coalesce(sa.billed, 0)    as total_billed,
  coalesce(pu.billed, 0)    as total_purchased,
  coalesce(pay.received, 0) as total_received,
  coalesce(pay.paid, 0)     as total_paid,
  (coalesce(sa.billed, 0) - coalesce(pay.received, 0) - coalesce(sa.paid_at_bill, 0))
  - (coalesce(pu.billed, 0) - coalesce(pay.paid, 0) - coalesce(pu.paid_at_bill, 0)) as balance
from parties pt
left join (
  select customer_id, sum(total_amount) as billed, sum(paid_amount) as paid_at_bill
  from sales where voided_at is null group by customer_id
) sa on sa.customer_id = pt.id
left join (
  select supplier_id, sum(total_amount) as billed, sum(paid_amount) as paid_at_bill
  from purchases where voided_at is null group by supplier_id
) pu on pu.supplier_id = pt.id
left join (
  select party_id,
         sum(amount) filter (where direction = 'in')  as received,
         sum(amount) filter (where direction = 'out') as paid
  from payments where voided_at is null group by party_id
) pay on pay.party_id = pt.id
where pt.archived = false;

-- ---------------------------------------------------------------------------
-- 6. Bill creation, now allocating a per-owner number.
--
--    The existence check comes before the counter is touched. A retry of a
--    request that already succeeded must not burn a bill number, or the books
--    show gaps that look like deleted bills.
-- ---------------------------------------------------------------------------
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
  v_no integer;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'A bill needs at least one item';
  end if;

  if p_id is not null and exists (select 1 from sales where id = p_id) then
    return p_id;
  end if;

  v_no := next_bill_no('sale');

  insert into sales (id, bill_no, customer_id, bill_date, payment_mode, paid_amount, notes, created_by)
  values (
    coalesce(p_id, gen_random_uuid()),
    v_no,
    p_customer_id,
    coalesce(p_bill_date, current_date),
    p_payment_mode,
    coalesce(p_paid_amount, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
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
    id, bill_no, supplier_id, bill_date, supplier_ref, payment_mode, paid_amount, notes, created_by
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

-- ---------------------------------------------------------------------------
-- 7. New accounts get a profile.
--    Sign-ups stay disabled -- accounts are created by hand in Studio -- but
--    the row still has to exist or the new user has no business name.
-- ---------------------------------------------------------------------------
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (user_id, owner_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      initcap(replace(split_part(new.email, '@', 1), '.', ' ')),
      'Owner'
    )
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 8. Retire the shared-business machinery.
--    Done last, so nothing above is referencing it when it disappears.
-- ---------------------------------------------------------------------------
drop table if exists business_profile;
drop table if exists members;
drop function if exists is_member();
