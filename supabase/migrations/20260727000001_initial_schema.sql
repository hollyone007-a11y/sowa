-- SOWA — housing, residents, payments, debt, QR onboarding and expenses.
-- Single consolidated schema for a fresh Supabase project.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------- types

create type public.app_role as enum ('admin', 'manager', 'accountant', 'viewer');
create type public.property_status as enum ('active', 'closed');
create type public.person_kind as enum ('employee', 'external');
create type public.payment_method as enum ('cash', 'salary', 'free');
create type public.payment_status as enum ('unpaid', 'partial', 'paid', 'tracking');
create type public.deposit_status as enum ('none', 'paid', 'returned', 'applied');
create type public.application_status as enum ('pending', 'approved', 'rejected');
create type public.expense_category as enum ('utilities', 'repairs', 'services', 'equipment', 'other');

-- ------------------------------------------------------------------ tables

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  year smallint not null check (year between 2020 and 2100),
  month smallint not null check (month between 1 and 12),
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (year, month)
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  full_address text not null,
  contact_name text,
  phone text,
  email text,
  capacity integer not null check (capacity > 0),
  -- What the agency pays the landlord for this address every month.
  monthly_cost numeric(12,2) not null default 0 check (monthly_cost >= 0),
  status public.property_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  capacity integer not null default 1 check (capacity > 0),
  created_at timestamptz not null default now(),
  unique (property_id, name)
);

create table public.beds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (room_id, name)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  employee_id text,
  first_name text not null,
  last_name text not null,
  phone text,
  workplace text,
  kind public.person_kind not null default 'employee',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Identity documents live apart from everything else so that a policy, not a
