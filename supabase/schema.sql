-- Shared expense storage for the Group Expense Tracker.
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- It is safe to run again; it does not touch any other table.

create table if not exists public.group_expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  -- paid_by and split_among hold the member's sign-in email (see src/lib/members.js)
  paid_by text not null,
  split_among text[] not null check (cardinality(split_among) > 0),
  expense_date date not null default current_date,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

-- Readable name of whoever paid (paid_by), e.g. 'Suri' or 'Group fund'. Set by the app.
alter table public.group_expenses add column if not exists name text;

create index if not exists group_expenses_date_idx
  on public.group_expenses (expense_date desc, created_at desc);

alter table public.group_expenses enable row level security;

revoke all on public.group_expenses from anon;
grant select, insert, delete on public.group_expenses to authenticated;

-- Every signed-in account is a group member, so all of them can read, add and delete.
-- Keep public sign-ups disabled (Authentication → Sign In / Providers) so only the
-- four accounts you created can get in.
drop policy if exists "Members can read expenses" on public.group_expenses;
create policy "Members can read expenses"
  on public.group_expenses for select to authenticated
  using (true);

drop policy if exists "Members can add expenses" on public.group_expenses;
create policy "Members can add expenses"
  on public.group_expenses for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Members can delete expenses" on public.group_expenses;
create policy "Members can delete expenses"
  on public.group_expenses for delete to authenticated
  using (true);

-- Live updates: other members' changes appear without a page refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_expenses'
  ) then
    alter publication supabase_realtime add table public.group_expenses;
  end if;
end $$;
