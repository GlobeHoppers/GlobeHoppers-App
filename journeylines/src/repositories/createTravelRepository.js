import { JsonTravelRepository } from './JsonTravelRepository.js';
import { SupabaseTravelRepository } from './SupabaseTravelRepository.js';

export function createTravelRepository({ cloudEnabled, mapId }) {
  if (cloudEnabled && mapId) return new SupabaseTravelRepository(mapId);
  return new JsonTravelRepository();
}
