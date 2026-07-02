-- Current application storage: one complete inventory snapshot per authenticated user.
-- Row-level security prevents one account from reading or changing another account's data.
create table if not exists public.inventory_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.inventory_snapshots enable row level security;

drop policy if exists "owner_read_inventory_snapshot" on public.inventory_snapshots;
create policy "owner_read_inventory_snapshot"
on public.inventory_snapshots for select
using (auth.uid() = user_id);

drop policy if exists "owner_insert_inventory_snapshot" on public.inventory_snapshots;
create policy "owner_insert_inventory_snapshot"
on public.inventory_snapshots for insert
with check (auth.uid() = user_id);

drop policy if exists "owner_update_inventory_snapshot" on public.inventory_snapshots;
create policy "owner_update_inventory_snapshot"
on public.inventory_snapshots for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.inventory_snapshots from anon;
grant select, insert, update on public.inventory_snapshots to authenticated;