-- column list, decides who can read them.
create table public.resident_profiles_private (
  person_id uuid primary key references public.people(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  passport_series text,
  passport_number text,
  ukraine_registration text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stays (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete restrict,
  person_id uuid not null references public.people(id) on delete restrict,
  property_id uuid references public.properties(id) on delete restrict,
  room_id uuid references public.rooms(id) on delete restrict,
  bed_id uuid references public.beds(id) on delete restrict,
  move_in date not null,
  move_out date,
  price numeric(12,2) not null default 0 check (price >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  payment_method public.payment_method not null default 'salary',
  payment_status public.payment_status not null default 'unpaid',
  deposit_status public.deposit_status not null default 'none',
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, person_id),
  unique (id, period_id),
  check (move_out is null or move_out >= move_in),
  check (paid_amount <= price or payment_method = 'free')
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null,
  period_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null,
  paid_at timestamptz not null default now(),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (stay_id, period_id) references public.stays(id, period_id) on delete cascade
);

create table public.property_expenses (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  category public.expense_category not null,
  amount numeric(12,2) not null check (amount > 0),
  description text,
  incurred_on date not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One public token per address; rotating it invalidates every printed code.
create table public.property_links (
  property_id uuid primary key references public.properties(id) on delete cascade,
  public_token uuid not null unique default gen_random_uuid(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table public.housing_applications (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  phone text not null,
  workplace text,
  passport_series text,
  passport_number text not null,
  ukraine_registration text not null,
  requested_move_in date not null,
  consent_at timestamptz not null,
  status public.application_status not null default 'pending',
  person_id uuid references public.people(id) on delete set null,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  check (length(trim(first_name)) between 2 and 100),
  check (length(trim(last_name)) between 2 and 100),
  check (length(trim(phone)) between 7 and 32),
  check (workplace is null or length(trim(workplace)) <= 200),
  check (passport_series is null or length(trim(passport_series)) <= 20),
  check (length(trim(passport_number)) between 3 and 32),
  check (length(trim(ukraine_registration)) between 3 and 500)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  operation text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- indexes

create index stays_period_property_idx on public.stays (period_id, property_id);
create index stays_period_status_idx on public.stays (period_id, payment_status);
create index stays_period_person_idx on public.stays (period_id, person_id);
create index stays_person_idx on public.stays (person_id);
create index payments_period_idx on public.payments (period_id, paid_at);
create index periods_year_month_idx on public.periods (year, month);
create index property_expenses_period_property_idx on public.property_expenses (period_id, property_id);
create index housing_applications_property_status_idx
  on public.housing_applications (property_id, status, created_at desc);
create index housing_applications_duplicate_guard_idx
  on public.housing_applications (property_id, passport_number, created_at desc);
create index people_search_idx on public.people using gin (
  to_tsvector('simple',
    coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' ||
    coalesce(phone, '') || ' ' || coalesce(workplace, ''))
);

-- ------------------------------------------------------------------- roles

-- Named `current_app_role` rather than `current_role`, which is a reserved
-- word in PostgreSQL and resolves to the built-in unless schema-qualified.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'viewer'::public.app_role);
$$;

create or replace function public.has_role(allowed public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.current_app_role() = any(allowed);
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.has_role(public.app_role[]) from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_role(public.app_role[]) to authenticated;

-- The first account ever created becomes the administrator; everyone after it
-- starts read-only and is promoted from `public.profiles` by hand. Without
-- this, a fresh project has no one who can do anything.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare is_first boolean;
begin
  select count(*) = 0 into is_first from public.profiles;
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    case when is_first then 'admin' else 'viewer' end::public.app_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Safety net for accounts that existed before the trigger did.
create or replace function public.ensure_profile()
returns table (role public.app_role, display_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  is_first boolean;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select count(*) = 0 into is_first from public.profiles;

  insert into public.profiles (id, display_name, role)
  values (
    uid,
    (select coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1))
     from auth.users u where u.id = uid),
    case when is_first then 'admin' else 'viewer' end::public.app_role
  )
  on conflict (id) do nothing;

  return query select p.role, p.display_name from public.profiles p where p.id = uid;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;

-- ------------------------------------------------------------------- audit

create or replace function public.audit_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (table_name, record_id, operation, old_data, new_data, changed_by)
  values (
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create trigger properties_audit after insert or update or delete on public.properties
for each row execute function public.audit_changes();
create trigger people_audit after insert or update or delete on public.people
for each row execute function public.audit_changes();
create trigger stays_audit after insert or update or delete on public.stays
for each row execute function public.audit_changes();
create trigger payments_audit after insert or update or delete on public.payments
for each row execute function public.audit_changes();
create trigger expenses_audit after insert or update or delete on public.property_expenses
for each row execute function public.audit_changes();

-- ----------------------------------------------------------------- periods

-- Runs as definer: the role check below is the real gate, and going through
-- the caller's RLS would stop a viewer from so much as opening a new month.
create or replace function public.ensure_period(p_year integer, p_month integer)
returns public.periods
language plpgsql
security definer
set search_path = public
as $$
declare result public.periods;
begin
  if not public.has_role(array['admin','manager','accountant','viewer']::public.app_role[]) then
    raise exception 'access denied';
  end if;
  if p_month < 1 or p_month > 12 then
    raise exception 'invalid month';
  end if;

  insert into public.periods (year, month)
  values (p_year, p_month)
  on conflict (year, month) do nothing;

  select * into result from public.periods where year = p_year and month = p_month;
  return result;
end;
$$;

-- --------------------------------------------------------------- residents

create or replace function public.create_resident_with_stay(
  p_period_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_workplace text,
  p_person_kind public.person_kind,
  p_property_id uuid,
  p_room_name text,
  p_bed_name text,
  p_move_in date,
  p_price numeric,
  p_payment_method public.payment_method,
  p_deposit_status public.deposit_status,
  p_passport_series text,
  p_passport_number text,
  p_ukraine_registration text,
  p_comment text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_person_id uuid;
  new_room_id uuid;
  new_bed_id uuid;
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then
    raise exception 'access denied';
  end if;
  if (select is_closed from public.periods where id = p_period_id) then
    raise exception 'period is closed';
  end if;

  insert into public.people (first_name, last_name, phone, workplace, kind)
  values (trim(p_first_name), trim(p_last_name), nullif(trim(p_phone), ''),
          nullif(trim(p_workplace), ''), p_person_kind)
  returning id into new_person_id;

  -- The questionnaire is created in the same transaction as the person.
  insert into public.resident_profiles_private (
    person_id, first_name, last_name, passport_series, passport_number, ukraine_registration
  ) values (
    new_person_id, trim(p_first_name), trim(p_last_name),
    nullif(trim(p_passport_series), ''), nullif(trim(p_passport_number), ''),
    nullif(trim(p_ukraine_registration), '')
  );

  if p_property_id is not null and nullif(trim(p_room_name), '') is not null then
    insert into public.rooms (property_id, name)
    values (p_property_id, trim(p_room_name))
    on conflict (property_id, name) do update set name = excluded.name
    returning id into new_room_id;
  end if;

  if new_room_id is not null and nullif(trim(p_bed_name), '') is not null then
    insert into public.beds (room_id, name)
    values (new_room_id, trim(p_bed_name))
    on conflict (room_id, name) do update set name = excluded.name
    returning id into new_bed_id;
  end if;

  insert into public.stays (
    period_id, person_id, property_id, room_id, bed_id, move_in, price,
    payment_method, payment_status, deposit_status, comment
  ) values (
    p_period_id, new_person_id, p_property_id, new_room_id, new_bed_id, p_move_in, p_price,
    p_payment_method,
    case when p_payment_method = 'free' then 'tracking' else 'unpaid' end::public.payment_status,
    coalesce(p_deposit_status, 'none'::public.deposit_status),
    nullif(trim(p_comment), '')
  );

  return new_person_id;
end;
$$;

-- Relocating, repricing, recording a deposit and moving out are one operation.
create or replace function public.update_stay_details(
  p_stay_id uuid,
  p_property_id uuid,
  p_room_name text,
  p_bed_name text,
  p_price numeric,
  p_payment_method public.payment_method,
  p_deposit_status public.deposit_status,
  p_move_out date,
  p_comment text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_stay public.stays;
  target_room_id uuid;
  target_bed_id uuid;
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then
    raise exception 'access denied';
  end if;

  select * into current_stay from public.stays where id = p_stay_id for update;
  if current_stay.id is null then
    raise exception 'stay not found';
  end if;
  if (select is_closed from public.periods where id = current_stay.period_id) then
    raise exception 'period is closed';
  end if;
  if p_payment_method <> 'free' and p_price < current_stay.paid_amount then
    raise exception 'price is lower than the amount already paid';
  end if;
  if p_move_out is not null and p_move_out < current_stay.move_in then
    raise exception 'move_out is before move_in';
  end if;

  if p_property_id is not null and nullif(trim(p_room_name), '') is not null then
    insert into public.rooms (property_id, name)
    values (p_property_id, trim(p_room_name))
    on conflict (property_id, name) do update set name = excluded.name
    returning id into target_room_id;
  end if;

  if target_room_id is not null and nullif(trim(p_bed_name), '') is not null then
    insert into public.beds (room_id, name)
    values (target_room_id, trim(p_bed_name))
    on conflict (room_id, name) do update set name = excluded.name
    returning id into target_bed_id;
  end if;

  update public.stays set
    property_id = p_property_id,
    room_id = target_room_id,
    bed_id = target_bed_id,
    price = p_price,
    payment_method = p_payment_method,
    deposit_status = p_deposit_status,
    move_out = p_move_out,
    comment = nullif(trim(p_comment), ''),
    payment_status = case
      when p_payment_method = 'free' then 'tracking'
      when current_stay.paid_amount <= 0 then 'unpaid'
      when current_stay.paid_amount >= p_price then 'paid'
      else 'partial'
    end,
    updated_at = now()
  where id = p_stay_id;
end;
$$;

create or replace function public.record_payment(p_stay_id uuid, p_amount numeric)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_stay public.stays;
  next_paid numeric;
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then
    raise exception 'access denied';
  end if;

  select * into current_stay from public.stays where id = p_stay_id for update;
  if current_stay.id is null then
    raise exception 'stay not found';
  end if;
  if (select is_closed from public.periods where id = current_stay.period_id) then
    raise exception 'period is closed';
  end if;
  if current_stay.payment_method = 'free' then
    raise exception 'this resident is not charged';
  end if;

  next_paid := current_stay.paid_amount + p_amount;
  if p_amount <= 0 or next_paid > current_stay.price then
    raise exception 'invalid payment amount';
  end if;

  insert into public.payments (stay_id, period_id, amount, method, created_by)
  values (current_stay.id, current_stay.period_id, p_amount, current_stay.payment_method, auth.uid());

  update public.stays set
    paid_amount = next_paid,
    payment_status = case when next_paid >= price then 'paid' else 'partial' end,
    updated_at = now()
  where id = current_stay.id;
end;
$$;

create or replace function public.copy_period(
  p_source_period_id uuid,
  p_target_period_id uuid,
  p_exclude_departed boolean default true
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare copied integer;
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then
    raise exception 'access denied';
  end if;
  if p_source_period_id = p_target_period_id then
    raise exception 'periods must differ';
  end if;
  if (select is_closed from public.periods where id = p_target_period_id) then
    raise exception 'target period is closed';
  end if;

  insert into public.stays (
    period_id, person_id, property_id, room_id, bed_id, move_in, move_out, price,
    paid_amount, payment_method, payment_status, deposit_status, comment
  )
  select
    p_target_period_id, person_id, property_id, room_id, bed_id,
    greatest(move_in, make_date(
      (select year from public.periods where id = p_target_period_id),
      (select month from public.periods where id = p_target_period_id), 1)),
    null, price, 0, payment_method,
    case when payment_method = 'free' then 'tracking'::public.payment_status
         else 'unpaid'::public.payment_status end,
    deposit_status, comment
  from public.stays
  where period_id = p_source_period_id
    and (not p_exclude_departed or move_out is null)
  on conflict (period_id, person_id) do nothing;

  get diagnostics copied = row_count;
  return copied;
end;
$$;

-- Unpaid remainders from every period before this one, per person.
create or replace function public.historic_debt(p_period_id uuid)
returns table (person_id uuid, full_name text, amount numeric, months integer)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select year * 12 + month as rank from public.periods where id = p_period_id
  )
  select
    s.person_id,
    concat_ws(' ', pe.first_name, pe.last_name) as full_name,
    sum(greatest(s.price - s.paid_amount, 0))::numeric as amount,
    count(*)::integer as months
  from public.stays s
  join public.people pe on pe.id = s.person_id
  join public.periods p on p.id = s.period_id
  cross join target t
  where (p.year * 12 + p.month) < t.rank
    and s.payment_method <> 'free'
    and s.price > s.paid_amount
  group by s.person_id, pe.first_name, pe.last_name
  order by amount desc;
$$;

-- ------------------------------------------------------- QR onboarding

create or replace function public.rotate_property_link(p_property_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare result uuid := gen_random_uuid();
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then
    raise exception 'access denied';
  end if;
  insert into public.property_links (property_id, public_token, is_active, rotated_at)
  values (p_property_id, result, true, now())
  on conflict (property_id) do update
    set public_token = result, is_active = true, rotated_at = now();
  return result;
end;
$$;

-- An address without a reachable form is an address nobody can apply to, so
-- both are created together.
create or replace function public.create_property_with_link(
  p_name text,
  p_full_address text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_capacity integer,
  p_monthly_cost numeric
) returns table (property_id uuid, public_token uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_property_id uuid;
  new_token uuid;
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then
    raise exception 'access denied';
  end if;

  insert into public.properties (name, full_address, contact_name, phone, email, capacity, monthly_cost)
  values (trim(p_name), trim(p_full_address), nullif(trim(p_contact_name), ''),
          nullif(trim(p_phone), ''), nullif(trim(p_email), ''), p_capacity, p_monthly_cost)
  returning id into new_property_id;

  insert into public.property_links (property_id)
  values (new_property_id)
  returning property_links.public_token into new_token;

  return query select new_property_id, new_token;
end;
$$;

-- Reachable by anonymous visitors: this is what the QR code resolves.
create or replace function public.public_property_by_token(p_token uuid)
returns table (property_id uuid, property_name text, full_address text)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.name, pr.full_address
  from public.property_links link
  join public.properties pr on pr.id = link.property_id
  where link.public_token = p_token
    and link.is_active
    and pr.status = 'active'
  limit 1;
$$;

create or replace function public.submit_housing_application(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_workplace text,
  p_passport_series text,
  p_passport_number text,
  p_ukraine_registration text,
  p_requested_move_in date,
  p_consent boolean,
  p_website text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_property_id uuid;
  new_application_id uuid;
begin
  -- Honeypot: a real person never sees the field, a bot fills it in.
  if coalesce(trim(p_website), '') <> '' then
    raise exception 'invalid submission';
  end if;
  if not p_consent then
    raise exception 'consent required';
  end if;

  select link.property_id into target_property_id
  from public.property_links link
  join public.properties pr on pr.id = link.property_id
  where link.public_token = p_token and link.is_active and pr.status = 'active';
  if target_property_id is null then
    raise exception 'link unavailable';
  end if;

  if exists (
    select 1 from public.housing_applications
    where property_id = target_property_id
      and passport_number = trim(p_passport_number)
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'application already submitted';
  end if;

  insert into public.housing_applications (
    property_id, first_name, last_name, phone, workplace, passport_series,
    passport_number, ukraine_registration, requested_move_in, consent_at
  ) values (
    target_property_id, trim(p_first_name), trim(p_last_name), trim(p_phone),
    nullif(trim(p_workplace), ''), nullif(trim(p_passport_series), ''),
    trim(p_passport_number), trim(p_ukraine_registration), p_requested_move_in, now()
  ) returning id into new_application_id;

  return new_application_id;
end;
$$;

create or replace function public.approve_housing_application(
  p_application_id uuid,
  p_period_id uuid,
  p_price numeric,
  p_payment_method public.payment_method,
  p_room_name text,
  p_bed_name text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  application public.housing_applications;
  new_person_id uuid;
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then
    raise exception 'access denied';
  end if;

  select * into application
  from public.housing_applications
  where id = p_application_id and status = 'pending'
  for update;
  if application.id is null then
    raise exception 'application not found';
  end if;

  new_person_id := public.create_resident_with_stay(
    p_period_id, application.first_name, application.last_name,
    application.phone, application.workplace, 'external',
    application.property_id, p_room_name, p_bed_name,
    application.requested_move_in, p_price, p_payment_method,
    'none'::public.deposit_status,
    application.passport_series, application.passport_number,
    application.ukraine_registration, 'Добавлен через QR-анкету'
  );

  update public.housing_applications
  set status = 'approved', person_id = new_person_id,
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_application_id;

  return new_person_id;
end;
$$;

create or replace function public.reject_housing_application(
  p_application_id uuid,
  p_reason text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then
    raise exception 'access denied';
  end if;
  update public.housing_applications
  set status = 'rejected', rejection_reason = nullif(trim(p_reason), ''),
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_application_id and status = 'pending';
end;
$$;

-- --------------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.periods enable row level security;
alter table public.properties enable row level security;
alter table public.rooms enable row level security;
alter table public.beds enable row level security;
alter table public.people enable row level security;
alter table public.resident_profiles_private enable row level security;
alter table public.stays enable row level security;
alter table public.payments enable row level security;
alter table public.property_expenses enable row level security;
alter table public.property_links enable row level security;
alter table public.housing_applications enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated
using (id = auth.uid() or public.has_role(array['admin']::public.app_role[]));
create policy profiles_admin_write on public.profiles for all to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

create policy periods_read on public.periods for select to authenticated using (true);
create policy periods_insert on public.periods for insert to authenticated
with check (public.has_role(array['admin','manager']::public.app_role[]));
create policy periods_update on public.periods for update to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));

create policy properties_read on public.properties for select to authenticated using (true);
create policy properties_insert on public.properties for insert to authenticated
with check (public.has_role(array['admin','manager']::public.app_role[]));
create policy properties_update on public.properties for update to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));
create policy properties_delete on public.properties for delete to authenticated
using (public.has_role(array['admin']::public.app_role[]));

create policy rooms_read on public.rooms for select to authenticated using (true);
create policy rooms_manage on public.rooms for all to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));

create policy beds_read on public.beds for select to authenticated using (true);
create policy beds_manage on public.beds for all to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));

create policy people_read on public.people for select to authenticated using (true);
create policy people_manage on public.people for all to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));

create policy private_profiles_read on public.resident_profiles_private for select to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]));
create policy private_profiles_manage on public.resident_profiles_private for all to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));

