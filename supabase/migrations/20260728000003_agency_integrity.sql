-- Agency statements contain financial data. Keep their database access aligned
-- with the UI: viewer may see housing occupancy, but not agency prices/totals.
drop policy if exists agency_allocations_read on public.agency_allocations;
create policy agency_allocations_read on public.agency_allocations
for select to authenticated
using (public.has_role(array['admin','manager','accountant']::public.app_role[]));

-- Replace the first migration's validator with stricter month isolation and a
-- database-level closed-period guard. UI controls are convenience, not security.
create or replace function public.validate_agency_allocation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  period_start date;
  period_end date;
  period_closed boolean;
begin
  new.room_name := nullif(trim(new.room_name), '');
  new.bed_name := nullif(trim(new.bed_name), '');
  new.note := nullif(trim(new.note), '');

  select make_date(year, month, 1),
         (make_date(year, month, 1) + interval '1 month - 1 day')::date,
         is_closed
  into period_start, period_end, period_closed
  from public.periods
  where id = new.period_id;

  if period_start is null then
    raise exception 'selected period does not exist';
  end if;

  if period_closed then
    raise exception 'period is closed';
  end if;

  if new.start_date < period_start or new.end_date > period_end then
    raise exception 'allocation dates are outside the selected period';
  end if;

  if exists (
    select 1
    from public.agency_allocations existing
    where existing.period_id = new.period_id
      and existing.property_id = new.property_id
      and existing.id is distinct from new.id
      and (
        existing.room_name is null
        or new.room_name is null
        or (
          lower(existing.room_name) = lower(new.room_name)
          and (
            existing.bed_name is null
            or new.bed_name is null
            or lower(existing.bed_name) = lower(new.bed_name)
          )
        )
      )
  ) then
    raise exception 'housing space is already allocated in this period';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_agency_allocation_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (select is_closed from public.periods where id = old.period_id) then
    raise exception 'period is closed';
  end if;
  return old;
end;
$$;

drop trigger if exists guard_agency_allocation_delete_before_write
  on public.agency_allocations;
create trigger guard_agency_allocation_delete_before_write
before delete on public.agency_allocations
for each row execute function public.guard_agency_allocation_delete();

-- Extend the existing immutable audit trail to the newly introduced entities.
drop trigger if exists agencies_audit on public.agencies;
create trigger agencies_audit
after insert or update or delete on public.agencies
for each row execute function public.audit_changes();

drop trigger if exists agency_allocations_audit on public.agency_allocations;
create trigger agency_allocations_audit
after insert or update or delete on public.agency_allocations
for each row execute function public.audit_changes();

comment on function public.guard_agency_allocation_delete() is
  'Prevents agency statement rows from being deleted after a monthly period is closed.';
