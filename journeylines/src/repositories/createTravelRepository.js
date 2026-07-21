import { SupabaseTravelRepository } from './SupabaseTravelRepository.js';

/**
 * Creates the active travel repository.
 *
 * Cloud account mode is the only repository path currently used by App.jsx.
 * Keeping repository creation in one module prevents UI components from
 * constructing Supabase clients or bypassing the account map boundary.
 */
export function createTravelRepository({ cloudEnabled = false, mapId = null } = {}) {
  if (!cloudEnabled) {
    throw new Error('The legacy JSON travel repository is not available through this factory.');
  }

  if (!mapId) {
    throw new Error('A selected travel map is required for cloud travel data.');
  }

  return new SupabaseTravelRepository(mapId);
}