create policy stays_read on public.stays for select to authenticated using (true);
create policy stays_insert on public.stays for insert to authenticated
with check (public.has_role(array['admin','manager']::public.app_role[]));
create policy stays_update on public.stays for update to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));
create policy stays_delete on public.stays for delete to authenticated
using (public.has_role(array['admin']::public.app_role[]));

create policy payments_read on public.payments for select to authenticated
using (public.has_role(array['admin','manager','accountant']::public.app_role[]));
create policy payments_insert on public.payments for insert to authenticated
with check (public.has_role(array['admin','manager']::public.app_role[]));
create policy payments_delete on public.payments for delete to authenticated
using (public.has_role(array['admin']::public.app_role[]));

create policy expenses_read on public.property_expenses for select to authenticated
using (public.has_role(array['admin','manager','accountant']::public.app_role[]));
create policy expenses_insert on public.property_expenses for insert to authenticated
with check (public.has_role(array['admin','manager']::public.app_role[]));
create policy expenses_update on public.property_expenses for update to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));
create policy expenses_delete on public.property_expenses for delete to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]));

create policy links_read on public.property_links for select to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]));
create policy links_manage on public.property_links for all to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));

create policy applications_read on public.housing_applications for select to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]));
create policy applications_update on public.housing_applications for update to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));

