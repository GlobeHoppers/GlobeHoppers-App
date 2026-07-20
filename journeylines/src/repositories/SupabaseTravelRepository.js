import { requireSupabase } from '../lib/supabaseClient.js';
import { supabaseRowsToTravelMap } from '../adapters/supabaseToTravelMap.js';

export class SupabaseTravelRepository {
  constructor(mapId) {
    if (!mapId) throw new Error('A map ID is required to load cloud travel data.');
    this.mapId = mapId;
    this.client = requireSupabase();
  }

  async loadTravelMap() {
    const { data: map, error: mapError } = await this.client
      .from('travel_maps')
      .select('id, owner_id, name, description, slug, is_public, created_at, updated_at')
      .eq('id', this.mapId)
      .single();
    if (mapError) throw mapError;

    const [hoppersResult, tripsResult] = await Promise.all([
      this.client
        .from('hoppers')
        .select('id, map_id, name, color, avatar_url, sort_order, is_active, created_at, updated_at')
        .eq('map_id', this.mapId)
        .order('sort_order', { ascending: true }),
      this.client
        .from('trips')
        .select('id, map_id, title, start_date, end_date, notes, sort_order, occasion, trail_style, trail_color_mode, created_at, updated_at')
        .eq('map_id', this.mapId)
        .order('start_date', { ascending: true })
        .order('sort_order', { ascending: true })
    ]);

    if (hoppersResult.error) throw hoppersResult.error;
    if (tripsResult.error) throw tripsResult.error;

    const tripIds = (tripsResult.data || []).map(row => row.id);
    let legs = [];
    let tripHoppers = [];
    let locations = [];

    if (tripIds.length) {
      const [legsResult, linksResult] = await Promise.all([
        this.client
          .from('trip_legs')
          .select('id, trip_id, from_location_id, to_location_id, transport_mode, leg_order, departure_date, arrival_date, route_label, notes, route_geometry, route_provider, route_version, created_at, updated_at')
          .in('trip_id', tripIds)
          .order('leg_order', { ascending: true }),
        this.client
          .from('trip_hoppers')
          .select('id, trip_id, hopper_id, created_at, updated_at')
          .in('trip_id', tripIds)
      ]);
      if (legsResult.error) throw legsResult.error;
      if (linksResult.error) throw linksResult.error;
      legs = legsResult.data || [];
      tripHoppers = linksResult.data || [];

      const locationIds = [...new Set(legs.flatMap(leg => [leg.from_location_id, leg.to_location_id]).filter(Boolean))];
      if (locationIds.length) {
        const locationsResult = await this.client
          .from('locations')
          .select('id, name, region, country, continent, latitude, longitude, created_at, updated_at')
          .in('id', locationIds);
        if (locationsResult.error) throw locationsResult.error;
        locations = locationsResult.data || [];
      }
    }

    return supabaseRowsToTravelMap({
      map,
      hoppers: hoppersResult.data || [],
      trips: tripsResult.data || [],
      legs,
      tripHoppers,
      locations
    });
  }
}
