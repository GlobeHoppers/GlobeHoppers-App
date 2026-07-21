import baseTrips from '../data/trips.json';
import baseLocations from '../data/locations.json';
import baseHoppers from '../data/hoppers.json';
import homeBases from '../data/homeBases.json';
import { normalizeTripsForV61 } from '../utils/tripModel.js';

export class JsonTravelRepository {
  async loadTravelMap() {
    return {
      map: { id: 'legacy-json', name: 'Legacy GlobeHoppers Archive' },
      trips: normalizeTripsForV61(baseTrips, homeBases),
      locations: baseLocations,
      hopperData: baseHoppers
    };
  }
}