create policy audit_read on public.audit_log for select to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]));

-- ------------------------------------------------------------------- views

create view public.stay_details
with (security_invoker = true)
as
select
  s.id, s.period_id, s.person_id, s.property_id, s.room_id, s.bed_id,
  concat_ws(' ', pe.first_name, pe.last_name) as full_name,
  pe.phone, pe.workplace, pe.kind as person_kind,
  pr.name as property_name, r.name as room_name, b.name as bed_name,
  s.move_in, s.move_out, s.price, s.paid_amount, s.payment_method,
  s.payment_status, s.deposit_status, s.comment
from public.stays s
join public.people pe on pe.id = s.person_id
left join public.properties pr on pr.id = s.property_id
left join public.rooms r on r.id = s.room_id
left join public.beds b on b.id = s.bed_id;

-- Money that is never charged is not debt, so `free` stays are excluded.
create view public.property_period_summary
with (security_invoker = true)
as
select
  p.id as period_id,
  pr.id, pr.name, pr.full_address, pr.contact_name, pr.phone, pr.email,
  pr.capacity, pr.monthly_cost, pr.status,
  count(s.id) filter (where s.move_out is null)::integer as occupied,
  coalesce(sum(
    case when s.payment_method = 'free' then 0
         else greatest(s.price - s.paid_amount, 0) end
  ), 0)::numeric as debt,
  coalesce(sum(s.paid_amount), 0)::numeric as collected,
  link.public_token
