begin;

-- GlobeHoppers v8.2 Work Package 5
-- Securely delete one private trip using optimistic concurrency.
-- Existing foreign keys cascade deletion to trip_legs and trip_hoppers.

create or replace function public.delete_private_trip(
  p_map_id uuid,
  p_trip_id uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  deleted_trip_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_map_id is null or p_trip_id is null or not private.can_edit_map(p_map_id) then
    raise exception 'You do not have permission to edit this travel map.' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'The trip revision is missing. Reload the trip before deleting.' using errcode = 'P0001';
  end if;

  delete from public.trips
   where id = p_trip_id
     and map_id = p_map_id
     and updated_at = p_expected_updated_at
  returning id into deleted_trip_id;

  if deleted_trip_id is null then
    if exists (select 1 from public.trips where id = p_trip_id and map_id = p_map_id) then
      raise exception 'This trip changed in another session. Reload before deleting.' using errcode = 'P0001';
    end if;
    raise exception 'The requested trip was not found in this travel map.' using errcode = 'P0002';
  end if;

  return deleted_trip_id;
end;
$$;

revoke all on function public.delete_private_trip(uuid, uuid, timestamptz) from public;
revoke all on function public.delete_private_trip(uuid, uuid, timestamptz) from anon;
grant execute on function public.delete_private_trip(uuid, uuid, timestamptz) to authenticated;

comment on function public.delete_private_trip(uuid, uuid, timestamptz) is
  'Deletes one private GlobeHoppers trip after map-permission and optimistic-concurrency checks.';

commit;
