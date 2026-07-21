-- GlobeHoppers v8.2 Work Package 2
-- Confirms authenticated Hopper CRUD privileges and RLS state.
-- Safe to run more than once.

alter table public.hoppers enable row level security;
grant select, insert, update, delete on table public.hoppers to authenticated;

create index if not exists hoppers_map_sort_order_idx
  on public.hoppers(map_id, sort_order, name);