from public.periods p
cross join public.properties pr
left join public.stays s on s.period_id = p.id and s.property_id = pr.id
left join public.property_links link on link.property_id = pr.id and link.is_active
group by p.id, pr.id, link.public_token;

create view public.property_financial_summary
with (security_invoker = true)
as
select
  p.id as period_id,
  pr.id as property_id,
  pr.name as property_name,
  coalesce(sum(case when s.payment_method = 'free' then 0 else s.price end), 0) as charged,
  coalesce(sum(s.paid_amount), 0) as collected,
  coalesce(sum(
    case when s.payment_method = 'free' then 0
         else greatest(s.price - s.paid_amount, 0) end
  ), 0) as debt,
  pr.monthly_cost as base_cost,
  coalesce((select sum(e.amount) from public.property_expenses e
            where e.period_id = p.id and e.property_id = pr.id), 0) as expenses,
  coalesce(sum(s.paid_amount), 0) - pr.monthly_cost -
    coalesce((select sum(e.amount) from public.property_expenses e
              where e.period_id = p.id and e.property_id = pr.id), 0) as profit
from public.periods p
cross join public.properties pr
left join public.stays s on s.period_id = p.id and s.property_id = pr.id
where public.has_role(array['admin','manager','accountant']::public.app_role[])
group by p.id, pr.id;

