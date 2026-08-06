-- GoatMat - database schema
-- Run this once in Supabase Studio > SQL Editor.
-- Safe to re-run: everything is guarded with IF NOT EXISTS / OR REPLACE.

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Membership -- the single gate every RLS policy leans on.
--    Only rows in this table, with active = true, can touch business data.
--
--    Rows are created automatically by the trigger below whenever you add a
--    user in Supabase Studio. Nothing is hand-inserted. To revoke access,
--    flip `active` to false in the table editor -- the person keeps their
--    login but every read and write starts failing immediately, and their
--    history stays attached to their name.
-- ---------------------------------------------------------------------------
create table if not exists members (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  role        text not null default 'staff' check (role in ('owner', 'staff')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

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

-- Every new auth user gets a membership row. The first one is the owner.
-- Name comes from the metadata you can set when inviting; otherwise it is
-- derived from the email so the app always has something to greet them with.
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

-- Backfill anyone who already existed before the trigger did.
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

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Master data
-- ---------------------------------------------------------------------------
create table if not exists products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  size         text,                       -- e.g. '6x8 ft'
  gsm          integer,                    -- mat thickness / weight grade
  hsn          text,                       -- kept for the day a pakka bill is needed
  default_rate numeric(12, 2),             -- suggested selling rate per piece
  low_stock_at integer not null default 0, -- warn on Home when qty_left <= this
  notes        text,
  archived     boolean not null default false,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists parties (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('supplier', 'customer')),
  name        text not null,
  phone       text,
  address     text,
  notes       text,
  archived    boolean not null default false,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists parties_kind_idx on parties (kind) where archived = false;

-- ---------------------------------------------------------------------------
-- 4. Transactions
--    A bill is append-only: to correct one you void it and enter a new one.
--    Voided bills stay for the audit trail and drop out of every view/report.
-- ---------------------------------------------------------------------------
create table if not exists purchases (
  id            uuid primary key default gen_random_uuid(),
  bill_no       integer generated by default as identity,
  supplier_id   uuid not null references parties (id),
  bill_date     date not null default current_date,
  supplier_ref  text,                       -- supplier's own bill number, if any
  total_amount  numeric(12, 2) not null default 0,
  paid_amount   numeric(12, 2) not null default 0,
  payment_mode  text check (payment_mode in ('cash', 'upi', 'bank', 'credit')),
  notes         text,
  voided_at     timestamptz,
  voided_reason text,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists purchase_items (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases (id) on delete cascade,
  product_id  uuid not null references products (id),
  qty         integer not null check (qty > 0),      -- pieces
  rate        numeric(12, 2) not null check (rate >= 0),
  amount      numeric(12, 2) generated always as (qty * rate) stored
);

create index if not exists purchase_items_purchase_idx on purchase_items (purchase_id);
create index if not exists purchase_items_product_idx on purchase_items (product_id);

create table if not exists sales (
  id            uuid primary key default gen_random_uuid(),
  bill_no       integer generated by default as identity,
  customer_id   uuid not null references parties (id),
  bill_date     date not null default current_date,
  total_amount  numeric(12, 2) not null default 0,
  paid_amount   numeric(12, 2) not null default 0,
  payment_mode  text check (payment_mode in ('cash', 'upi', 'bank', 'credit')),
  notes         text,
  voided_at     timestamptz,
  voided_reason text,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists sale_items (
  id         uuid primary key default gen_random_uuid(),
  sale_id    uuid not null references sales (id) on delete cascade,
  product_id uuid not null references products (id),
  qty        integer not null check (qty > 0),       -- pieces
  rate       numeric(12, 2) not null check (rate >= 0),
  amount     numeric(12, 2) generated always as (qty * rate) stored
);

create index if not exists sale_items_sale_idx on sale_items (sale_id);
create index if not exists sale_items_product_idx on sale_items (product_id);

create index if not exists purchases_date_idx on purchases (bill_date desc) where voided_at is null;
create index if not exists sales_date_idx on sales (bill_date desc) where voided_at is null;

-- ---------------------------------------------------------------------------
-- 5. Money movement outside a bill (udhaar settlement, advances)
-- ---------------------------------------------------------------------------
create table if not exists payments (
  id         uuid primary key default gen_random_uuid(),
  party_id   uuid not null references parties (id),
  pay_date   date not null default current_date,
  amount     numeric(12, 2) not null check (amount > 0),
  direction  text not null check (direction in ('in', 'out')), -- in = we received
  mode       text check (mode in ('cash', 'upi', 'bank')),
  note       text,
  voided_at  timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_party_idx on payments (party_id) where voided_at is null;

-- A bill handed to a customer has to say who issued it. Edited in the app under
-- Settings, so changing a phone number does not need a new APK.
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

create table if not exists expenses (
  id         uuid primary key default gen_random_uuid(),
  spend_date date not null default current_date,
  category   text not null check (category in ('transport', 'labour', 'rent', 'fuel', 'misc')),
  amount     numeric(12, 2) not null check (amount > 0),
  note       text,
  voided_at  timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_date_idx on expenses (spend_date desc) where voided_at is null;

-- ---------------------------------------------------------------------------
-- 6. Keep bill totals honest.
--    total_amount is always the sum of its live line items -- never hand-typed.
-- ---------------------------------------------------------------------------
create or replace function recalc_purchase_total()
returns trigger
language plpgsql
as $$
declare
  target uuid := coalesce(new.purchase_id, old.purchase_id);
begin
  update purchases p
     set total_amount = coalesce((select sum(amount) from purchase_items where purchase_id = target), 0),
         updated_at   = now()
   where p.id = target;
  return null;
end;
$$;

drop trigger if exists purchase_items_total on purchase_items;
create trigger purchase_items_total
after insert or update or delete on purchase_items
for each row execute function recalc_purchase_total();

create or replace function recalc_sale_total()
returns trigger
language plpgsql
as $$
declare
  target uuid := coalesce(new.sale_id, old.sale_id);
begin
  update sales s
     set total_amount = coalesce((select sum(amount) from sale_items where sale_id = target), 0),
         updated_at   = now()
   where s.id = target;
  return null;
end;
$$;

drop trigger if exists sale_items_total on sale_items;
create trigger sale_items_total
after insert or update or delete on sale_items
for each row execute function recalc_sale_total();

-- updated_at on every mutable table
do $$
declare t text;
begin
  foreach t in array array[
    'products','parties','purchases','sales','payments','expenses','business_profile'
  ] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Derived views. Stock is never stored -- it cannot drift.
-- ---------------------------------------------------------------------------
create or replace view stock_view as
select
  p.id,
  p.name,
  p.size,
  p.gsm,
  p.default_rate,
  p.low_stock_at,
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

-- Positive balance = they owe us. Negative = we owe them.
create or replace view party_balance_view as
select
  pt.id,
  pt.kind,
  pt.name,
  pt.phone,
  coalesce(sa.billed, 0)  as total_billed,
  coalesce(pu.billed, 0)  as total_purchased,
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
-- 8. Row Level Security.
--    The anon key shipped inside the APK is public by design -- these policies,
--    not key secrecy, are what protect the data. Nothing is readable logged out.
-- ---------------------------------------------------------------------------
alter table members          enable row level security;
alter table business_profile enable row level security;
alter table products       enable row level security;
alter table parties        enable row level security;
alter table purchases      enable row level security;
alter table purchase_items enable row level security;
alter table sales          enable row level security;
alter table sale_items     enable row level security;
alter table payments       enable row level security;
alter table expenses       enable row level security;

-- A member may read the roster, but only the owner may change it.
drop policy if exists members_read on members;
create policy members_read on members
  for select using (is_member());

do $$
declare t text;
begin
  foreach t in array array[
    'products','parties','purchases','purchase_items','sales','sale_items','payments','expenses',
    'business_profile'
  ] loop
    execute format('drop policy if exists %I_member_all on %I', t, t);
    execute format(
      'create policy %I_member_all on %I for all using (is_member()) with check (is_member())', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Bill entry.
--    A bill and its line items must appear together or not at all. Inserting
--    the bill and then the items in a second round trip leaves a zero-total
--    orphan on the books whenever the phone loses signal in between.
--
--    Deliberately not security definer: these run as the caller, so the RLS
--    policies above still apply.
-- ---------------------------------------------------------------------------
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

-- Voiding is the only way to undo a bill. The row stays for the audit trail,
-- drops out of every view and report, and releases the stock it moved.
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
