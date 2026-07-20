begin;

-- v8.2 read model additions. These columns preserve GlobeHoppers route and
-- presentation metadata while keeping trips and legs normalized.
alter table public.trips
  add column if not exists occasion text,
  add column if not exists trail_style text not null default 'solid',
  add column if not exists trail_color_mode text not null default 'members',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.trip_legs
  add column if not exists route_geometry jsonb,
  add column if not exists route_provider text,
  add column if not exists route_version text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.trip_legs.route_geometry is
  'Optional serialized route geometry used by GlobeHoppers playback and rendering.';
comment on column public.trip_legs.route_provider is
  'Provider that produced route_geometry, for example Mapbox or Valhalla.';
comment on column public.trip_legs.route_version is
  'Route-generation or schema version associated with route_geometry.';

commit;