-- ------------------------------------------------------------------ grants

grant select on public.stay_details, public.property_period_summary,
  public.property_financial_summary to authenticated;
grant select, insert, update, delete on public.property_links to authenticated;
grant select, update on public.housing_applications to authenticated;
grant select, insert, update, delete on public.property_expenses to authenticated;

grant execute on function public.ensure_period(integer, integer) to authenticated;
grant execute on function public.create_resident_with_stay(
  uuid, text, text, text, text, public.person_kind, uuid, text, text,
  date, numeric, public.payment_method, public.deposit_status, text, text, text, text
) to authenticated;
grant execute on function public.update_stay_details(
  uuid, uuid, text, text, numeric, public.payment_method, public.deposit_status, date, text
) to authenticated;
grant execute on function public.record_payment(uuid, numeric) to authenticated;
grant execute on function public.copy_period(uuid, uuid, boolean) to authenticated;
grant execute on function public.historic_debt(uuid) to authenticated;
grant execute on function public.rotate_property_link(uuid) to authenticated;
grant execute on function public.create_property_with_link(
  text, text, text, text, text, integer, numeric
) to authenticated;

-- The QR form is the only thing a stranger may reach.
revoke all on function public.public_property_by_token(uuid) from public;
revoke all on function public.submit_housing_application(
  uuid, text, text, text, text, text, text, text, date, boolean, text
) from public;
grant execute on function public.public_property_by_token(uuid) to anon, authenticated;
grant execute on function public.submit_housing_application(
  uuid, text, text, text, text, text, text, text, date, boolean, text
) to anon, authenticated;
grant execute on function public.approve_housing_application(
  uuid, uuid, numeric, public.payment_method, text, text
) to authenticated;
grant execute on function public.reject_housing_application(uuid, text) to authenticated;

revoke all on public.property_links from anon;
revoke all on public.housing_applications from anon;
revoke all on public.property_expenses from anon;
revoke all on public.stays from anon;
revoke all on public.people from anon;
revoke all on public.resident_profiles_private from anon;
